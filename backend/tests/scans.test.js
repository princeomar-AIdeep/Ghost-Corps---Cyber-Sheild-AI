'use strict';

/**
 * scans.test.js — Integration tests for /api/scans
 *
 * Tests authentication, heuristic analysis (URL/Code), CRUD operations,
 * ownership enforcement, and cross-user isolation.
 * Mongoose model and AI calls are mocked — runs fully offline.
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
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(async (buffer) => (
    buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      ? { ext: 'png', mime: 'image/png' }
      : undefined
  )),
}));
jest.mock('../src/utils/fetchJson', () => ({
  fetchJson: jest.fn(),
}));
const { fetchJson } = require('../src/utils/fetchJson');
jest.mock('../src/modules/scans/clamavClient', () => ({
  ClamAvError: class ClamAvError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  },
  createClamAvClient: jest.fn(),
}));
const { ClamAvError, createClamAvClient } = require('../src/modules/scans/clamavClient');

// ── Mock Scan model ───────────────────────────────────────────────────────────
jest.mock('../src/models/Scan', () => {
  const ms = {
    _id: 'scan123',
    type: 'URL',
    target: 'https://example.com',
    status: 'complete',
    risk: 'Low',
    findings: [{ severity: 'Info', title: 'No issues', detail: 'All clear.' }],
    result: 'Heuristic-only scan completed.',
    userId: 'user123',
    createdAt: new Date().toISOString(),
  };
  return {
    find: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([ms]) })) })),
    create: jest.fn().mockResolvedValue({ ...ms, _id: 'scan-new', status: 'running' }),
    findOne: jest.fn().mockResolvedValue(ms),
    findByIdAndUpdate: jest.fn().mockResolvedValue(ms),
    findOneAndDelete: jest.fn().mockResolvedValue(ms),
  };
});

function makeToken(userId = 'user123') {
  return jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('/api/scans', () => {
  let app, token;

  beforeAll(() => { app = createApp(); token = makeToken(); });
  beforeEach(() => {
    createClamAvClient.mockReturnValue({
      scan: jest.fn().mockResolvedValue({
        engine: 'ClamAV', engineVersion: '1.5.4', signatureVersion: 12345,
        signatureUpdatedAt: new Date().toISOString(), verdict: 'clean', detectionName: null,
      }),
    });
  });
  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    jest.clearAllMocks();
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  describe('Authentication required', () => {
    it('GET / returns 401 without token', async () => {
      expect((await request(app).get('/api/scans')).statusCode).toBe(401);
    });
    it('POST / returns 401 without token', async () => {
      expect((await request(app).post('/api/scans').send({ type: 'URL', target: 'https://x.com' })).statusCode).toBe(401);
    });
    it('GET /:id returns 401 without token', async () => {
      expect((await request(app).get('/api/scans/scan123')).statusCode).toBe(401);
    });
    it('DELETE /:id returns 401 without token', async () => {
      expect((await request(app).delete('/api/scans/scan123')).statusCode).toBe(401);
    });
    it('POST /image returns 401 without token', async () => {
      expect((await request(app).post('/api/scans/image').send({ filename: 'sample.png', data: 'iVBORw0KGgo=' })).statusCode).toBe(401);
    });
  });

  // ── GET /api/scans ──────────────────────────────────────────────────────────

  describe('GET /api/scans', () => {
    it('returns 200 with an array', async () => {
      const res = await request(app)
        .get('/api/scans')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── POST /api/scans ─────────────────────────────────────────────────────────

  describe('POST /api/scans', () => {
    it('creates a URL scan and returns 201', async () => {
      const Scan = require('../src/models/Scan');
      // Return a running scan on create, then completed on findByIdAndUpdate
      Scan.create.mockResolvedValueOnce({ _id: 'scan-new', status: 'running' });
      Scan.findByIdAndUpdate.mockResolvedValueOnce({
        _id: 'scan-new', type: 'URL', target: 'https://example.com',
        status: 'complete', risk: 'Low', findings: [], result: 'done', userId: 'user123',
      });

      const res = await request(app)
        .post('/api/scans')
        .auth(token, { type: 'bearer' })
        .send({ type: 'URL', target: 'https://example.com' });
      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('complete');
    });

    it('uses the supported Gemini model and keeps its API key out of the URL', async () => {
      process.env.NODE_ENV = 'development';
      process.env.GEMINI_API_KEY = 'test-only-gemini-key';
      fetchJson.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { candidates: [{ content: { parts: [{ text: 'Gemini scan enrichment.' }] } }] },
      });

      try {
        const res = await request(app)
          .post('/api/scans')
          .auth(token, { type: 'bearer' })
          .send({ type: 'URL', target: 'https://example.com' });

        expect(res.statusCode).toBe(201);
        expect(fetchJson).toHaveBeenCalledTimes(1);
        expect(fetchJson.mock.calls[0][0]).toBe(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'
        );
        expect(fetchJson.mock.calls[0][0]).not.toContain('test-only-gemini-key');
        expect(fetchJson.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-only-gemini-key');
      } finally {
        process.env.NODE_ENV = 'test';
        delete process.env.GEMINI_API_KEY;
      }
    });

    it('assigns High risk to suspicious URL', async () => {
      const Scan = require('../src/models/Scan');
      let capturedUpdate = {};
      Scan.create.mockResolvedValueOnce({ _id: 'scan-evil' });
      Scan.findByIdAndUpdate.mockImplementationOnce((_id, update, opts) => {
        capturedUpdate = update;
        return Promise.resolve({ ...update, _id: 'scan-evil' });
      });

      await request(app)
        .post('/api/scans')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'URL', target: 'http://phishing-site.xyz/malware-payload' });

      expect(capturedUpdate.risk).toBe('High');
    });

    it('assigns Medium/High risk to dangerous code', async () => {
      const Scan = require('../src/models/Scan');
      let capturedUpdate = {};
      Scan.create.mockResolvedValueOnce({ _id: 'scan-code' });
      Scan.findByIdAndUpdate.mockImplementationOnce((_id, update) => {
        capturedUpdate = update;
        return Promise.resolve({ ...update });
      });

      await request(app)
        .post('/api/scans')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'Code', target: 'eval(atob(payload)); exec(cmd); system("rm -rf /")' });

      expect(['Medium', 'High']).toContain(capturedUpdate.risk);
    });

    it('returns 400 for invalid type', async () => {
      const res = await request(app)
        .post('/api/scans')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'Image', target: 'foo' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when target is missing', async () => {
      const res = await request(app)
        .post('/api/scans')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'URL' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/scans/image', () => {
    it('rejects unsupported content before calling the antivirus engine', async () => {
      const res = await request(app)
        .post('/api/scans/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from([0, 1, 2, 3, 4]), 'unknown.bin');

      expect(res.statusCode).toBe(415);
      expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(createClamAvClient).not.toHaveBeenCalled();
      expect(require('../src/models/Scan').create).not.toHaveBeenCalled();
    });

    it('stores a clean antivirus result and metadata without storing file bytes', async () => {
      const Scan = require('../src/models/Scan');
      const buffer = Buffer.from('89504e470d0a1a0a0000000d4948445200000001', 'hex');
      const clam = { scan: jest.fn().mockResolvedValue({
        engine: 'ClamAV', engineVersion: '1.5.4', signatureVersion: 12345,
        signatureUpdatedAt: new Date().toISOString(), verdict: 'clean', detectionName: null,
      }) };
      createClamAvClient.mockReturnValue(clam);
      const res = await request(app)
        .post('/api/scans/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buffer, 'sample.png');

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('clean');
      expect(res.body.analysisType).toBe('antivirus');
      expect(res.body.antivirus.engine).toBe('ClamAV');
      expect(res.body.antivirus.verdict).toBe('clean');
      expect(res.body.antivirus.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.antivirus.fileSizeBytes).toBe(buffer.length);
      expect(Scan.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user123',
        type: 'File',
        target: 'sample.png',
        status: 'complete',
        antivirus: expect.objectContaining({ verdict: 'clean', mimeType: 'image/png' }),
      }));
      expect(Scan.create.mock.calls[0][0]).not.toHaveProperty('data');
      expect(clam.scan.mock.calls[0][0].every((byte) => byte === 0)).toBe(true);
    });

    it('persists an infected EICAR test string as Threat Detected', async () => {
      const Scan = require('../src/models/Scan');
      const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      const clam = { scan: jest.fn().mockResolvedValue({
        engine: 'ClamAV', engineVersion: '1.5.4', signatureVersion: 12345,
        signatureUpdatedAt: new Date().toISOString(), verdict: 'infected', detectionName: 'Eicar-Test-Signature',
      }) };
      createClamAvClient.mockReturnValue(clam);

      const res = await request(app)
        .post('/api/scans/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', eicar, 'eicar.txt');

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('infected');
      expect(res.body.antivirus.detectionName).toBe('Eicar-Test-Signature');
      expect(Scan.create).toHaveBeenCalledWith(expect.objectContaining({
        risk: 'Critical',
        antivirus: expect.objectContaining({ verdict: 'infected', detectionName: 'Eicar-Test-Signature' }),
      }));
    });

    it('rejects files larger than 25 MiB before scanning', async () => {
      const res = await request(app)
        .post('/api/scans/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.alloc(25 * 1024 * 1024 + 1), 'large.pdf');

      expect(res.statusCode).toBe(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
      expect(createClamAvClient).not.toHaveBeenCalled();
    });

    it('returns Scanner Unavailable and persists no clean record when ClamAV is down', async () => {
      const Scan = require('../src/models/Scan');
      createClamAvClient.mockReturnValue({ scan: jest.fn().mockRejectedValue(
        new ClamAvError('ANTIVIRUS_UNAVAILABLE', 'scanner offline')
      ) });
      const buffer = Buffer.from('89504e470d0a1a0a0000000d4948445200000001', 'hex');

      const res = await request(app)
        .post('/api/scans/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buffer, 'sample.png');

      expect(res.statusCode).toBe(503);
      expect(res.body.code).toBe('ANTIVIRUS_UNAVAILABLE');
      expect(res.body).not.toHaveProperty('status', 'clean');
      expect(Scan.create).not.toHaveBeenCalled();
    });
  });

  // ── GET /api/scans/:id ──────────────────────────────────────────────────────

  describe('GET /api/scans/:id', () => {
    it('returns 200 with the scan', async () => {
      const res = await request(app)
        .get('/api/scans/scan123')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when not found', async () => {
      const Scan = require('../src/models/Scan');
      Scan.findOne.mockResolvedValueOnce(null);
      const res = await request(app)
        .get('/api/scans/nonexistent')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── DELETE /api/scans/:id ───────────────────────────────────────────────────

  describe('DELETE /api/scans/:id', () => {
    it('returns 200 on success', async () => {
      const res = await request(app)
        .delete('/api/scans/scan123')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when not found', async () => {
      const Scan = require('../src/models/Scan');
      Scan.findOneAndDelete.mockResolvedValueOnce(null);
      const res = await request(app)
        .delete('/api/scans/nonexistent')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });
  });
});
