const { createCrudRouter } = require('./crud');
const { appointmentSchema } = require('../schemas');

module.exports = (repo) =>
  createCrudRouter(repo, {
    kind: 'appointments',
    schema: appointmentSchema,
    createRoles: ['caretaker', 'family'],
    sort: (a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
    describe: {
      prefix: 'appt',
      added: (a) => `Appointment added: ${a.title} on ${a.date} at ${a.time}`,
      updated: (a) => `Appointment updated: ${a.title}`,
      removed: (a) => `Appointment removed: ${a.title}`,
    },
  });
