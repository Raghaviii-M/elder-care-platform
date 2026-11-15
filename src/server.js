const config = require('./config');
const { createApp } = require('./app');
const { MemoryRepo } = require('./repositories/memoryRepo');

// Firestore repo comes in Phase 2; memory repo for now
const repo = new MemoryRepo();

createApp({ repo }).listen(config.port, () => {
  console.log(`Elder Care running on http://localhost:${config.port}`);
});