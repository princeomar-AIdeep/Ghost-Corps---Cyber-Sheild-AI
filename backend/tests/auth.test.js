'use strict';

/**
 * auth.test.js — Integration tests for /api/auth
 *
 * All Mongoose calls are mocked — tests run fully offline.
 * bcrypt is partially mocked to avoid slow hashing in tests.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const createApp = require('../app');
const env = require('../src/config/env');
const { storeOtp } = require('../src/utils/otp');
const RegistrationPreAuth = require('../src/models/RegistrationPreAuth');

// ── Mock User model ───────────────────────────────────────────────────────────
const mockUser = {
  _id: 'user123',
  email: 'test@example.com',
  role: 'user',
  displayName: 'Test User',
  createdAt: new Date().toISOString(),
  passwordHash: '$2a$12$hashedpassword',
  comparePassword: jest.fn(),
  save: jest.fn(),
  toPublicJSON: jest.fn(() => ({
    _id: 'user123',
    email: 'test@example.com',
    role: 'user',
    displayName: 'Test User',
    createdAt: new Date().toISOString(),
  })),
};

jest.mock('../src/models/User', () => {
  const MockUser = jest.fn().mockImplementation(() => mockUser);
  MockUser.findOne = jest.fn();
  MockUser.findById = jest.fn();
  return MockUser;
});

jest.mock('../src/models/RegistrationPreAuth', () => ({
  create: jest.fn(),
  findOneAndDelete: jest.fn(),
}));

jest.mock('../src/models/AuthSession', () => ({
  create: jest.fn().mockResolvedValue({}),
}));

describe('/api/auth/register', () => {
  let app;
  let originalNodeEnv;
  let originalRequireOtpRegister;

  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    originalNodeEnv = env.nodeEnv;
    originalRequireOtpRegister = process.env.REQUIRE_OTP_REGISTER;
    env.nodeEnv = 'test';
    delete process.env.REQUIRE_OTP_REGISTER;
    RegistrationPreAuth.create.mockResolvedValue({});
    RegistrationPreAuth.findOneAndDelete.mockResolvedValue({ jti: 'consumed' });
  });
  afterEach(() => {
    env.nodeEnv = originalNodeEnv;
    if (originalRequireOtpRegister === undefined) delete process.env.REQUIRE_OTP_REGISTER;
    else process.env.REQUIRE_OTP_REGISTER = originalRequireOtpRegister;
    jest.clearAllMocks();
  });

  it('requires an OTP pre-auth token in production when the flag is unset', async () => {
    env.nodeEnv = 'production';

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'production-register@example.com', password: 'Password123' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/verification required/i);
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid OTP pre-auth token in production', async () => {
    env.nodeEnv = 'production';

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-otp-register@example.com',
        password: 'Password123',
        preAuthToken: 'not-a-valid-token',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/verification token/i);
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  it('rejects an expired OTP pre-auth token in production', async () => {
    env.nodeEnv = 'production';
    const email = 'expired-otp-register@example.com';
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { tokenUse: 'otp-preauth', preAuth: true, email, scope: 'register' },
      process.env.JWT_SECRET,
      { expiresIn: -1, algorithm: 'HS256' }
    );

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123', preAuthToken: expiredToken });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  it('accepts an OTP pre-auth token for the matching registration flow', async () => {
    env.nodeEnv = 'production';
    const email = 'otp-register@example.com';
    const { otp } = storeOtp(email, 'register');
    const verification = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, scope: 'register', otp });
    expect(verification.statusCode).toBe(200);

    mockUser.save.mockResolvedValueOnce();
    const registration = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123', preAuthToken: verification.body.preAuthToken });

    expect(registration.statusCode).toBe(201);
    const jwt = require('jsonwebtoken');
    const preAuthPayload = jwt.decode(verification.body.preAuthToken);
    expect(jwt.decode(registration.body.token).tokenUse).toBe('access');
    expect(RegistrationPreAuth.create).toHaveBeenCalledWith(expect.objectContaining({
      jti: preAuthPayload.jti,
      email,
      expiresAt: new Date(preAuthPayload.exp * 1000),
    }));
    expect(RegistrationPreAuth.findOneAndDelete).toHaveBeenCalledWith({ jti: preAuthPayload.jti, email });
  });

  it('rejects reuse of a registration OTP pre-auth token', async () => {
    env.nodeEnv = 'production';
    const email = 'reused-otp-register@example.com';
    const { otp } = storeOtp(email, 'register');
    const verification = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, scope: 'register', otp });
    const preAuthToken = verification.body.preAuthToken;
    let consumed = false;
    RegistrationPreAuth.findOneAndDelete.mockImplementation(async () => {
      if (consumed) return null;
      consumed = true;
      return { jti: 'consumed' };
    });
    mockUser.save.mockResolvedValue();

    const first = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123', preAuthToken });
    const replay = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123', preAuthToken });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(400);
    expect(mockUser.save).toHaveBeenCalledTimes(1);
  });

  it('allows only one concurrent registration using the same OTP pre-auth token', async () => {
    const email = 'concurrent-otp-register@example.com';
    const { otp } = storeOtp(email, 'register');
    const verification = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, scope: 'register', otp });
    const preAuthToken = verification.body.preAuthToken;
    let consumed = false;
    RegistrationPreAuth.findOneAndDelete.mockImplementation(async () => {
      if (consumed) return null;
      consumed = true;
      return { jti: 'consumed' };
    });
    mockUser.save.mockResolvedValue();

    const registrations = await Promise.all([
      request(app).post('/api/auth/register').send({ email, password: 'Password123', preAuthToken }),
      request(app).post('/api/auth/register').send({ email, password: 'Password123', preAuthToken }),
    ]);

    expect(registrations.map((res) => res.statusCode).sort()).toEqual([201, 400]);
    expect(mockUser.save).toHaveBeenCalledTimes(1);
  });

  it('preserves REQUIRE_OTP_REGISTER=true behavior outside production', async () => {
    process.env.REQUIRE_OTP_REGISTER = 'true';

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'required-otp-register@example.com', password: 'Password123' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/verification required/i);
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  it('returns 201 with token and user on success', async () => {
    mockUser.save.mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Password123' });

    expect(res.statusCode).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    // Password hash must NEVER appear in the response
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'Password123' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('returns 400 when password has no number', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'PasswordOnly' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/letter and one number/i);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'Password123' });
    expect(res.statusCode).toBe(400);
  });

  it('strips unknown fields (mass-assignment protection)', async () => {
    mockUser.save.mockResolvedValueOnce();
    const User = require('../src/models/User');
    let capturedArgs;
    User.mockImplementationOnce((args) => {
      capturedArgs = args;
      return mockUser;
    });

    await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Password123', role: 'admin', _id: 'hacked' });

    // role and _id injected by client must be stripped by Joi
    expect(capturedArgs).not.toHaveProperty('role');
    expect(capturedArgs).not.toHaveProperty('_id');
  });
});

describe('/api/auth/login', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  afterEach(() => jest.clearAllMocks());

  it('returns 200 with token on valid credentials', async () => {
    const User = require('../src/models/User');
    User.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockUser) });
    mockUser.comparePassword.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('accepts an OTP pre-auth token for the matching login flow', async () => {
    const originalOtpLogin = process.env.REQUIRE_OTP_LOGIN;
    process.env.REQUIRE_OTP_LOGIN = 'true';
    try {
      const email = 'otp-login@example.com';
      const { otp } = storeOtp(email, 'login');
      const verification = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email, scope: 'login', otp });
      expect(verification.statusCode).toBe(200);

      const User = require('../src/models/User');
      User.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockUser) });
      mockUser.comparePassword.mockResolvedValueOnce(true);
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Password123', preAuthToken: verification.body.preAuthToken });

      expect(login.statusCode).toBe(200);
      expect(require('jsonwebtoken').decode(login.body.token).tokenUse).toBe('access');
    } finally {
      if (originalOtpLogin === undefined) delete process.env.REQUIRE_OTP_LOGIN;
      else process.env.REQUIRE_OTP_LOGIN = originalOtpLogin;
    }
  });

  it('returns 401 on wrong password', async () => {
    const User = require('../src/models/User');
    User.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockUser) });
    mockUser.comparePassword.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword' });

    expect(res.statusCode).toBe(401);
    // Must NOT indicate whether email or password is wrong
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('returns 401 on unknown email (same message — no enumeration)', async () => {
    const User = require('../src/models/User');
    User.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password123' });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).toBe(400);
  });
});

describe('/api/auth/me', () => {
  let app;
  let validToken;

  beforeAll(() => {
    app = createApp();
    // Sign a token with the test secret to use in subsequent requests
    const jwt = require('jsonwebtoken');
    validToken = jwt.sign(
      { tokenUse: 'access', sub: 'user123', email: 'test@example.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });
  afterEach(() => jest.clearAllMocks());

  it('returns 200 with user when token is valid', async () => {
    const User = require('../src/models/User');
    User.findById.mockResolvedValueOnce(mockUser);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe('test@example.com');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token is signed with wrong secret', async () => {
    const jwt = require('jsonwebtoken');
    const wrongToken = jwt.sign({ sub: 'user123' }, 'wrong-secret', { expiresIn: '1h' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${wrongToken}`);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when an access token is expired', async () => {
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { tokenUse: 'access', sub: 'user123', email: 'test@example.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: -1, algorithm: 'HS256' }
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.statusCode).toBe(401);
  });
});

describe('/api/auth/logout', () => {
  let app;
  let validToken;

  beforeAll(() => {
    app = createApp();
    const jwt = require('jsonwebtoken');
    validToken = jwt.sign(
      { tokenUse: 'access', sub: 'user123', email: 'test@example.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  it('returns 200 when authenticated', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.statusCode).toBe(401);
  });

  it('rejects the current token after logout', async () => {
    mockUser.save.mockResolvedValueOnce();
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'logout@example.com', password: 'Password123' });
    const issued = registerRes.body.token;
    expect(issued).toBeDefined();

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${issued}`);
    expect(logoutRes.statusCode).toBe(200);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${issued}`);
    expect(meRes.statusCode).toBe(401);
  });
});

describe('/api/auth/reset-password', () => {
  let app;

  beforeAll(() => { app = createApp(); });
  afterEach(() => jest.clearAllMocks());

  it('accepts an OTP pre-auth token for the matching password reset flow', async () => {
    const email = 'otp-reset@example.com';
    const { otp } = storeOtp(email, 'reset');
    const verification = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, scope: 'reset', otp });
    expect(verification.statusCode).toBe(200);

    const User = require('../src/models/User');
    User.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockUser) });
    mockUser.save.mockResolvedValueOnce();
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, newPassword: 'NewPassword123', preAuthToken: verification.body.preAuthToken });

    expect(reset.statusCode).toBe(200);
    expect(mockUser.save).toHaveBeenCalled();
  });
});
