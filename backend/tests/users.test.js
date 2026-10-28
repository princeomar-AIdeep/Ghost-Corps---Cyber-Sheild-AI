'use strict';

/**
 * users.test.js — Integration tests for /api/users/me
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');

// ── Mock User model ───────────────────────────────────────────────────────────
const mockPublicUser = {
  _id: 'user123',
  email: 'test@example.com',
  role: 'user',
  displayName: 'Test User',
  createdAt: new Date().toISOString(),
};

jest.mock('../src/models/Project', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/models/Task', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/models/Scan', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/models/Report', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/models/ChatMessage', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/models/AuthSession', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/models/AccessPolicy', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));

jest.mock('../src/models/User', () => {
  const mockUser = {
    ...{
      _id: 'user123',
      email: 'test@example.com',
      role: 'user',
      displayName: 'Test User',
      createdAt: new Date().toISOString(),
      passwordHash: '$2a$12$hashed',
      comparePassword: jest.fn(),
      save: jest.fn(),
    },
    toPublicJSON: jest.fn(() => ({
      _id: 'user123',
      email: 'test@example.com',
      role: 'user',
      displayName: 'Test User',
      createdAt: new Date().toISOString(),
    })),
  };
  const MockUser = jest.fn().mockImplementation(() => mockUser);
  MockUser.findOne = jest.fn();
  MockUser.findById = jest.fn().mockResolvedValue(mockUser);
  MockUser.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUser);
  MockUser.findByIdAndDelete = jest.fn().mockResolvedValue(mockUser);
  return MockUser;
});

function makeToken(userId = 'user123') {
  return jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('/api/users/me', () => {
  let app, token;

  beforeAll(() => { app = createApp(); token = makeToken(); });
  afterEach(() => jest.clearAllMocks());

  // ── Auth guards ─────────────────────────────────────────────────────────────

  describe('Authentication required', () => {
    it('GET returns 401 without token', async () => {
      expect((await request(app).get('/api/users/me')).statusCode).toBe(401);
    });
    it('PUT returns 401 without token', async () => {
      expect((await request(app).put('/api/users/me').send({ displayName: 'X' })).statusCode).toBe(401);
    });
    it('DELETE returns 401 without token', async () => {
      expect((await request(app).delete('/api/users/me')).statusCode).toBe(401);
    });
  });

  // ── GET /api/users/me ────────────────────────────────────────────────────────

  describe('GET /api/users/me', () => {
    it('returns 200 with public user data', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('returns 404 if user not found in DB', async () => {
      const User = require('../src/models/User');
      User.findById.mockResolvedValueOnce(null);
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── PUT /api/users/me ────────────────────────────────────────────────────────

  describe('PUT /api/users/me', () => {
    it('persists a validated assistant name on the authenticated profile', async () => {
      const User = require('../src/models/User');
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ assistantName: 'Nila' });
      expect(res.statusCode).toBe(200);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        { assistantName: 'Nila' },
        expect.objectContaining({ new: true, runValidators: true })
      );
    });

    it('rejects unsafe assistant names', async () => {
      const User = require('../src/models/User');
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ assistantName: '<script>alert(1)</script>' });
      expect(res.statusCode).toBe(400);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('updates displayName and returns 200', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'New Name' });
      expect(res.statusCode).toBe(200);
      expect(res.body.user).toBeDefined();
    });

    it('returns 400 for invalid avatarUrl', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ avatarUrl: 'not-a-url' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when no updateable fields provided', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.statusCode).toBe(400);
    });

    it('cannot elevate own role via PUT', async () => {
      const User = require('../src/models/User');
      await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'admin', displayName: 'Hacked' });
      // findByIdAndUpdate should NOT be called with role in the payload
      if (User.findByIdAndUpdate.mock.calls.length > 0) {
        const [, updateArg] = User.findByIdAndUpdate.mock.calls[0];
        expect(updateArg).not.toHaveProperty('role');
      }
    });
  });

  // ── DELETE /api/users/me ─────────────────────────────────────────────────────

  describe('DELETE /api/users/me', () => {
    it('deletes account and returns 200', async () => {
      const res = await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBeDefined();
      const Project = require('../src/models/Project');
      expect(Project.deleteMany).toHaveBeenCalledWith({ userId: 'user123' });
    });
  });
});
