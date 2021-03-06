

const async = require('async-q');
const _ = require('lodash');
const amqp = require('amqplib');
const uuid = require('uuid/v4');
const url = require('url');
const promiseRetry = require('promise-retry');

const debug = require('./lib/logger')('microservice-kit:amqpkit');
const Message = require('./lib/message');
const Response = require('./lib/response');
const Router = require('./lib/router');
const Queue = require('./lib/queue');
const Exchange = require('./lib/exchange');
const RPC = require('./lib/rpc');
const ShutdownKit = require('./shutdownkit');


class AmqpKit {
  /**
     * @param {Object=} opt_options
     *                    url, rpc, queues, exchanges
     */
  constructor(opt_options) {
    this.options_ = _.assign({}, this.defaults, opt_options || {});
    this.initializeFields();
  }

  initializeFields() {
    this.connection = null;
    this.connectionShouldClose = false;
    this.channel = null;
    this.rpc_ = null;
    this.queues_ = {};
    this.exchanges_ = {};
  }


  /**
     * Connects to rabbitmq, creates channel and creates rpc queue if needed.
     * @return {Promise.<this>}
     */
  init() {
    if (this.options_.exchanges && !Array.isArray(this.options_.exchanges)) {
      throw new Error('MicroserviceKit init failed. ' +
                'options.exchanges must be an array.');
    }

    if (this.options_.queues && !Array.isArray(this.options_.queues)) {
      throw new Error('MicroserviceKit init failed. ' +
                'options.queues must be an array.');
    }

    if (this.options_.url) {
      this.options_.connectionOptions = _.assign(this.options_.connectionOptions, {
        servername: url.parse(this.options_.url).hostname,
      });
    }

    return this.attemptConnection(1);
  }

  doSetup() {
    return amqp
      .connect(this.options_.url, this.options_.connectionOptions)
      .then((connection) => {
        this.connection = connection;
        const jobs = [
          connection.createChannel(),
        ];

        if (this.options_.rpc) {
          this.rpc_ = new RPC({ logger: this.options_.logger });
          const rpcQueueName = `${this.options_.id}-rpc`;
          jobs.push(this.rpc_.init(connection, rpcQueueName));
        }

        return Promise.all(jobs);
      })
      .then((channels) => {
        this.channel = channels[0];
        this.channel.on('close',() => {
          debug('closing channel');
        });
        this.bindEvents();
        return this;
      })
      .then(() => {
        const queues = this.options_.queues || [];
        debug(`Asserting ${queues.length} queues`);
        return async.mapLimit(queues, 5, (item, index) => this.createQueue(item.key, item.name, item.options));
      })
      .then(() => {
        const exchanges = this.options_.exchanges || [];
        debug(`Asserting ${exchanges.length} exchanges`);
        return async.mapLimit(exchanges, 5, (item, index) => this.createExchange(item.key, item.name, item.type, item.options));
      });
  }

  attemptConnection(waitInsec) {
    if (this.connectionShouldClose) {
      return;
    }
    waitInsec = waitInsec || 2000;
    ShutdownKit.jobs_ = [];
    return this.wait(waitInsec)
      .then(() => {
        return promiseRetry((retry, number) => {
          debug('attempt#', number);
          return this.doSetup()
            .catch(retry);
        }, {
          retries: 3,
          minTimeout: 5000
        });
      });
  }

  wait(timeInMs) {
    return new Promise(function(resolve) {
      debug(`wait: ${timeInMs} ms`);
      return setTimeout(resolve, timeInMs);
    });
  };

  /**
     * Bind rabbitmq's connection events.
     */
  bindEvents() {
    this.connection.on('close', () => {
      debug('connection closed');
      this.initializeFields();
      this.attemptConnection()
        .catch(() => ShutdownKit.gracefulShutdown())
    });

    this.connection.on('error', (err) => {
      debug('connection error', err && err.stack ? err.stack : err);
    });

    this.connection.on('blocked', () => {
      debug('connection blocked');
      this.attemptConnection()
        .catch(() => ShutdownKit.gracefulShutdown())
    });

    this.connection.on('unblocked', () => {
      debug('connection unblocked');
      this.attemptConnection()
        .catch(() => ShutdownKit.gracefulShutdown())
    });

    ShutdownKit.addJob((done) => {
      debug('info','Closing connection due to SIGx...');
      if(this.connectionShouldClose) {
        return;
      }
      try {
        this.connectionShouldClose = true;
        this.connection
          .close()
          .then(() => {
            done();
          })
          .catch(done);
      } catch (err) {
        debug('Could not close connection', err);
        done();
      }
    });
  }


  /**
     * prefetch wrapper function.
     */
  prefetch(count, opt_global) {
    return this.channel.prefetch(count, opt_global);
  }


  /**
     * Returns queue by key
     * @param {string} queueKey
     */
  getQueue(queueKey) {
    return this.queues_[queueKey];
  }


  /**
     * Returns echange by key
     * @param {string} exchangeKey
     */
  getExchange(exchangeKey) {
    return this.exchanges_[exchangeKey];
  }


  /**
     * Creates a queue.
     * @param {string} key
     * @param {string} name
     * @param {Object=} opt_options
     * @return {Promise}
     */
  createQueue(key, name, opt_options) {
    if (!key) { return Promise.reject(new Error('You cannot create queue without key.')); }

    if (this.queues_[key]) { return Promise.reject(new Error('You cannot create queue with same key more than once.')); }

    if (!name && opt_options && opt_options.exclusive) { name = `${this.options_.id}-` + 'excl' + `-${uuid().split('-')[0]}`; }

    const queue = new Queue({
      channel: this.channel,
      name,
      options: opt_options,
      rpc: this.rpc_,
      logger: this.options_.logger,
    });

    return queue.init()
      .then(() => {
        this.queues_[key] = queue;
        debug(`Asserted queue: ${queue.name}`);
        return queue;
      });
  }


  /**
     * Creates an exchange.
     * @param {string} key
     * @param {string} name
     * @param {string} type
     * @param {Object=} opt_options
     * @return {Promise}
     */
  createExchange(key, name, type, opt_options) {
    if (!key) { return Promise.reject(new Error('You cannot create exchange without key.')); }

    if (this.exchanges_[key]) { return Promise.reject(new Error('You cannot create exchange with same key more than once.')); }

    const exchange = new Exchange({
      channel: this.channel,
      name,
      type,
      options: opt_options,
      rpc: this.rpc_,
      logger: this.options_.logger,
    });

    return exchange.init()
      .then((exchange) => {
        this.exchanges_[key] = exchange;
        debug(`Asserted exchange: ${exchange.name}`);
        return exchange;
      });
  }
}


/**
 * Default options.
 * @type {Object}
 */
AmqpKit.prototype.defaults = {
  id: 'microservice-default-id',
  rpc: true,
  logger: null,
  connectionOptions: {},
};


module.exports = AmqpKit;
