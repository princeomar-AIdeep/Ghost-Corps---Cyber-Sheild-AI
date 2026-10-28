'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');

function authToken() {
  return jwt.sign(
    { tokenUse: 'access', sub: 'user123', email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('/api/ai-defense/status', () => {
  const app = createApp();

  it('requires authentication', async () => {
    const response = await request(app).get('/api/ai-defense/status');
    expect(response.statusCode).toBe(401);
  });

  it('reports unavailable without claiming policy or response capabilities', async () => {
    const response = await request(app)
      .get('/api/ai-defense/status')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      available: false,
      capabilities: {
        policyEnforcement: false,
        incidentResponse: false,
        containment: false,
        auditEvents: false,
      },
      reason: expect.any(String),
    });
  });
});
