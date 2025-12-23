const supertest = require('supertest');
const { app } = require('../../../src/app');

const api = () => supertest(app);

module.exports = {
  api,
};
