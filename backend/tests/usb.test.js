'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');

jest.mock('../src/models/User', () => ({
  findById: jest.fn().mockResolvedValue({ _id: 'user123', email: 'owner@example.com' }),
}));

jest.mock('../src/models/Scan', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'scan-usb' }),
}));

jest.mock('../src/utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ ok: true }),
  isConfigured: () => true,
}));

function makeToken() {
  return jwt.sign(
    { tokenUse: 'access', sub: 'user123', email: 'owner@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('POST /api/usb/alert', () => {
  let app;
  let token;
  beforeAll(() => {
    app = createApp();
    token = makeToken();
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/usb/alert').send({ files: [] });
    expect(res.statusCode).toBe(401);
  });

  it('returns heuristic filename findings without leaking the user email', async () => {
    const res = await request(app)
      .post('/api/usb/alert')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceLabel: '<script>alert(1)</script>',
        files: [{ name: 'autorun.inf', size: 12, type: '' }],
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.osMonitor).toBe(false);
    expect(res.body.threats.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('owner@example.com');
    const { sendMail } = require('../src/utils/mailer');
    const html = sendMail.mock.calls[0][0].html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
