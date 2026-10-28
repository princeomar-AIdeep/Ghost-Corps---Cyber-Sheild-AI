'use strict';

const mongoose = require('mongoose');
const env = require('./env');

let isConnected = false;

if (typeof mongoose.set === 'function') {
  mongoose.set('sanitizeFilter', true);
}

async function connectDB(retries = 3) {
  if (isConnected) return;

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(env.mongoUri, {
        family: 4,
      });
      isConnected = true;
      console.log('[db] MongoDB connected');
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[db] MongoDB connection failed (attempt ${attempt}/${retries}):`, err.message);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  console.error('[db] MongoDB connection failed:', lastErr?.message);
  process.exit(1);
}

async function disconnectDB() {
  if (!isConnected) return;
  try {
    await mongoose.connection.close();
    isConnected = false;
    console.log('[db] MongoDB connection closed');
  } catch (err) {
    console.error('[db] Error closing MongoDB connection:', err.message);
  }
}

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, disconnectDB, isDbReady };
