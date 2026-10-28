'use strict';

const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');

const configPath = path.resolve(__dirname, '../src/config/env.js');

function loadConfig(overrides = {}) {
  return spawnSync(
    process.execPath,
    ['-e', `const config = require(${JSON.stringify(configPath)}); process.stdout.write(config.nodeEnv);`],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        MONGO_URI: 'mongodb://127.0.0.1:27017/test',
        PORT: '5001',
        ...overrides,
      },
    }
  );
}

describe('environment security configuration', () => {
  it('fails production startup when JWT_SECRET is missing', () => {
    const result = loadConfig({ NODE_ENV: 'production' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/production JWT_SECRET/i);
  });

  it.each([
    'short-secret',
    'replace_with_a_long_random_string',
    'g'.repeat(64),
    'a'.repeat(66),
    'a'.repeat(64),
    '01234567'.repeat(8),
    '0123456789abcdef'.repeat(4),
    Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('hex'),
  ])('rejects a weak production JWT_SECRET', (secret) => {
    const result = loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/exactly 64 hexadecimal characters/i);
    expect(result.stderr).not.toContain(secret);
  });

  it('accepts a cryptographically generated production secret without printing it', () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const result = loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('production');
    expect(result.stderr).not.toContain(secret);
  });

  it('defaults an unset NODE_ENV to production rather than development', () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const result = loadConfig({ JWT_SECRET: secret });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('production');
    expect(result.stderr).not.toContain(secret);
  });

  it('fails closed when both NODE_ENV and JWT_SECRET are unset', () => {
    const result = loadConfig();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/production JWT_SECRET/i);
  });

  it('fails startup for an unrecognized NODE_ENV value', () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const result = loadConfig({ NODE_ENV: 'prod', JWT_SECRET: secret });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/NODE_ENV must be/i);
    expect(result.stderr).not.toContain(secret);
  });
});