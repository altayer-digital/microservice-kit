const _ = require('lodash');
const debug = require('debug');

const loggerDefault = function (name) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(`${name}:`);
    console.log.apply(console, args);
  };
};

module.exports = function getLogger(name, logger) {
  logger = logger || loggerDefault(name);
  const log = debug(name);
  return function () {
    log(...arguments);

    if (_.isFunction(logger)) { logger(...arguments); }
  };
};
