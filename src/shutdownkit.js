

const _ = require('lodash');
const async = require('async');

const debug = require('./lib/logger')('microservice-kit:shutdownkit');

class ShutdownKit {
  constructor() {
    // Force resume node process!
    process.stdin.resume();
    this.jobs_ = [];
    this.bindEvents_();
    this.isShuttingDown = false;
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
    // TODO: Add a timeout maybe?
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    debug('info', 'Trying to shutdown gracefully...');
    async.series(this.jobs_.reverse(), (err) => {
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
    debug('info', 'Bye!');
    process.exit();
  }
}


// Singleton
if (!global.shutdownKit_) { global.shutdownKit_ = new ShutdownKit(); }

module.exports = global.shutdownKit_;
