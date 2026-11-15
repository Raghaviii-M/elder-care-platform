const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp({ repo }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Cloud Run sits behind a proxy; needed for correct rate-limit IPs

  app.use(helmet()); // default CSP blocks inline scripts, so keep all JS in files
  app.use(compression());
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', authRoutes(repo));
  // Phase 2 routes (medications, doses, appointments) get mounted here

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };