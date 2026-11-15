require('dotenv').config({ quiet: true });

const isProd = process.env.NODE_ENV === 'production';

function secret(name, devDefault) {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`${name} must be set in production`);
  return devDefault;
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 8080,
  jwtSecret: secret('JWT_SECRET', 'dev-only-jwt-secret'),
  cronSecret: secret('CRON_SECRET', 'dev-only-cron-secret'),
  repo: process.env.REPO || (isProd ? 'firestore' : 'memory'),
  timezone: 'Asia/Kolkata',
};