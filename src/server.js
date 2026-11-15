const config = require('./config');
const { createApp } = require('./app');
const { MemoryRepo } = require('./repositories/memoryRepo');

function buildRepo() {
  if (config.repo === 'firestore') {
    const { FirestoreRepo } = require('./repositories/firestoreRepo');
    return new FirestoreRepo();
  }
  return new MemoryRepo();
}

createApp({ repo: buildRepo() }).listen(config.port, () => {
  console.log(`Elder Care running on port ${config.port} (${config.repo} store)`);
});