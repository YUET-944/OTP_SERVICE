const { api } = require('./request');

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'local-admin-key';

const adminGet = (path) => api().get(path).set('x-api-key', ADMIN_API_KEY);
const adminPost = (path) => api().post(path).set('x-api-key', ADMIN_API_KEY);

module.exports = {
  adminGet,
  adminPost,
  ADMIN_API_KEY,
};
