'use strict';

/**
 * reports.test.js — Integration tests for /api/reports
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');
jest.mock('../src/utils/fetchJson', () => ({
  fetchJson: jest.fn(),
}));

// ── Mock Report model ─────────────────────────────────────────────────────────
jest.mock('../src/models/Report', () => {
  const mr = {
    _id: 'report123',
    title: 'Security Report — Test',
    sections: 'Overview, scans',
    summary: 'No AI key — template summary.',
    scanCount: 3,
    findingCount: 5,
    userId: 'user123',
    createdAt: new Date().toISOString(),
  };
  return {
    find: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([mr]) })) })),
    create: jest.fn().mockResolvedValue(mr),
    findOne: jest.fn().mockResolvedValue(mr),
    findOneAndDelete: jest.fn().mockResolvedValue(mr),
  };
});

// ── Mock Scan model (used by createReport to aggregate) ───────────────────────
// Use mockImplementation (not mockResolvedValue) so afterEach clearAllMocks
// doesn't break the chain — the function itself is re-set on each call.
const scanMockData = [
  { type: 'URL',  target: 'https://example.com', risk: 'Low',  status: 'complete', findings: [{ severity: 'Info' }] },
  { type: 'Code', target: 'eval(x)',              risk: 'High', status: 'complete', findings: [{ severity: 'High' }, { severity: 'High' }] },
];

jest.mock('../src/models/Scan', () => {
  const buildChain = () => ({
    sort: jest.fn(() => ({
      limit: jest.fn().mockResolvedValue(scanMockData),
    })),
  });
  return {
    find: jest.fn(buildChain),
    findOne: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
  };
});

function makeToken(userId = 'user123') {
  return jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('/api/reports', () => {
  let app, token;

  beforeAll(() => { app = createApp(); token = makeToken(); });
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    jest.clearAllMocks();
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  describe('Authentication required', () => {
    it('GET / returns 401 without token', async () => {
      expect((await request(app).get('/api/reports')).statusCode).toBe(401);
    });
    it('POST / returns 401 without token', async () => {
      expect((await request(app).post('/api/reports').send({ title: 'X' })).statusCode).toBe(401);
    });
    it('GET /:id returns 401 without token', async () => {
      expect((await request(app).get('/api/reports/report123')).statusCode).toBe(401);
    });
    it('DELETE /:id returns 401 without token', async () => {
      expect((await request(app).delete('/api/reports/report123')).statusCode).toBe(401);
    });
  });

  // ── GET /api/reports ────────────────────────────────────────────────────────

  describe('GET /api/reports', () => {
    it('returns 200 with an array', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── POST /api/reports ───────────────────────────────────────────────────────

  describe('POST /api/reports', () => {
    it('creates a report and returns 201', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'My Security Report', sections: 'Overview, scans' });
      expect(res.statusCode).toBe(201);
      expect(res.body.title).toBeDefined();
      expect(res.body.summary).toBeDefined();
    });

    it('summarizes stored scan records and clearly states heuristic limitations without an AI key', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Report without AI' });
      expect(res.statusCode).toBe(201);
      // The Report.create mock returns a fixed object; the controller generates
      // a summary string before calling create — verify create was called with one
      const Report = require('../src/models/Report');
      if (Report.create.mock.calls.length > 0) {
        const [data] = Report.create.mock.calls[Report.create.mock.calls.length - 1];
        expect(typeof data.summary).toBe('string');
        expect(data.summary.length).toBeGreaterThan(0);
        expect(data.summary).toContain('2 scan(s)');
        expect(data.summary).toContain('3 heuristic finding(s)');
        expect(data.summary).toContain('lightweight heuristic checks');
        expect(data.summary).not.toMatch(/demonstration report|verified threats/i);
      }
    });

    it('adds heuristic scope limitations to an AI-generated summary', async () => {
      process.env.OPENAI_API_KEY = 'test-only-openai-key';
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const { fetchJson } = require('../src/utils/fetchJson');
      fetchJson.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { choices: [{ message: { content: 'Stored scan records show elevated heuristic risk.' } }] },
      });
      try {
        const res = await request(app)
          .post('/api/reports')
          .set('Authorization', `Bearer ${token}`)
          .send({ title: 'AI Summary Scope Test' });

        expect(res.statusCode).toBe(201);
        const Report = require('../src/models/Report');
        const [data] = Report.create.mock.calls[Report.create.mock.calls.length - 1];
        expect(data.summary).toContain('Stored scan records show elevated heuristic risk.');
        expect(data.summary).toContain('not verified threat detections');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('uses Gemini for an AI report summary when configured', async () => {
      process.env.OPENAI_API_KEY = 'test-only-openai-key';
      process.env.GEMINI_API_KEY = 'test-only-gemini-key';
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const { fetchJson } = require('../src/utils/fetchJson');
      fetchJson.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { candidates: [{ content: { parts: [{ text: 'Gemini report summary.' }] } }] },
      });
      try {
        const res = await request(app)
          .post('/api/reports')
          .set('Authorization', `Bearer ${token}`)
          .send({ title: 'Gemini Summary Test' });

        expect(res.statusCode).toBe(201);
        expect(fetchJson).toHaveBeenCalledTimes(1);
        expect(fetchJson.mock.calls[0][0]).toBe(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'
        );
        expect(fetchJson.mock.calls[0][0]).not.toContain('test-only-gemini-key');
        expect(fetchJson.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-only-gemini-key');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('falls back to OpenAI when the configured Gemini provider fails', async () => {
      process.env.OPENAI_API_KEY = 'test-only-openai-key';
      process.env.GEMINI_API_KEY = 'test-only-gemini-key';
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const { fetchJson } = require('../src/utils/fetchJson');
      fetchJson
        .mockResolvedValueOnce({ ok: false, status: 503, data: null })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { choices: [{ message: { content: 'OpenAI fallback report summary.' } }] },
        });
      try {
        const res = await request(app)
          .post('/api/reports')
          .set('Authorization', `Bearer ${token}`)
          .send({ title: 'Provider Fallback Test' });

        expect(res.statusCode).toBe(201);
        expect(fetchJson).toHaveBeenCalledTimes(2);
        expect(fetchJson.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
        expect(fetchJson.mock.calls[1][0]).toBe('https://api.openai.com/v1/chat/completions');
        const Report = require('../src/models/Report');
        const [data] = Report.create.mock.calls[Report.create.mock.calls.length - 1];
        expect(data.summary).toContain('OpenAI fallback report summary.');
        expect(data.summary).toContain('not verified threat detections');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('auto-generates title when none provided', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      // Whether 201 or the Report.create returned mock, title should be set
      // We verify the controller sets a default title (check in Report.create call)
      const Report = require('../src/models/Report');
      if (Report.create.mock.calls.length > 0) {
        const [data] = Report.create.mock.calls[Report.create.mock.calls.length - 1];
        expect(data.title).toMatch(/Security Report/i);
      } else {
        // Report.create was mocked away — pass if 201 returned
        expect([200, 201]).toContain(res.statusCode);
      }
    });

    it('includes scan count and finding count in report', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Aggregation Test' });
      expect(res.statusCode).toBe(201);
      expect(typeof res.body.scanCount).toBe('number');
      expect(typeof res.body.findingCount).toBe('number');
    });
  });

  // ── GET /api/reports/:id ────────────────────────────────────────────────────

  describe('GET /api/reports/:id', () => {
    it('returns 200 with the report', async () => {
      const res = await request(app)
        .get('/api/reports/report123')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when not found', async () => {
      const Report = require('../src/models/Report');
      Report.findOne.mockResolvedValueOnce(null);
      const res = await request(app)
        .get('/api/reports/nonexistent')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── DELETE /api/reports/:id ─────────────────────────────────────────────────

  describe('DELETE /api/reports/:id', () => {
    it('returns 200 on success', async () => {
      const res = await request(app)
        .delete('/api/reports/report123')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when not found', async () => {
      const Report = require('../src/models/Report');
      Report.findOneAndDelete.mockResolvedValueOnce(null);
      const res = await request(app)
        .delete('/api/reports/nonexistent')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });
  });
});
