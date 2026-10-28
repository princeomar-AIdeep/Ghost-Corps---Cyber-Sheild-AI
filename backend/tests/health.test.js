'use strict';

/**
 * health.test.js — Smoke test for the health endpoint.
 *
 * This test creates the Express app without starting a real server
 * and without connecting to MongoDB, so it runs in CI without any
 * external dependencies.
 *
 * Note: We mock mongoose.connect so the DB connection is not attempted.
 */

// Provide the required env vars before any module imports
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const createApp = require('../app');

describe('GET /api/health', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it('responds 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'CYBER-AGENT AI' });
  });

  it('includes a timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });
});

describe('Unknown routes', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it('returns 404 for unknown GET routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/ready and correlation IDs', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('reports degraded readiness without a database connection', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('disconnected');
  });

  it('echoes a safe incoming correlation id', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', 'test-request-12345');
    expect(res.headers['x-request-id']).toBe('test-request-12345');
  });

  it('does not leak NODE_ENV in the health body', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.env).toBeUndefined();
  });
});
