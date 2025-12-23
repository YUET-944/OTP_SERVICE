module.exports = [
  {
    type: 'email',
    identifier: 'alice@example.com',
    purpose: 'login',
    preGeneratedOtp: '123456',
  },
  {
    type: 'phone',
    identifier: '+923001112223',
    purpose: 'login',
    preGeneratedOtp: '654321',
  },
  {
    type: 'email',
    identifier: 'bob@example.com',
    purpose: 'reset',
  },
  {
    type: 'phone',
    identifier: '+923001112224',
    purpose: 'reset',
  },
];
