'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const crypto = require('crypto');
const {
  GitHubIntegrationError,
  createGitHubService,
  encryptAccessToken,
  decryptAccessToken,
} = require('../src/modules/github/github.service');

const USER_ID = '65f1b2c3d4e5f67890123456';
const CLIENT_ID = 'test-github-client-id';
const CLIENT_SECRET = 'test-github-client-secret';
const CALLBACK_URL = 'https://backend.example/api/github/callback';
const DASHBOARD_URL = 'https://frontend.example/dashboard';
const ENCRYPTION_KEY = Buffer.alloc(32, 23).toString('hex');
const TOKEN = 'gho-test-token-not-for-real-use';
const NOW = Date.parse('2030-01-01T00:00:00.000Z');

function setConfiguration() {
  process.env.GITHUB_CLIENT_ID = CLIENT_ID;
  process.env.GITHUB_CLIENT_SECRET = CLIENT_SECRET;
  process.env.GITHUB_CALLBACK_URL = CALLBACK_URL;
  process.env.GITHUB_DASHBOARD_URL = DASHBOARD_URL;
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = ENCRYPTION_KEY;
}

function response(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

describe('GitHub integration service', () => {
  let oauthStateModel;
  let connectionModel;
  let fetchImpl;

  beforeEach(() => {
    setConfiguration();
    oauthStateModel = {
      create: jest.fn().mockResolvedValue({}),
      findOneAndDelete: jest.fn(),
    };
    connectionModel = {
      exists: jest.fn().mockResolvedValue(null),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    fetchImpl = jest.fn();
  });

  afterEach(() => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_CALLBACK_URL;
    delete process.env.GITHUB_DASHBOARD_URL;
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    jest.restoreAllMocks();
  });

  it('creates short-lived, hashed state bound to the authenticated user', async () => {
    const service = createGitHubService({
      oauthStateModel,
      connectionModel,
      fetchImpl,
      now: () => NOW,
      randomBytes: () => Buffer.alloc(32, 9),
    });

    const { authorizationUrl } = await service.startAuthorization(USER_ID);
    const url = new URL(authorizationUrl);
    const state = url.searchParams.get('state');
    const stateHash = crypto.createHash('sha256').update(state).digest('hex');

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK_URL);
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(oauthStateModel.create).toHaveBeenCalledWith({
      stateHash,
      userId: USER_ID,
      expiresAt: new Date(NOW + 10 * 60 * 1000),
    });
    expect(oauthStateModel.create.mock.calls[0][0]).not.toHaveProperty('state');
  });

  it('consumes valid state once and stores an encrypted token against its initiating user', async () => {
    const state = Buffer.alloc(32, 11).toString('base64url');
    oauthStateModel.findOneAndDelete.mockResolvedValueOnce({ userId: USER_ID });
    fetchImpl
      .mockResolvedValueOnce(response({ access_token: TOKEN }))
      .mockResolvedValueOnce(response({ id: 12345, login: 'test-user' }));
    const service = createGitHubService({
      oauthStateModel,
      connectionModel,
      fetchImpl,
      now: () => NOW,
    });

    await expect(service.completeAuthorization({ state, code: 'test-oauth-code' }))
      .resolves.toEqual({ connected: true });

    expect(oauthStateModel.findOneAndDelete).toHaveBeenCalledWith({
      stateHash: crypto.createHash('sha256').update(state).digest('hex'),
      expiresAt: { $gt: new Date(NOW) },
    });
    expect(connectionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: USER_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          githubUserId: 12345,
          login: 'test-user',
          encryptedAccessToken: expect.any(String),
          tokenIv: expect.any(String),
          tokenAuthTag: expect.any(String),
        }),
      }),
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const stored = connectionModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(JSON.stringify(stored)).not.toContain(TOKEN);
    expect(JSON.stringify({ connected: true })).not.toContain(TOKEN);
  });

  it('rejects expired, replayed, or unknown state before contacting GitHub', async () => {
    oauthStateModel.findOneAndDelete.mockResolvedValue(null);
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl, now: () => NOW });
    const state = Buffer.alloc(32, 12).toString('base64url');

    await expect(service.completeAuthorization({ state, code: 'test-code' }))
      .rejects.toMatchObject({ code: 'GITHUB_INVALID_STATE', statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed state before consuming or exchanging it', async () => {
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });

    await expect(service.completeAuthorization({ state: 'not-state', code: 'test-code' }))
      .rejects.toMatchObject({ code: 'GITHUB_INVALID_STATE' });
    expect(oauthStateModel.findOneAndDelete).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when configuration, including encryption, is unavailable', async () => {
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });

    await expect(service.startAuthorization(USER_ID))
      .rejects.toMatchObject({ code: 'GITHUB_UNAVAILABLE', statusCode: 503 });
    await expect(service.completeAuthorization({ state: 'a'.repeat(43), code: 'test-code' }))
      .rejects.toMatchObject({ code: 'GITHUB_UNAVAILABLE', statusCode: 503 });
    expect(oauthStateModel.create).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when the dashboard return URL is absent or unsafe', async () => {
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });
    delete process.env.GITHUB_DASHBOARD_URL;
    await expect(service.startAuthorization(USER_ID))
      .rejects.toMatchObject({ code: 'GITHUB_UNAVAILABLE', statusCode: 503 });

    process.env.GITHUB_DASHBOARD_URL = 'https://attacker.example/redirect';
    await expect(Promise.resolve().then(() => service.getDashboardReturnUrl('connected')))
      .rejects.toMatchObject({ code: 'GITHUB_UNAVAILABLE', statusCode: 503 });
  });

  it('builds a dashboard callback URL with only a generic connection result', () => {
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });
    expect(service.getDashboardReturnUrl('connected')).toBe(`${DASHBOARD_URL}?github=connected`);
    expect(service.getDashboardReturnUrl('error')).toBe(`${DASHBOARD_URL}?github=error`);
  });

  it('never stores or returns a token if encryption fails', async () => {
    const state = Buffer.alloc(32, 14).toString('base64url');
    oauthStateModel.findOneAndDelete.mockResolvedValue({ userId: USER_ID });
    fetchImpl.mockResolvedValueOnce(response({ access_token: TOKEN }));
    const service = createGitHubService({
      oauthStateModel,
      connectionModel,
      fetchImpl,
      encryptToken: () => { throw new Error('sensitive implementation detail'); },
    });

    await expect(service.completeAuthorization({ state, code: 'test-code' }))
      .rejects.toMatchObject({
        code: 'GITHUB_TOKEN_STORAGE_ERROR',
        message: 'GitHub authorization could not be stored securely.',
      });
    expect(connectionModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns only an allowlist of repository metadata for the authenticated connection', async () => {
    const encrypted = encryptAccessToken(TOKEN, Buffer.from(ENCRYPTION_KEY, 'hex'));
    const connection = {
      ...encrypted,
      select: jest.fn().mockResolvedValue({
        ...encrypted,
      }),
    };
    connectionModel.findOne.mockReturnValue(connection);
    fetchImpl.mockResolvedValueOnce(response([{
      id: 42,
      name: 'safe-repo',
      full_name: 'test-user/safe-repo',
      private: true,
      html_url: 'https://github.com/test-user/safe-repo',
      default_branch: 'main',
      access_token: 'must-not-be-returned',
      permissions: { admin: true },
    }]));
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });

    const result = await service.listRepositories(USER_ID);
    expect(result).toEqual({
      repositories: [{
        id: 42,
        name: 'safe-repo',
        fullName: 'test-user/safe-repo',
        private: true,
        htmlUrl: 'https://github.com/test-user/safe-repo',
        defaultBranch: 'main',
      }],
    });
    expect(connectionModel.findOne).toHaveBeenCalledWith({ userId: USER_ID });
    expect(connection.select).toHaveBeenCalledWith('+encryptedAccessToken +tokenIv +tokenAuthTag');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/user/repos?per_page=100&sort=updated');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(result)).not.toContain('must-not-be-returned');
  });

  it('lists real branches, pulls repository file contents, and commits a user-requested file', async () => {
    const encrypted = encryptAccessToken(TOKEN, Buffer.from(ENCRYPTION_KEY, 'hex'));
    connectionModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(encrypted),
    });
    fetchImpl
      .mockResolvedValueOnce(response([{ name: 'main', commit: { sha: 'a'.repeat(40) } }]))
      .mockResolvedValueOnce(response({
        type: 'file',
        sha: 'b'.repeat(40),
        size: 5,
        content: Buffer.from('hello').toString('base64'),
      }))
      .mockResolvedValueOnce(response({
        commit: { sha: 'c'.repeat(40) },
        content: { path: 'src/App.jsx', html_url: 'https://github.com/acme/site/blob/main/src/App.jsx' },
      }));
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });

    await expect(service.listBranches(USER_ID, 'acme', 'site')).resolves.toEqual({
      branches: [{ name: 'main', commitSha: 'a'.repeat(40) }],
    });
    await expect(service.getRepositoryFile(USER_ID, 'acme', 'site', 'src/App.jsx', 'main'))
      .resolves.toEqual({ path: 'src/App.jsx', sha: 'b'.repeat(40), content: 'hello' });
    await expect(service.commitRepositoryFile(USER_ID, 'acme', 'site', {
      path: 'src/App.jsx',
      content: 'updated',
      message: 'Update App',
      branch: 'main',
      sha: 'b'.repeat(40),
    })).resolves.toMatchObject({ commitSha: 'c'.repeat(40), path: 'src/App.jsx' });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][1].method).toBe('PUT');
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toMatchObject({
      message: 'Update App',
      content: Buffer.from('updated').toString('base64'),
      branch: 'main',
      sha: 'b'.repeat(40),
    });
    expect(fetchImpl.mock.calls.every(([, options]) => options.headers.Authorization === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('rejects unsafe repository paths and hides GitHub permission failures', async () => {
    const encrypted = encryptAccessToken(TOKEN, Buffer.from(ENCRYPTION_KEY, 'hex'));
    connectionModel.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(encrypted) });
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });

    await expect(service.getRepositoryFile(USER_ID, 'acme', 'site', '../secrets', 'main'))
      .rejects.toMatchObject({ code: 'GITHUB_INVALID_PATH', statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();

    fetchImpl.mockResolvedValueOnce(response({ message: `Forbidden ${TOKEN}` }, false, 403));
    let caught;
    try {
      await service.listBranches(USER_ID, 'acme', 'site');
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: 'GITHUB_PROVIDER_ERROR',
      statusCode: 403,
      message: 'GitHub could not complete the requested operation.',
    });
    expect(JSON.stringify(caught)).not.toContain(TOKEN);
  });

  it('hides provider error details and tokens from safe errors', async () => {
    const state = Buffer.alloc(32, 15).toString('base64url');
    oauthStateModel.findOneAndDelete.mockResolvedValue({ userId: USER_ID });
    fetchImpl.mockResolvedValueOnce(response({
      error: 'bad_verification_code',
      error_description: `Rejected ${TOKEN}`,
    }, false));
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });

    let caught;
    try {
      await service.completeAuthorization({ state, code: 'test-code' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(GitHubIntegrationError);
    expect(caught.message).toBe('GitHub could not complete the requested operation.');
    expect(caught.message).not.toContain(TOKEN);
    expect(JSON.stringify(caught)).not.toContain(TOKEN);
    expect(connectionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('authenticates token ciphertext with AES-256-GCM', () => {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const encrypted = encryptAccessToken(TOKEN, key);

    expect(encrypted.encryptedAccessToken).not.toBe(TOKEN);
    expect(decryptAccessToken(encrypted, key)).toBe(TOKEN);
    expect(() => decryptAccessToken(encrypted, Buffer.alloc(32, 24))).toThrow();
  });

  it('revokes the connected GitHub token and always removes local token storage', async () => {
    const encrypted = encryptAccessToken(TOKEN, Buffer.from(ENCRYPTION_KEY, 'hex'));
    connectionModel.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(encrypted) });
    fetchImpl.mockResolvedValueOnce({ ok: true, status: 204 });
    const service = createGitHubService({ oauthStateModel, connectionModel, fetchImpl });

    await expect(service.disconnect(USER_ID)).resolves.toEqual({ connected: false, revoked: true });
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://api.github.com/applications/${CLIENT_ID}/grant`);
    expect(fetchImpl.mock.calls[0][1].method).toBe('DELETE');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ access_token: TOKEN });
    expect(connectionModel.deleteOne).toHaveBeenCalledWith({ userId: USER_ID });
  });
});
