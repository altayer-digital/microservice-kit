const _ = require('lodash');
const debug = require('debug');

module.exports = function getLogger(name, logger) {
  const log = debug(name);
  return function () {
    log(...arguments);

    if (_.isFunction(logger)) { logger(...arguments); }
  };
};
