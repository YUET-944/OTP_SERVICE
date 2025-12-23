module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/tests/smoke/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/smoke/setup.js'],
  collectCoverage: false,
  verbose: true,
  testTimeout: 30000,
};
