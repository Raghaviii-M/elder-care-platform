const { createCrudRouter } = require('./crud');
const { medSchema } = require('../schemas');

module.exports = (repo) =>
  createCrudRouter(repo, {
    kind: 'medications',
    schema: medSchema,
    createRoles: ['caretaker'],
    sort: (a, b) => a.name.localeCompare(b.name),
    describe: {
      prefix: 'med',
      added: (m) => `Caretaker added ${m.name} ${m.dosage} at ${m.times.join(', ')}`,
      updated: (m) => `Caretaker updated ${m.name}`,
      removed: (m) => `Caretaker removed ${m.name}`,
    },
  });
