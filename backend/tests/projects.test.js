'use strict';

/**
 * projects.test.js — Integration tests for /api/projects
 *
 * All routes are now protected by authenticate middleware.
 * Tests generate a valid JWT and send it in the Authorization header.
 * Mongoose model is mocked — tests run fully offline.
 *
 * NOTE on jest.mock() hoisting:
 *   jest.mock() is hoisted by Babel/Jest to the TOP of the file before any
 *   const/let declarations run. Any variable referenced inside the factory
 *   callback must therefore be defined INSIDE the factory, not in the outer
 *   module scope, to avoid "Cannot access before initialization" errors.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const createApp = require('../app');

// ── Mock the Project model ────────────────────────────────────────────────────
// Data is defined INSIDE the factory to avoid jest.mock hoisting issues.
jest.mock('../src/models/Project', () => {
  const mp = {
    _id: 'proj123',
    title: 'Test Project',
    description: '',
    userId: 'user123',
    createdAt: new Date().toISOString(),
  };
  return {
    find: jest.fn(() => ({ sort: jest.fn().mockResolvedValue([mp]) })),
    create: jest.fn().mockResolvedValue(mp),
    findOneAndUpdate: jest.fn().mockResolvedValue(mp),
    findOneAndDelete: jest.fn().mockResolvedValue(mp),
  };
});
jest.mock('../src/models/WorkspaceFile', () => ({
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
}));
jest.mock('../src/models/WorkspaceFileQuota', () => ({
  deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId = 'user123') {
  return jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockTransactionSession(withTransaction = (operation) => operation()) {
  const session = {
    withTransaction: jest.fn(withTransaction),
    endSession: jest.fn(),
  };
  jest.spyOn(mongoose, 'startSession').mockResolvedValueOnce(session);
  return session;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('/api/projects', () => {
  let app;
  let token;

  beforeAll(() => {
    app = createApp();
    token = makeToken();
  });

  afterEach(() => jest.clearAllMocks());

  // ── Authentication guard ──────────────────────────────────────────────────

  describe('Authentication required', () => {
    it('GET returns 401 without token', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.statusCode).toBe(401);
    });

    it('POST returns 401 without token', async () => {
      const res = await request(app).post('/api/projects').send({ title: 'X' });
      expect(res.statusCode).toBe(401);
    });

    it('PUT returns 401 without token', async () => {
      const res = await request(app).put('/api/projects/proj123').send({ title: 'X' });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE returns 401 without token', async () => {
      const res = await request(app).delete('/api/projects/proj123');
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /api/projects ─────────────────────────────────────────────────────

  describe('GET /api/projects', () => {
    it('returns 200 with an array for authenticated user', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('queries with userId filter (ownership scoping)', async () => {
      const Project = require('../src/models/Project');
      await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);
      expect(Project.find).toHaveBeenCalledWith({ userId: 'user123' });
    });
  });

  // ── POST /api/projects ────────────────────────────────────────────────────

  describe('POST /api/projects', () => {
    it('creates a project and returns 201', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Project' });
      expect(res.statusCode).toBe(201);
      expect(res.body.title).toBe('Test Project');
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when title is only whitespace', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '   ' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── PUT /api/projects/:id ─────────────────────────────────────────────────

  describe('PUT /api/projects/:id', () => {
    it('updates a project and returns 200', async () => {
      const res = await request(app)
        .put('/api/projects/proj123')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Project' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when project not found (or belongs to another user)', async () => {
      const Project = require('../src/models/Project');
      Project.findOneAndUpdate.mockResolvedValueOnce(null);

      const res = await request(app)
        .put('/api/projects/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X' });
      expect(res.statusCode).toBe(404);
    });

    it('enforces ownership via userId in query', async () => {
      const Project = require('../src/models/Project');
      await request(app)
        .put('/api/projects/proj123')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated' });
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'proj123', userId: 'user123' },
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  // ── DELETE /api/projects/:id ──────────────────────────────────────────────

  describe('DELETE /api/projects/:id', () => {
    it('deletes a project and returns 200', async () => {
      const session = mockTransactionSession();
      const res = await request(app)
        .delete('/api/projects/proj123')
        .set('Authorization', `Bearer ${token}`);
      const WorkspaceFile = require('../src/models/WorkspaceFile');
      const WorkspaceFileQuota = require('../src/models/WorkspaceFileQuota');

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBeDefined();
      expect(WorkspaceFile.deleteMany).toHaveBeenCalledWith({ projectId: 'proj123' }, { session });
      expect(WorkspaceFileQuota.deleteOne).toHaveBeenCalledWith({ projectId: 'proj123' }, { session });
      expect(session.endSession).toHaveBeenCalled();
    });

    it('returns 404 when project not found', async () => {
      const Project = require('../src/models/Project');
      mockTransactionSession();
      Project.findOneAndDelete.mockResolvedValueOnce(null);

      const res = await request(app)
        .delete('/api/projects/nonexistent')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
      expect(require('../src/models/WorkspaceFile').deleteMany).not.toHaveBeenCalled();
      expect(require('../src/models/WorkspaceFileQuota').deleteOne).not.toHaveBeenCalled();
    });

    it('keeps project data when MongoDB transaction support is unavailable', async () => {
      mockTransactionSession(() => {
        throw Object.assign(
          new Error('Transaction numbers are only allowed on a replica set member or mongos'),
          { code: 20 }
        );
      });
      const res = await request(app)
        .delete('/api/projects/proj123')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toMatch(/transaction support/);
      expect(require('../src/models/WorkspaceFile').deleteMany).not.toHaveBeenCalled();
    });

    it('enforces ownership via userId in query', async () => {
      const Project = require('../src/models/Project');
      const session = mockTransactionSession();
      await request(app)
        .delete('/api/projects/proj123')
        .set('Authorization', `Bearer ${token}`);
      expect(Project.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'proj123',
        userId: 'user123',
      }, { session });
    });
  });

  // ── Cross-user isolation ──────────────────────────────────────────────────

  describe('Cross-user isolation', () => {
    it('user B cannot update user A project (returns 404)', async () => {
      const Project = require('../src/models/Project');
      Project.findOneAndUpdate.mockResolvedValueOnce(null);

      const tokenB = makeToken('userB-different-id');
      const res = await request(app)
        .put('/api/projects/proj123')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Hijacked' });
      expect(res.statusCode).toBe(404);
    });

    it('user B cannot delete user A project (returns 404)', async () => {
      const Project = require('../src/models/Project');
      mockTransactionSession();
      Project.findOneAndDelete.mockResolvedValueOnce(null);

      const tokenB = makeToken('userB-different-id');
      const res = await request(app)
        .delete('/api/projects/proj123')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.statusCode).toBe(404);
    });
  });
});
