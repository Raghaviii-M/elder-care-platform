const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const authRoutes = require('./routes/auth');
const medicationRoutes = require('./routes/medications');
const doseRoutes = require('./routes/doses');
const appointmentRoutes = require('./routes/appointments');
const internalRoutes = require('./routes/internal');
const { createEmailService } = require('./services/emailService');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp({ repo, email = createEmailService() }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy: needed for correct rate-limit IPs

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        // only force https in production, so http://localhost works in every browser
        directives: { 'upgrade-insecure-requests': config.isProd ? [] : null },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', authRoutes(repo));
  app.use('/api/medications', medicationRoutes(repo));
  app.use('/api/doses', doseRoutes(repo));
  app.use('/api/appointments', appointmentRoutes(repo));
  app.use('/api/internal', internalRoutes({ repo, email }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
