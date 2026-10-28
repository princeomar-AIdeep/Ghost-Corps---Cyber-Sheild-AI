'use strict';

/**
 * tasks.test.js — Integration tests for /api/tasks
 *
 * All routes are now protected by authenticate middleware.
 * Tests generate a valid JWT and send it in the Authorization header.
 * Mongoose model is mocked — tests run fully offline.
 *
 * NOTE on jest.mock() hoisting:
 *   jest.mock() is hoisted before any const/let declarations.
 *   Mock data must be defined INSIDE the factory to avoid TDZ errors.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');

// ── Mock the Task model ───────────────────────────────────────────────────────
// Data is defined INSIDE the factory to avoid jest.mock hoisting issues.
jest.mock('../src/models/Task', () => {
  const mt = {
    _id: 'task123',
    title: 'Test Task',
    due: 'No due date',
    done: false,
    userId: 'user123',
    createdAt: new Date().toISOString(),
  };
  return {
    find: jest.fn(() => ({ sort: jest.fn().mockResolvedValue([mt]) })),
    create: jest.fn().mockResolvedValue(mt),
    findOneAndUpdate: jest.fn().mockResolvedValue(mt),
    findOneAndDelete: jest.fn().mockResolvedValue(mt),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId = 'user123') {
  return jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('/api/tasks', () => {
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
      const res = await request(app).get('/api/tasks');
      expect(res.statusCode).toBe(401);
    });

    it('POST returns 401 without token', async () => {
      const res = await request(app).post('/api/tasks').send({ title: 'X' });
      expect(res.statusCode).toBe(401);
    });

    it('PUT returns 401 without token', async () => {
      const res = await request(app).put('/api/tasks/task123').send({ done: true });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE returns 401 without token', async () => {
      const res = await request(app).delete('/api/tasks/task123');
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /api/tasks ────────────────────────────────────────────────────────

  describe('GET /api/tasks', () => {
    it('returns 200 with an array for authenticated user', async () => {
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('queries with userId filter (ownership scoping)', async () => {
      const Task = require('../src/models/Task');
      await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);
      expect(Task.find).toHaveBeenCalledWith({ userId: 'user123' });
    });
  });

  // ── POST /api/tasks ───────────────────────────────────────────────────────

  describe('POST /api/tasks', () => {
    it('creates a task and returns 201', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Task', due: 'Oct 25' });
      expect(res.statusCode).toBe(201);
      expect(res.body.title).toBe('Test Task');
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  // ── PUT /api/tasks/:id ────────────────────────────────────────────────────

  describe('PUT /api/tasks/:id', () => {
    it('toggles done state and returns 200', async () => {
      const res = await request(app)
        .put('/api/tasks/task123')
        .set('Authorization', `Bearer ${token}`)
        .send({ done: true });
      expect(res.statusCode).toBe(200);
    });

    it('returns 400 when no valid fields provided', async () => {
      const res = await request(app)
        .put('/api/tasks/task123')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when task not found', async () => {
      const Task = require('../src/models/Task');
      Task.findOneAndUpdate.mockResolvedValueOnce(null);

      const res = await request(app)
        .put('/api/tasks/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .send({ done: true });
      expect(res.statusCode).toBe(404);
    });

    it('enforces ownership via userId in query', async () => {
      const Task = require('../src/models/Task');
      await request(app)
        .put('/api/tasks/task123')
        .set('Authorization', `Bearer ${token}`)
        .send({ done: true });
      expect(Task.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'task123', userId: 'user123' },
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  // ── DELETE /api/tasks/:id ─────────────────────────────────────────────────

  describe('DELETE /api/tasks/:id', () => {
    it('deletes a task and returns 200', async () => {
      const res = await request(app)
        .delete('/api/tasks/task123')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBeDefined();
    });

    it('returns 404 when task not found', async () => {
      const Task = require('../src/models/Task');
      Task.findOneAndDelete.mockResolvedValueOnce(null);

      const res = await request(app)
        .delete('/api/tasks/nonexistent')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });

    it('enforces ownership via userId in query', async () => {
      const Task = require('../src/models/Task');
      await request(app)
        .delete('/api/tasks/task123')
        .set('Authorization', `Bearer ${token}`);
      expect(Task.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'task123',
        userId: 'user123',
      });
    });
  });

  // ── Cross-user isolation ──────────────────────────────────────────────────

  describe('Cross-user isolation', () => {
    it('user B cannot update user A task (returns 404)', async () => {
      const Task = require('../src/models/Task');
      Task.findOneAndUpdate.mockResolvedValueOnce(null);

      const tokenB = makeToken('userB-different-id');
      const res = await request(app)
        .put('/api/tasks/task123')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ done: true });
      expect(res.statusCode).toBe(404);
    });

    it('user B cannot delete user A task (returns 404)', async () => {
      const Task = require('../src/models/Task');
      Task.findOneAndDelete.mockResolvedValueOnce(null);

      const tokenB = makeToken('userB-different-id');
      const res = await request(app)
        .delete('/api/tasks/task123')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.statusCode).toBe(404);
    });
  });
});
