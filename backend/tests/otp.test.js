'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const createApp = require('../app');
const { storeOtp, verifyOtp, resetOtpStoreForTests } = require('../src/utils/otp');

jest.mock('../src/utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ ok: true }),
  isConfigured: () => true,
}));

jest.mock('../src/models/User', () => {
  const MockUser = jest.fn();
  MockUser.findOne = jest.fn().mockResolvedValue({ _id: 'user123', email: 'reset@example.com' });
  MockUser.findById = jest.fn();
  return MockUser;
});

describe('OTP store', () => {
  beforeEach(() => resetOtpStoreForTests());

  it('verifies a matching code once and rejects reuse', () => {
    const { otp } = storeOtp('user@example.com', 'register');
    expect(verifyOtp('user@example.com', 'register', otp).ok).toBe(true);
    expect(verifyOtp('user@example.com', 'register', otp).ok).toBe(false);
  });

  it('enforces attempt limits', () => {
    storeOtp('user@example.com', 'login');
    for (let i = 0; i < 5; i += 1) {
      expect(verifyOtp('user@example.com', 'login', '000000').ok).toBe(false);
    }
    const last = verifyOtp('user@example.com', 'login', '000000');
    expect(last.ok).toBe(false);
    expect(last.error).toMatch(/Too many incorrect attempts/i);
  });

  it('enforces resend cooldown', () => {
    expect(storeOtp('user@example.com', 'register').ok).toBe(true);
    const again = storeOtp('user@example.com', 'register');
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/wait/i);
  });
});

describe('OTP HTTP endpoints', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    resetOtpStoreForTests();
    jest.clearAllMocks();
  });

  it('sends OTP without returning the code', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'new@example.com', scope: 'register' });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
    expect(res.body.message).toMatch(/sent/i);
  });

  it('reports missing SMTP configuration without returning an OTP', async () => {
    const { sendMail } = require('../src/utils/mailer');
    sendMail.mockResolvedValueOnce({
      ok: false,
      reason: 'not_configured',
      message: 'Set SMTP_HOST, SMTP_USER, SMTP_PASS in backend/.env.',
    });

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'new@example.com', scope: 'register' });

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/SMTP_HOST, SMTP_USER, SMTP_PASS/);
    expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
  });

  it('does not enumerate accounts on login OTP', async () => {
    const User = require('../src/models/User');
    User.findOne.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'missing@example.com', scope: 'login' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/If that account exists/i);
  });

  it('rejects invalid OTP payloads', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'new@example.com', scope: 'register', otp: '12' });
    expect(res.statusCode).toBe(400);
  });
});
