

const _ = require('lodash');

const debug = require('./logger')('microservice-kit:lib:rpc');
const Response = require('./response');
const Queue = require('./queue');


class RPC {
  constructor(opt_options) {
    this.initialized = false;
    this.queue_ = null;
    this.channel_ = null;
    this.callbacks_ = {};
    this.timeouts_ = {};
    this.logger_ = _.isObject(opt_options) && opt_options.logger;
    this.registerDates_ = {};
  }


  /**
     * Init rpc manager.
     */
  init(connection, opt_queueName) {
    debug('Initializing rpc channel.');
    return connection
      .createChannel()
      .then((channel) => {
        debug('rpc channel initialized.');

        this.channel_ = channel;
        this.queue_ = new Queue({
          name: opt_queueName,
          options: { exclusive: true },
          channel: this.channel_,
        });

        debug('Initializing rpc queue.');
        return this.queue_.init();
      })
      .then(() => {
        debug('rpc queue initialized.');
        debug('Consuming rpc queue...');
        return this.queue_.consumeRaw_(this.consumer.bind(this), { noAck: true });
      })
      .then(() => {
        debug('rpc initialized.');
        this.initialized = true;
      });
  }


  /**
     * Handles messages coming from rpc queue.
     * @param {Object} msg
     */
  consumer(msg) {
    const correlationId = msg.properties.correlationId;

    if (!this.initialized || !correlationId || !this.callbacks_[correlationId]) { return; }

    const callbacks = this.callbacks_[correlationId];

    try {
      const response = Response.parseMessage(msg);

      if (!response.done) {
        callbacks.progress && callbacks.progress(response.payload);
        return;
      }

      if (this.registerDates_[correlationId]) {
        const duration = new Date() - this.registerDates_[correlationId];
        this.log_('info', 'Got response', { correlationId, duration });
        delete this.registerDates_[correlationId];
      }

      if (response.err) { callbacks.reject(response.err); } else { callbacks.resolve(response.payload); }

      if (this.timeouts_[correlationId]) {
        clearTimeout(this.timeouts_[correlationId]);
        delete this.timeouts_[correlationId];
      }

      delete this.callbacks_[correlationId];
    } catch (err) {
      this.log_('error', 'Cannot consume rpc message, probably json parse error.', { msg, err });
    }
  }

  getUniqueQueueName() {
    return this.queue_.getUniqueName();
  }

  registerCallback(key, funcs, opt_timeout) {
    this.callbacks_[key] = funcs;
    this.registerDates_[key] = new Date();

    if (_.isNumber(opt_timeout) && opt_timeout > 0) {
      this.timeouts_[key] = setTimeout(() => {
        const callbacks = this.callbacks_[key];
        callbacks && callbacks.reject && callbacks.reject(new Error('Timeout exceed.'));
        this.log_('info', 'Timeout exceed', { correlationId: key });
        delete this.callbacks_[key];
        delete this.timeouts_[key];
        delete this.registerDates_[key];
      }, opt_timeout);
    }
  }

  getCallback(key) {
    return this.callbacks_[key];
  }


  /**
     * Log methods. It uses debug module but also custom logger method if exists.
     */
  log_() {
    debug(...arguments);

    if (!_.isFunction(this.logger_)) { return; }

    this.logger_.apply(null, arguments);
  }
}


module.exports = RPC;
