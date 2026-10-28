'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '5001';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'investigation-automation-integration-test-secret';

const APPROVED_DATABASE_NAME = 'cyber_shield_dashboard_integration_test';
const testConfig = {
  uri: process.env.DASHBOARD_TEST_MONGO_URI,
  approvedHost: process.env.DASHBOARD_TEST_APPROVED_HOST,
  applicationHostDeny: process.env.DASHBOARD_APP_HOST_DENY,
};
const hasAnyTestConfig = Object.values(testConfig).some(Boolean);
const integrationTest = hasAnyTestConfig ? it : it.skip;

if (!hasAnyTestConfig) {
  console.info(
    '[skip] Investigation/automation MongoDB integration tests require DASHBOARD_TEST_MONGO_URI, ' +
    'DASHBOARD_TEST_APPROVED_HOST, and DASHBOARD_APP_HOST_DENY for a dedicated test cluster.'
  );
}

function validateDedicatedTestConfig({ uri, approvedHost, applicationHostDeny }) {
  const normalizeHost = (host) => {
    if (typeof host !== 'string' || !host.trim() || host !== host.trim()) {
      throw new Error('Approved test and application host settings must be Atlas hostnames.');
    }
    const normalized = host.toLowerCase().replace(/\.$/, '');
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+mongodb\.net$/.test(normalized)) {
      throw new Error('Approved test and application host settings must be Atlas hostnames.');
    }
    return normalized;
  };

  const approved = normalizeHost(approvedHost);
  const denied = normalizeHost(applicationHostDeny);
  if (approved === denied) {
    throw new Error('The approved test cluster must differ from the application cluster.');
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('A valid dedicated MongoDB test URI is required.');
  }

  if (
    parsed.protocol !== 'mongodb+srv:' ||
    !parsed.username ||
    !parsed.password ||
    parsed.port ||
    uri.includes('#') ||
    parsed.hostname.toLowerCase().replace(/\.$/, '') !== approved ||
    approved === denied
  ) {
    throw new Error('The MongoDB URI must use the separately approved test cluster.');
  }
  if (parsed.pathname !== `/${APPROVED_DATABASE_NAME}`) {
    throw new Error(`The MongoDB URI must target only ${APPROVED_DATABASE_NAME}.`);
  }

  const allowedOptions = new Set(['retrywrites', 'w', 'appname']);
  const seenOptions = new Set();
  for (const key of parsed.searchParams.keys()) {
    const normalizedKey = key.toLowerCase();
    if (!allowedOptions.has(normalizedKey) || seenOptions.has(normalizedKey)) {
      throw new Error('The MongoDB URI contains an unapproved or duplicate option.');
    }
    seenOptions.add(normalizedKey);
    const [value] = parsed.searchParams.getAll(key);
    if (
      (normalizedKey === 'retrywrites' && value !== 'true') ||
      (normalizedKey === 'w' && value !== 'majority') ||
      (normalizedKey === 'appname' && !value)
    ) {
      throw new Error('The MongoDB URI contains an unapproved option value.');
    }
  }

  try {
    const { parseOptions } = require('mongodb/lib/connection_string');
    if (parseOptions(uri).dbName !== APPROVED_DATABASE_NAME) {
      throw new Error('The MongoDB driver did not select the approved test database.');
    }
  } catch (error) {
    if (error.message === 'The MongoDB driver did not select the approved test database.') throw error;
    throw new Error('The MongoDB driver rejected the dedicated test URI.');
  }
}

describe('investigation and automation integration URI safety', () => {
  it('rejects application-cluster hosts and non-dedicated database names', () => {
    const approvedHost = 'test-cluster.example.mongodb.net';
    const applicationHostDeny = 'application-cluster.example.mongodb.net';
    const uri = `mongodb+srv://test-user:test-password@${approvedHost}/${APPROVED_DATABASE_NAME}?retryWrites=true&w=majority&appName=DashboardTest`;

    expect(() => validateDedicatedTestConfig({ uri, approvedHost: applicationHostDeny, applicationHostDeny }))
      .toThrow('must differ from the application cluster');
    expect(() => validateDedicatedTestConfig({
      uri: uri.replace(APPROVED_DATABASE_NAME, 'production'),
      approvedHost,
      applicationHostDeny,
    })).toThrow('must target only');
    expect(() => validateDedicatedTestConfig({
      uri: uri.replace(approvedHost, applicationHostDeny),
      approvedHost,
      applicationHostDeny,
    })).toThrow('separately approved test cluster');
  });
});

