/**
 * Integration tests run against a real PostgreSQL database.
 * Set TEST_DATABASE_URL (the database is reset by the tests - never point it at real data).
 */
const base = require('./jest.config');

module.exports = {
  ...base,
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/integration/setup-env.ts'],
  globalSetup: '<rootDir>/tests/integration/global-setup.ts',
  maxWorkers: 1,
};
