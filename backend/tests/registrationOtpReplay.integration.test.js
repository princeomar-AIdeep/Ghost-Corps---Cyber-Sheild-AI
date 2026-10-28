'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '5001';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'registration-otp-integration-test-secret';

const APPROVED_DATABASE_NAME = 'cyber_shield_registration_otp_test';
const testConfig = {
  uri: process.env.REGISTRATION_OTP_TEST_MONGO_URI,
  approvedHost: process.env.REGISTRATION_OTP_TEST_APPROVED_HOST,
  applicationHostDeny: process.env.REGISTRATION_OTP_APP_HOST_DENY,
};
const hasAnyTestConfig = Object.values(testConfig).some(Boolean);
const integrationTest = hasAnyTestConfig ? it : it.skip;

if (!hasAnyTestConfig) {
  console.info(
    '[skip] Registration OTP MongoDB integration test requires its dedicated URI, approved test host, ' +
    'and application-host deny settings.'
  );
}

function normalizeAtlasHost(host, label) {
  if (typeof host !== 'string' || !host.trim() || host !== host.trim()) {
    throw new Error(`${label} must be an Atlas hostname.`);
  }

  const normalized = host.toLowerCase().replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+mongodb\.net$/.test(normalized)) {
    throw new Error(`${label} must be a hostname under mongodb.net.`);
  }
  return normalized;
}

function assertApprovedTestUri({ uri, approvedHost, applicationHostDeny }) {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('Dedicated integration-test URI is required.');
  }
  if (typeof approvedHost !== 'string' || !approvedHost.trim()) {
    throw new Error('Approved test host is required.');
  }
  if (typeof applicationHostDeny !== 'string' || !applicationHostDeny.trim()) {
    throw new Error('Application host deny value is required.');
  }

  const approved = normalizeAtlasHost(approvedHost, 'Approved test host');
  const denied = normalizeAtlasHost(applicationHostDeny, 'Application host deny value');
  if (approved === denied) {
    throw new Error('Approved test host must differ from the application host.');
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Integration test URI must be a valid MongoDB URI.');
  }

  if (
    parsed.protocol !== 'mongodb+srv:' ||
    !parsed.hostname ||
    parsed.port ||
    !parsed.username ||
    !parsed.password ||
    uri.includes('#')
  ) {
    throw new Error('Integration test URI must include Atlas SRV host credentials and have no port or fragment.');
  }

  const uriHost = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (uriHost !== approved || uriHost === denied) {
    throw new Error('Integration test URI host is not the separately approved test cluster.');
  }

  if (parsed.pathname !== `/${APPROVED_DATABASE_NAME}`) {
    throw new Error(`Integration test URI must target only ${APPROVED_DATABASE_NAME}.`);
  }

  const allowedOptions = new Set(['retrywrites', 'w', 'appname']);
  const seenOptions = new Set();
  for (const key of parsed.searchParams.keys()) {
    const normalizedKey = key.toLowerCase();
    if (!allowedOptions.has(normalizedKey)) {
      throw new Error('Integration test URI contains an unapproved option.');
    }
    if (seenOptions.has(normalizedKey)) {
      throw new Error('Integration test URI contains duplicate options.');
    }
    seenOptions.add(normalizedKey);

    const values = parsed.searchParams.getAll(key);
    if (values.length !== 1) {
      throw new Error('Integration test URI contains duplicate options.');
    }
    const value = values[0];
    if (
      (normalizedKey === 'retrywrites' && value !== 'true') ||
      (normalizedKey === 'w' && value !== 'majority') ||
      (normalizedKey === 'appname' && !value)
    ) {
      throw new Error('Integration test URI contains an unsupported option value.');
    }
  }

  try {
    const { parseOptions } = require('mongodb/lib/connection_string');
    if (parseOptions(uri).dbName !== APPROVED_DATABASE_NAME) {
      throw new Error('Integration test URI driver database does not match the approved database.');
    }
  } catch (error) {
    if (error.message === 'Integration test URI driver database does not match the approved database.') {
      throw error;
    }
    throw new Error('Integration test URI is not accepted by the installed MongoDB driver.');
  }
}

