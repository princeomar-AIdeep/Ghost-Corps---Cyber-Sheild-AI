'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');
const { isSensitiveOAuthCallback } = require('../src/utils/logger');

jest.mock('../src/modules/github/github.service', () => {
  class MockGitHubIntegrationError extends Error {
    constructor(code, message, statusCode) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }
  return {
    GitHubIntegrationError: MockGitHubIntegrationError,
    githubService: {
      getStatus: jest.fn(),
      startAuthorization: jest.fn(),
      completeAuthorization: jest.fn(),
        getDashboardReturnUrl: jest.fn(),
        listRepositories: jest.fn(),
        listBranches: jest.fn(),
        getRepositoryFile: jest.fn(),
        commitRepositoryFile: jest.fn(),
        disconnect: jest.fn(),
    },
  };
});

const { githubService, GitHubIntegrationError } = require('../src/modules/github/github.service');
const app = createApp();
const USER_ID = '65f1b2c3d4e5f67890123456';

function authorization(userId = USER_ID) {
  const token = jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'github-test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

describe('GitHub read-only API', () => {
  beforeEach(() => {
    githubService.getStatus.mockResolvedValue({ available: false, connected: false });
    githubService.startAuthorization.mockResolvedValue({
      authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=test&state=opaque',
    });
    githubService.completeAuthorization.mockResolvedValue({ connected: true });
    githubService.getDashboardReturnUrl.mockImplementation((result) => `https://frontend.example/dashboard?github=${result}`);
    githubService.listRepositories.mockResolvedValue({ repositories: [] });
    githubService.listBranches.mockResolvedValue({ branches: [] });
    githubService.getRepositoryFile.mockResolvedValue({ path: 'readme.md', sha: 'a'.repeat(40), content: 'ok' });
    githubService.commitRepositoryFile.mockResolvedValue({ commitSha: 'b'.repeat(40), path: 'readme.md' });
    githubService.disconnect.mockResolvedValue({ connected: false, revoked: true });
  });

  afterEach(() => jest.clearAllMocks());

  it('requires authentication for connection status, authorization start, and repositories', async () => {
    const requests = [
      request(app).get('/api/github/connection'),
      request(app).post('/api/github/connect'),
      request(app).get('/api/github/repositories'),
    ];
    const responses = await Promise.all(requests);

    expect(responses.map((response) => response.statusCode)).toEqual([401, 401, 401]);
    expect(githubService.getStatus).not.toHaveBeenCalled();
    expect(githubService.startAuthorization).not.toHaveBeenCalled();
    expect(githubService.listRepositories).not.toHaveBeenCalled();
  });

  it('scopes status and repository calls to the authenticated user', async () => {
    await request(app).get('/api/github/connection').set(authorization());
    await request(app).get('/api/github/repositories').set(authorization());

    expect(githubService.getStatus).toHaveBeenCalledWith(USER_ID);
    expect(githubService.listRepositories).toHaveBeenCalledWith(USER_ID);
  });

  it('requires authentication and passes the authenticated user to repository operations', async () => {
    const unauthenticated = await request(app).get('/api/github/repositories/acme/site/branches');
    expect(unauthenticated.statusCode).toBe(401);
    expect(githubService.listBranches).not.toHaveBeenCalled();

    await request(app).get('/api/github/repositories/acme/site/branches').set(authorization());
    await request(app).get('/api/github/repositories/acme/site/contents?path=README.md&ref=main').set(authorization());
    await request(app).put('/api/github/repositories/acme/site/contents').set(authorization()).send({
      path: 'README.md', content: 'updated', message: 'Update readme', branch: 'main',
    });

    expect(githubService.listBranches).toHaveBeenCalledWith(USER_ID, 'acme', 'site');
    expect(githubService.getRepositoryFile).toHaveBeenCalledWith(USER_ID, 'acme', 'site', 'README.md', 'main');
    expect(githubService.commitRepositoryFile).toHaveBeenCalledWith(USER_ID, 'acme', 'site', expect.objectContaining({ content: 'updated' }));
  });

  it('requires authentication to disconnect the GitHub connection', async () => {
    const denied = await request(app).delete('/api/github/connection');
    expect(denied.statusCode).toBe(401);
    const response = await request(app).delete('/api/github/connection').set(authorization());
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ connected: false, revoked: true });
    expect(githubService.disconnect).toHaveBeenCalledWith(USER_ID);
  });

  it('returns only the authorization URL from the start contract', async () => {
    const response = await request(app).post('/api/github/connect').set(authorization());

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=test&state=opaque',
    });
    expect(githubService.startAuthorization).toHaveBeenCalledWith(USER_ID);
  });

  it('redirects a successful callback to the dashboard without OAuth query values', async () => {
    const response = await request(app)
      .get(`/api/github/callback?state=${'A'.repeat(43)}&code=one-time-code`);

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('https://frontend.example/dashboard?github=connected');
    expect(response.headers.location).not.toContain('one-time-code');
    expect(githubService.getDashboardReturnUrl).toHaveBeenCalledWith('connected');
  });

  it('redirects safe callback errors without echoing OAuth query values', async () => {
    const secretLikeCode = 'do-not-echo-oauth-code';
    githubService.completeAuthorization.mockRejectedValueOnce(new GitHubIntegrationError(
      'GITHUB_INVALID_STATE',
      'GitHub authorization state is invalid or expired.',
      400
    ));
    const response = await request(app)
      .get(`/api/github/callback?state=${'A'.repeat(43)}&code=${secretLikeCode}`);

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('https://frontend.example/dashboard?github=error');
    expect(response.headers.location).not.toContain(secretLikeCode);
    expect(githubService.getDashboardReturnUrl).toHaveBeenCalledWith('error');
    expect(githubService.completeAuthorization).toHaveBeenCalled();
  });

  it('does not log OAuth callback query parameters', () => {
    expect(isSensitiveOAuthCallback({ url: `/api/github/callback?code=${'x'.repeat(20)}&state=${'y'.repeat(43)}` })).toBe(true);
    expect(isSensitiveOAuthCallback({ url: '/api/v1/github/callback?error=access_denied' })).toBe(true);
    expect(isSensitiveOAuthCallback({ url: `/api/preview-access/${'x'.repeat(43)}/src/main.jsx` })).toBe(true);
    expect(isSensitiveOAuthCallback({ url: '/api/github/repositories' })).toBe(false);
  });
});
