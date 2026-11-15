module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/repositories/firestoreRepo.js', // needs a live Firestore; covered by the memory repo contract
  ],
};