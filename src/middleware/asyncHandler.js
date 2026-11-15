/** Forwards rejected promises to the error handler, so routes need no try/catch boilerplate. */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