describe('registration OTP MongoDB URI validation unit tests', () => {
  const approvedHost = 'test-cluster.example.mongodb.net';
  const applicationHostDeny = 'application-cluster.example.mongodb.net';
  const validUri = 'mongodb+srv://test-user:test-password@test-cluster.example.mongodb.net/cyber_shield_registration_otp_test?retryWrites=true&w=majority&appName=ReplayTest';
  const validConfig = {
    uri: validUri,
    approvedHost,
    applicationHostDeny,
  };

  it('accepts the separately approved Atlas test cluster and exact database', () => {
    expect(assertApprovedTestUri(validConfig)).toBeUndefined();
  });

  it('normalizes hostname case and trailing dots for exact host comparison', () => {
    const uri = validUri.replace('test-cluster.example.mongodb.net', 'TEST-CLUSTER.EXAMPLE.MONGODB.NET.');
    expect(assertApprovedTestUri({
      ...validConfig,
      uri,
      approvedHost: 'TEST-CLUSTER.EXAMPLE.MONGODB.NET.',
    })).toBeUndefined();
  });

  it.each([
    ['missing URI', { ...validConfig, uri: undefined }, 'Dedicated integration-test URI is required'],
    ['missing approved host', { ...validConfig, approvedHost: undefined }, 'Approved test host is required'],
    ['missing application-host deny value', { ...validConfig, applicationHostDeny: undefined }, 'Application host deny value is required'],
    ['malformed URI', { ...validConfig, uri: 'not a URI' }, 'valid MongoDB URI'],
    ['unsupported protocol', { ...validConfig, uri: validUri.replace('mongodb+srv:', 'http:') }, 'Atlas SRV host credentials'],
    ['URI port', { ...validConfig, uri: validUri.replace('test-cluster.example.mongodb.net/', 'test-cluster.example.mongodb.net:27017/') }, 'Atlas SRV host credentials'],
    ['missing URI credentials', { ...validConfig, uri: validUri.replace('test-user:test-password@', '') }, 'Atlas SRV host credentials'],
    ['unapproved host', { ...validConfig, uri: validUri.replace('test-cluster.example.mongodb.net', 'other-cluster.example.mongodb.net') }, 'separately approved test cluster'],
    ['application host', { ...validConfig, uri: validUri.replace('test-cluster.example.mongodb.net', 'application-cluster.example.mongodb.net') }, 'separately approved test cluster'],
    ['same approved and denied host', { ...validConfig, approvedHost: applicationHostDeny }, 'must differ from the application host'],
    ['malformed approved hostname', { ...validConfig, approvedHost: 'mongodb+srv://test-cluster.example.mongodb.net' }, 'hostname under mongodb.net'],
    ['malformed deny hostname', { ...validConfig, applicationHostDeny: 'application-cluster.example.mongodb.net/path' }, 'hostname under mongodb.net'],
    ['wrong database', { ...validConfig, uri: validUri.replace('/cyber_shield_registration_otp_test?', '/other_database?') }, 'target only'],
    ['encoded database path', { ...validConfig, uri: validUri.replace('/cyber_shield_registration_otp_test?', '/%63yber_shield_registration_otp_test?') }, 'target only'],
    ['extra path segment', { ...validConfig, uri: validUri.replace('?retryWrites', '/extra?retryWrites') }, 'target only'],
    ['fragment', { ...validConfig, uri: `${validUri}#fragment` }, 'fragment'],
    ['database override option', { ...validConfig, uri: `${validUri}&dbName=other_database` }, 'unapproved option'],
    ['encoded database override option', { ...validConfig, uri: `${validUri}&%64bName=other_database` }, 'unapproved option'],
    ['duplicate option', { ...validConfig, uri: `${validUri}&retryWrites=false` }, 'duplicate options'],
    ['unapproved option', { ...validConfig, uri: `${validUri}&tls=true` }, 'unapproved option'],
    ['unsafe retryWrites value', { ...validConfig, uri: validUri.replace('retryWrites=true', 'retryWrites=false') }, 'unsupported option value'],
    ['unsafe write concern', { ...validConfig, uri: validUri.replace('w=majority', 'w=1') }, 'unsupported option value'],
  ])('rejects unsafe URI configuration: %s', (_label, config, message) => {
    expect(() => assertApprovedTestUri(config)).toThrow(message);
  });

  it('rejects case-variant duplicate options as the MongoDB driver treats option names case-insensitively', () => {
    const uri = `${validUri}&RETRYwrites=false`;
    expect(() => assertApprovedTestUri({ ...validConfig, uri })).toThrow('duplicate options');
  });

  it('confirms the installed MongoDB driver resolves the URI path as the selected database', () => {
    const { parseOptions } = require('mongodb/lib/connection_string');
    expect(parseOptions(validUri).dbName).toBe(APPROVED_DATABASE_NAME);
  });

  it('rejects a database override query even though the driver gives the path precedence', () => {
    const { parseOptions } = require('mongodb/lib/connection_string');
    const uri = `${validUri}&dbName=other_database`;

    expect(parseOptions(uri).dbName).toBe(APPROVED_DATABASE_NAME);
    expect(() => assertApprovedTestUri({ ...validConfig, uri })).toThrow('unapproved option');
  });
});