integrationTest(
  'persists owner-scoped investigation cases and disabled automation drafts in the dedicated test database',
  async () => {
    validateDedicatedTestConfig(testConfig);

    const mongoose = require('mongoose');
    const crypto = require('crypto');
    const request = require('supertest');
    const users = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const projectIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    let connected = false;

    try {
      await mongoose.connect(testConfig.uri, {
        autoCreate: true,
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
      }).catch(() => {
        throw new Error('MongoDB is unavailable at the approved dashboard integration-test cluster.');
      });
      connected = true;

      process.env.MONGO_URI = testConfig.uri;
      const Project = require('../src/models/Project');
      const InvestigationCase = require('../src/models/InvestigationCase');
      const AutomationWorkflow = require('../src/models/AutomationWorkflow');
      const createApp = require('../app');

      const marker = crypto.randomUUID();
      const userTokens = users.map((userId) => require('jsonwebtoken').sign(
        { tokenUse: 'access', sub: userId.toString(), email: `${userId}@example.test`, role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      ));

      await Project.create([
        { _id: projectIds[0], title: `Owner project ${marker}`, userId: users[0] },
        { _id: projectIds[1], title: `Other project ${marker}`, userId: users[1] },
      ]);

      const app = createApp();
      const createdCase = await request(app)
        .post('/api/investigations/cases')
        .set('Authorization', `Bearer ${userTokens[0]}`)
        .send({ title: `Case ${marker}`, description: 'Integration record', severity: 'suspicious', projectId: projectIds[0].toString() });
      expect(createdCase.statusCode).toBe(201);
      expect(createdCase.body.projectId.toString()).toBe(projectIds[0].toString());

      const ownerCases = await request(app)
        .get('/api/investigations/cases')
        .set('Authorization', `Bearer ${userTokens[0]}`);
      expect(ownerCases.statusCode).toBe(200);
      expect(ownerCases.body.cases.some((record) => record._id === createdCase.body._id)).toBe(true);

      const otherUserCases = await request(app)
        .get('/api/investigations/cases')
        .set('Authorization', `Bearer ${userTokens[1]}`);
      expect(otherUserCases.statusCode).toBe(200);
      expect(otherUserCases.body.cases.some((record) => record._id === createdCase.body._id)).toBe(false);

      const crossUserUpdate = await request(app)
        .put(`/api/investigations/cases/${createdCase.body._id}`)
        .set('Authorization', `Bearer ${userTokens[1]}`)
        .send({ status: 'resolved' });
      expect(crossUserUpdate.statusCode).toBe(404);

      const foreignProjectLink = await request(app)
        .post('/api/investigations/cases')
        .set('Authorization', `Bearer ${userTokens[0]}`)
        .send({ title: `Invalid project link ${marker}`, projectId: projectIds[1].toString() });
      expect(foreignProjectLink.statusCode).toBe(404);

      const updatedCase = await request(app)
        .put(`/api/investigations/cases/${createdCase.body._id}`)
        .set('Authorization', `Bearer ${userTokens[0]}`)
        .send({ status: 'in_progress' });
      expect(updatedCase.statusCode).toBe(200);
      expect(updatedCase.body.status).toBe('in_progress');
      expect(await InvestigationCase.countDocuments({ userId: users[0], title: `Case ${marker}` })).toBe(1);

      const createdDraft = await request(app)
        .post('/api/automation/workflows')
        .set('Authorization', `Bearer ${userTokens[0]}`)
        .send({ name: `Draft ${marker}`, description: 'Not executable', frequency: 'weekly' });
      expect(createdDraft.statusCode).toBe(201);
      expect(createdDraft.body.status).toBe('draft');
      expect(createdDraft.body.enabled).toBe(false);

      const ownerDrafts = await request(app)
        .get('/api/automation/workflows')
        .set('Authorization', `Bearer ${userTokens[0]}`);
      expect(ownerDrafts.statusCode).toBe(200);
      expect(ownerDrafts.body.workflows.some((item) => item._id === createdDraft.body._id)).toBe(true);

      const otherUserDrafts = await request(app)
        .get('/api/automation/workflows')
        .set('Authorization', `Bearer ${userTokens[1]}`);
      expect(otherUserDrafts.statusCode).toBe(200);
      expect(otherUserDrafts.body.workflows.some((item) => item._id === createdDraft.body._id)).toBe(false);
      expect(await AutomationWorkflow.countDocuments({ userId: users[0], name: `Draft ${marker}` })).toBe(1);
    } finally {
      if (connected) {
        try {
          const Project = mongoose.models.Project;
          const InvestigationCase = mongoose.models.InvestigationCase;
          const AutomationWorkflow = mongoose.models.AutomationWorkflow;
          if (InvestigationCase) await InvestigationCase.deleteMany({ userId: { $in: users } });
          if (AutomationWorkflow) await AutomationWorkflow.deleteMany({ userId: { $in: users } });
          if (Project) await Project.deleteMany({ _id: { $in: projectIds }, userId: { $in: users } });
        } finally {
          await mongoose.disconnect();
        }
      }
    }
  },
  30000
);
