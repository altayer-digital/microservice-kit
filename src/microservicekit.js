

const _ = require('lodash');
const uuid = require('uuid/v4');
const Chance = require('chance');

const debug = require('./lib/logger')('microservice-kit:microservicekit');
const AmqpKit = require('./amqpkit');
const ShutdownKit = require('./shutdownkit');


class MicroserviceKit {
  constructor(opt_options) {
    this.options_ = _.assign({}, this.defaults, opt_options || {});
    this.id = `${new Chance().first().toLowerCase()}-${uuid().split('-')[0]}`;
    this.amqpKit = null;
    this.shutdownKit = ShutdownKit;
  }


  init() {
    this.shutdownKit.setoptions(this.options_.shutdown);
    if (!this.options_.amqp) { return Promise.resolve(); }
    const amqpOptions = _.assign({}, this.options_.amqp, { id: this.getName() });
    this.amqpKit = new AmqpKit(amqpOptions);
    return this.amqpKit.init();
  }


  getName() {
    return `${this.options_.type}-${this.id}`;
  }
}


MicroserviceKit.prototype.defaults = {
  type: 'microservice',
  amqp: {},
  shutdown: {
    killTimeout: Infinity,
  },
};


module.exports = MicroserviceKit;