integrationTest(
  'allows only one concurrent registration to consume an OTP pre-auth token in MongoDB',
  async () => {
    assertApprovedTestUri(testConfig);

    const mongoose = require('mongoose');
    let connected = false;
    let User;
    let RegistrationPreAuth;
    const email = `otp-replay-${require('crypto').randomUUID()}@example.com`;
    const jti = require('crypto').randomUUID();

    try {
      process.env.MONGO_URI = testConfig.uri;
      await mongoose.connect(testConfig.uri, {
        autoCreate: true,
        autoIndex: true,
        serverSelectionTimeoutMS: 2000,
      }).catch(() => {
        throw new Error(
          'MongoDB is unavailable at the approved integration-test URI; check the disposable test cluster and rerun.'
        );
      });
      connected = true;

      RegistrationPreAuth = require('../src/models/RegistrationPreAuth');
      User = require('../src/models/User');
      await RegistrationPreAuth.init();

      const indexes = await RegistrationPreAuth.collection.indexes();
      expect(indexes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          key: { jti: 1 },
          unique: true,
        }),
        expect.objectContaining({
          key: { expiresAt: 1 },
          expireAfterSeconds: 0,
        }),
      ]));

      const jwt = require('jsonwebtoken');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const token = jwt.sign(
        { tokenUse: 'otp-preauth', preAuth: true, email, scope: 'register' },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', jwtid: jti, expiresIn: '15m' }
      );
      await RegistrationPreAuth.create({ jti, email, expiresAt });

      const createApp = require('../app');
      const request = require('supertest');
      const app = createApp();
      const registrations = await Promise.all([
        request(app).post('/api/auth/register').send({
          email,
          password: 'IntegrationPassword123',
          preAuthToken: token,
        }),
        request(app).post('/api/auth/register').send({
          email,
          password: 'IntegrationPassword123',
          preAuthToken: token,
        }),
      ]);

      const successCount = registrations.filter((response) => response.statusCode === 201).length;
      expect(successCount).toBe(1);
      expect(registrations.map((response) => response.statusCode).sort()).toEqual([201, 400]);
      expect(await User.countDocuments({ email })).toBeLessThanOrEqual(1);
      expect(await RegistrationPreAuth.findOne({ jti, email })).toBeNull();
    } finally {
      if (connected) {
        try {
          if (User) await User.deleteOne({ email });
          if (RegistrationPreAuth) await RegistrationPreAuth.deleteOne({ jti });
        } finally {
          await mongoose.disconnect();
        }
      }
    }
  },
  15000
);
