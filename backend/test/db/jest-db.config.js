/**
 * DB testlari (npm run test:db) — Docker'dagi PostgreSQL kerak.
 * `npm test` bularni ishga tushirmaydi (u faqat *.spec.ts ni oladi).
 */
module.exports = {
  rootDir: '../..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/db/.*\\.db-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/db/global-setup.ts',
};
