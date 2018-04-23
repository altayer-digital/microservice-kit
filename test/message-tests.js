

const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const chaiAsPromised = require('chai-as-promised');

const should = chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);

const Message = require('../src/lib/message');
const ErrorTypes = require('../src/lib/errors');


describe('Message', () => {
  describe('#parse', () => {
    it('should parse eventName', () => {
      const eventName = 'event1';
      const raw = { eventName };

      const message = Message.parse(raw);
      message.eventName.should.equal(eventName);
    });

    it('should parse payload', () => {
      const payload = { foo: 'bar' };
      const raw = { payload };

      const message = Message.parse(raw);
      message.payload.should.deep.equal(payload);
    });

    it('should set payload to empty object if not provided', () => {
      const raw = {};
      const message = Message.parse(raw);
      message.payload.should.be.an('object');
    });
  });
});
