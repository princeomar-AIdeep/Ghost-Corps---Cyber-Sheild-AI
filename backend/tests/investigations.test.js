'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');

jest.mock('../src/models/InvestigationCase', () => {
  const record = {
    _id: '507f1f77bcf86cd799439011',
    userId: 'user123',
    projectId: null,
    title: 'Review suspicious login',
    description: '',
    severity: 'unknown',
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  return {
    find: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([record]) })) })),
    countDocuments: jest.fn((filter) => Promise.resolve(filter.status === 'open' ? 1 : 1)),
    create: jest.fn().mockResolvedValue(record),
    findOneAndUpdate: jest.fn().mockResolvedValue(record),
  };
});

jest.mock('../src/models/Project', () => ({
  findOne: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439012', userId: 'user123' }),
}));

function authToken(userId = 'user123') {
  return jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('/api/investigations/cases', () => {
  const app = createApp();
  const token = authToken();

  afterEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).get('/api/investigations/cases');
    expect(response.statusCode).toBe(401);
  });

  it('lists only the caller-owned cases', async () => {
    const InvestigationCase = require('../src/models/InvestigationCase');
    const response = await request(app)
      .get('/api/investigations/cases')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(InvestigationCase.find).toHaveBeenCalledWith({ userId: 'user123' });
    expect(response.body).toMatchObject({ totalCases: 1, openCases: 1 });
  });

  it('creates an explicitly descriptive case record', async () => {
    const InvestigationCase = require('../src/models/InvestigationCase');
    const response = await request(app)
      .post('/api/investigations/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Review suspicious login', severity: 'suspicious' });

    expect(response.statusCode).toBe(201);
    expect(InvestigationCase.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      title: 'Review suspicious login',
      severity: 'suspicious',
    }));
  });

  it('rejects malformed investigation fields', async () => {
    const response = await request(app)
      .post('/api/investigations/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '   ', severity: 'confirmed_malware' });
    expect(response.statusCode).toBe(400);
  });

  it('rejects malformed case identifiers before querying storage', async () => {
    const InvestigationCase = require('../src/models/InvestigationCase');
    const response = await request(app)
      .put('/api/investigations/cases/not-an-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'resolved' });
    expect(response.statusCode).toBe(400);
    expect(InvestigationCase.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires any linked project to belong to the caller', async () => {
    const Project = require('../src/models/Project');
    Project.findOne.mockResolvedValueOnce(null);
    const response = await request(app)
      .post('/api/investigations/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Project review', projectId: '507f1f77bcf86cd799439012' });

    expect(response.statusCode).toBe(404);
    expect(Project.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439012',
      userId: 'user123',
    });
  });

  it('updates a case only within the caller scope', async () => {
    const InvestigationCase = require('../src/models/InvestigationCase');
    const response = await request(app)
      .put('/api/investigations/cases/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress' });

    expect(response.statusCode).toBe(200);
    expect(InvestigationCase.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', userId: 'user123' },
      { status: 'in_progress' },
      { new: true, runValidators: true }
    );
  });

  it('returns not found when the case is not owned by the caller', async () => {
    const InvestigationCase = require('../src/models/InvestigationCase');
    InvestigationCase.findOneAndUpdate.mockResolvedValueOnce(null);
    const response = await request(app)
      .put('/api/investigations/cases/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'resolved' });
    expect(response.statusCode).toBe(404);
  });

  it('reports persistence failures instead of returning a case record', async () => {
    const InvestigationCase = require('../src/models/InvestigationCase');
    InvestigationCase.create.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await request(app)
      .post('/api/investigations/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Review suspicious login' });
    expect(response.statusCode).toBe(500);
  });
});
