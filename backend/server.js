'use strict';

/**
 * server.js — Process entry point.
 *
 * Responsibilities:
 *   1. Load environment variables
 *   2. Validate environment (env.js exits if required vars are missing)
 *   3. Connect to MongoDB
 *   4. Start the HTTP server
 *   5. Handle graceful shutdown on SIGTERM / SIGINT
 *
 * Application logic, middleware, and route definitions live in app.js.
 */

if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
}

const env = require('./src/config/env');           // validates env vars first
const { connectDB, disconnectDB } = require('./src/config/db');
const createApp = require('./app');

const app = createApp();
let server;

async function start() {
  // Use the host/container resolver so MongoDB honors deployment DNS policy.
  await connectDB();

  server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] CYBER-AGENT AI backend running on port ${env.port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
    console.log(`[server] CORS allowed origins: ${env.corsOrigins.join(', ')}`);
  });
}

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down gracefully…`);
  if (server) {
    server.close(async () => {
      await disconnectDB();
      console.log('[server] Shutdown complete.');
      process.exit(0);
    });
  } else {
    await disconnectDB();
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
  shutdown('unhandledRejection').catch(() => process.exit(1));
});

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});