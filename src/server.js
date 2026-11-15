const config = require('./config');
const { createApp } = require('./app');
const { MemoryRepo } = require('./repositories/memoryRepo');
const { seedDemo } = require('./seed');

function buildRepo() {
  if (config.repo === 'firestore') {
    const { FirestoreRepo } = require('./repositories/firestoreRepo');
    return new FirestoreRepo();
  }
  return new MemoryRepo();
}

async function main() {
  const repo = buildRepo();
  if (config.seedDemo) await seedDemo(repo);
  createApp({ repo }).listen(config.port, () => {
    console.log(`CareCircle running on port ${config.port} (${config.repo} store)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
