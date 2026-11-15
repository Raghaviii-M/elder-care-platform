module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/repositories/firestoreRepo.js', // needs a live Firestore; covered by the memory repo contract
  ],
  coverageThreshold: { global: { statements: 80, branches: 60, functions: 80, lines: 80 } },
};
