'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');

jest.mock('../src/models/AutomationWorkflow', () => {
  const record = {
    _id: '507f1f77bcf86cd799439021',
    userId: 'user123',
    name: 'Weekly URL review',
    description: '',
    frequency: 'weekly',
    status: 'draft',
    enabled: false,
  };
  return {
    find: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([record]) })) })),
    countDocuments: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(record),
  };
});

function authToken(userId = 'user123') {
  return jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('/api/automation/workflows', () => {
  const app = createApp();
  const token = authToken();

  afterEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).get('/api/automation/workflows');
    expect(response.statusCode).toBe(401);
  });

  it('lists only the caller-owned drafts', async () => {
    const AutomationWorkflow = require('../src/models/AutomationWorkflow');
    const response = await request(app)
      .get('/api/automation/workflows')
      .set('Authorization', `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(AutomationWorkflow.find).toHaveBeenCalledWith({ userId: 'user123' });
    expect(response.body.totalDrafts).toBe(1);
  });

  it('creates a disabled draft and does not execute it', async () => {
    const AutomationWorkflow = require('../src/models/AutomationWorkflow');
    const response = await request(app)
      .post('/api/automation/workflows')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Weekly URL review', frequency: 'weekly' });
    expect(response.statusCode).toBe(201);
    expect(AutomationWorkflow.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      status: 'draft',
      enabled: false,
      frequency: 'weekly',
    }));
  });

  it('rejects missing names and unsupported frequencies', async () => {
    const response = await request(app)
      .post('/api/automation/workflows')
      .set('Authorization', `Bearer ${token}`)
      .send({ frequency: 'hourly', command: 'run anything' });
    expect(response.statusCode).toBe(400);
    expect(require('../src/models/AutomationWorkflow').create).not.toHaveBeenCalled();
  });

  it('reports storage failures instead of returning a successful draft', async () => {
    const AutomationWorkflow = require('../src/models/AutomationWorkflow');
    AutomationWorkflow.create.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await request(app)
      .post('/api/automation/workflows')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Weekly URL review', frequency: 'weekly' });
    expect(response.statusCode).toBe(500);
  });
});
