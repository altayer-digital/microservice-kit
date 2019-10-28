

const _ = require('lodash');
const async = require('async');

const debug = require('./lib/logger')('microservice-kit:shutdownkit');

class ShutdownKit {
  constructor() {
    this.jobs_ = [];
    this.bindEvents_();
    this.isShuttingDown = false;
    this.defaultOptions_ = {
      killTimeout: Infinity,
    };
    this.options_ = {};
  }

  /***
   * set options
   * @param opt_options
   */
  setoptions(opt_options) {
    const defaultKeys = _.keys(this.defaultOptions_);
    const filteredOptions = _.pick(opt_options, defaultKeys)
    this.options_ = Object.assign({}, this.defaultOptions_, filteredOptions);
  }

  /**
     * Add a job to graceful shutdown process.
     * @param {Function} job Function of job. Do not forget to call done function!
     */
  addJob(job) {
    this.jobs_.push(job);
  }


  /**
     * Binds common termination signals.
     */
  bindEvents_() {
    process.on('uncaughtException', this.onUncaughtException_.bind(this));
    process.on('SIGTERM', this.onSigTerm_.bind(this));
    process.on('SIGINT', this.onSigInt_.bind(this));
    process.on('exit', () => {
      debug('info', 'Processing is exiting...');
    });
  }


  /**
     * On uncaught exception.
     * @param {Error} err
     */
  onUncaughtException_(err) {
    debug('error', 'Uncaught Exception received!', err);
    this.gracefulShutdown();
  }


  /**
     * On SIGTERM
     */
  onSigTerm_() {
    debug('info', 'SIGTERM received!');
    this.gracefulShutdown();
  }


  /**
     * On SIGINT
     */
  onSigInt_() {
    debug('info', 'SIGINT received!');
    this.gracefulShutdown();
  }


  /**
     * Tries to do all the jobs before shutdown.
     */
  gracefulShutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    ['SIGTERM', 'SIGINT'].forEach((signal) => {
      process.removeAllListeners(signal);
    });

    debug('info', 'Trying to shutdown gracefully...');
    let timeoutSeries = async.series;
    const killTimeout = parseFloat(this.options_.killTimeout);
    debug('info', `will be destroyed in ${killTimeout} ms`);
    if (killTimeout < Infinity) {
      timeoutSeries = async.timeout(async.series, killTimeout);
    }
    timeoutSeries(this.jobs_.reverse(), (err) => {
      if (err) {
        debug('error', 'Some jobs failed', err);
        debug('info', 'Quiting anyway...');
      } else { debug('info', 'All jobs done, quiting...'); }

      this.exit_();
    });
  }


  /**
     * Exists current process.
     */
  exit_() {
    debug('info', 'Bye!', process.pid);
    process.kill(process.pid, 'SIGKILL');
  }
}


// Singleton
if (!global.shutdownKit_) { global.shutdownKit_ = new ShutdownKit(); }

module.exports = global.shutdownKit_;
