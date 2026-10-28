'use strict';

const net = require('node:net');

const MAX_RESPONSE_BYTES = 4096;
const STREAM_CHUNK_BYTES = 64 * 1024;

class ClamAvError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ClamAvError';
    this.code = code;
  }
}

function writeSocket(socket, chunk) {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new ClamAvError('ANTIVIRUS_UNAVAILABLE', 'Antivirus scanner is unavailable.'));
      return;
    }
    if (socket.write(chunk)) {
      resolve();
      return;
    }
    socket.once('drain', resolve);
    socket.once('error', reject);
  });
}

function sendCommand({ host, port, timeoutMs }, command, buffer = null) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = Buffer.alloc(0);
    let settled = false;
    let deadlineTimer;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    socket.setTimeout(timeoutMs, () => {
      finish(new ClamAvError('ANTIVIRUS_TIMEOUT', 'Antivirus scan timed out.'));
    });
    deadlineTimer = setTimeout(() => {
      finish(new ClamAvError('ANTIVIRUS_TIMEOUT', 'Antivirus scan timed out.'));
    }, timeoutMs);
    socket.once('error', () => {
      finish(new ClamAvError('ANTIVIRUS_UNAVAILABLE', 'Antivirus scanner is unavailable.'));
    });
    socket.on('data', (chunk) => {
      response = Buffer.concat([response, chunk]);
      if (response.length > MAX_RESPONSE_BYTES) {
        finish(new ClamAvError('ANTIVIRUS_PROTOCOL_ERROR', 'Antivirus scanner returned an invalid response.'));
        return;
      }
      const terminator = response.indexOf(0);
      if (terminator !== -1) finish(null, response.subarray(0, terminator).toString('utf8'));
    });
    socket.once('close', () => {
      if (!settled) finish(new ClamAvError('ANTIVIRUS_PROTOCOL_ERROR', 'Antivirus scanner closed an incomplete response.'));
    });
    socket.once('connect', async () => {
      try {
        await writeSocket(socket, Buffer.from(`z${command}\0`));
        if (buffer) {
          for (let offset = 0; offset < buffer.length; offset += STREAM_CHUNK_BYTES) {
            const chunk = buffer.subarray(offset, Math.min(offset + STREAM_CHUNK_BYTES, buffer.length));
            const length = Buffer.alloc(4);
            length.writeUInt32BE(chunk.length);
            await writeSocket(socket, length);
            await writeSocket(socket, chunk);
          }
          await writeSocket(socket, Buffer.alloc(4));
        }
      } catch {
        finish(new ClamAvError('ANTIVIRUS_UNAVAILABLE', 'Antivirus scanner is unavailable.'));
      }
    });
  });
}

function parseVersion(response, now, maxDefinitionAgeMs) {
  const match = /^ClamAV\s+([^/]+)\/(\d+)\/(.+)$/.exec(response.trim());
  if (!match) {
    throw new ClamAvError('ANTIVIRUS_UNAVAILABLE', 'Antivirus scanner version or definitions are unavailable.');
  }

  const signatureVersion = Number(match[2]);
  const signatureUpdatedAt = new Date(match[3]);
  const ageMs = now - signatureUpdatedAt.getTime();
  if (!Number.isSafeInteger(signatureVersion) || signatureVersion <= 0
    || !Number.isFinite(signatureUpdatedAt.getTime()) || ageMs < -5 * 60 * 1000
    || ageMs > maxDefinitionAgeMs) {
    throw new ClamAvError('ANTIVIRUS_UNAVAILABLE', 'Antivirus definitions are missing or outdated.');
  }

  return {
    engine: 'ClamAV',
    engineVersion: match[1].trim(),
    signatureVersion,
    signatureUpdatedAt: signatureUpdatedAt.toISOString(),
  };
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function createClamAvClient(options = {}) {
  const definitionAgeHours = positiveInteger(process.env.CLAMAV_MAX_DEFINITION_AGE_HOURS, 48, 720);
  const config = {
    host: options.host || process.env.CLAMAV_HOST || '127.0.0.1',
    port: positiveInteger(options.port || process.env.CLAMAV_PORT, 3310, 65535),
    timeoutMs: positiveInteger(options.timeoutMs || process.env.CLAMAV_TIMEOUT_MS, 120000, 600000),
    maxDefinitionAgeMs: positiveInteger(options.maxDefinitionAgeMs, definitionAgeHours * 60 * 60 * 1000, 720 * 60 * 60 * 1000),
    now: options.now || Date.now,
  };

  return {
    async scan(buffer) {
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new ClamAvError('ANTIVIRUS_SCAN_FAILED', 'File data is invalid.');
      }
      const deadline = Date.now() + config.timeoutMs;
      const versionInfo = parseVersion(
        await sendCommand(config, 'VERSION'),
        config.now(),
        config.maxDefinitionAgeMs
      );
      const remainingTimeoutMs = deadline - Date.now();
      if (remainingTimeoutMs <= 0) {
        throw new ClamAvError('ANTIVIRUS_TIMEOUT', 'Antivirus scan timed out.');
      }
      const response = (await sendCommand({ ...config, timeoutMs: remainingTimeoutMs }, 'INSTREAM', buffer)).trim();
      if (/heuristics\.limits\.exceeded/i.test(response)) {
        throw new ClamAvError('ANTIVIRUS_SCAN_FAILED', 'Antivirus scan exceeded configured limits.');
      }
      const result = /^(?:stream|stdin):\s*(.*?)\s+(FOUND|OK)$/.exec(response);
      if (!result || /(?:heuristics\.limits\.exceeded|limit.*exceeded|size.*exceeded)/i.test(result[1])) {
        throw new ClamAvError('ANTIVIRUS_SCAN_FAILED', 'Antivirus scan did not complete successfully.');
      }
      if (result[2] === 'OK') return { ...versionInfo, verdict: 'clean', detectionName: null };

      const detectionName = result[1].replace(/[^\w .-]/g, '').trim().slice(0, 200);
      if (!detectionName) {
        throw new ClamAvError('ANTIVIRUS_SCAN_FAILED', 'Antivirus scanner returned an invalid detection result.');
      }
      return { ...versionInfo, verdict: 'infected', detectionName };
    },
  };
}

module.exports = { ClamAvError, createClamAvClient };
