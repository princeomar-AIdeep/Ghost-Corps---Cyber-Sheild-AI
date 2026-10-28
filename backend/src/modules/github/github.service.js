'use strict';

const crypto = require('crypto');
const GitHubOAuthState = require('../../models/GitHubOAuthState');
const GitHubConnection = require('../../models/GitHubConnection');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const GITHUB_API_TIMEOUT_MS = 10 * 1000;
const API_VERSION = '2022-11-28';

class GitHubIntegrationError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'GitHubIntegrationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function readConfiguration() {
  const {
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL,
    GITHUB_DASHBOARD_URL,
    GITHUB_TOKEN_ENCRYPTION_KEY,
  } = process.env;
  if (
    !GITHUB_CLIENT_ID ||
    !GITHUB_CLIENT_SECRET ||
    !GITHUB_CALLBACK_URL ||
    !GITHUB_DASHBOARD_URL ||
    !GITHUB_TOKEN_ENCRYPTION_KEY
  ) {
    return null;
  }

  let callback;
  let dashboard;
  try {
    callback = new URL(GITHUB_CALLBACK_URL);
    dashboard = new URL(GITHUB_DASHBOARD_URL);
  } catch {
    return null;
  }
  const localHttpAllowed = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
  const localDashboardHttpAllowed = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1', '[::1]'].includes(dashboard.hostname);
  if (
    !['https:', ...(localHttpAllowed ? ['http:'] : [])].includes(callback.protocol)
    || callback.username || callback.password || callback.search || callback.hash
    || !['https:', ...(localDashboardHttpAllowed ? ['http:'] : [])].includes(dashboard.protocol)
    || dashboard.username || dashboard.password || dashboard.search || dashboard.hash
    || dashboard.pathname !== '/dashboard'
  ) {
    return null;
  }

  if (!/^[a-f\d]{64}$/i.test(GITHUB_TOKEN_ENCRYPTION_KEY)) return null;
  if (/^(your-|replace_|placeholder|change.?me)/i.test(GITHUB_CLIENT_ID)) return null;
  if (/^(your-|replace_|placeholder|change.?me)/i.test(GITHUB_CLIENT_SECRET)) return null;

  return {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackUrl: callback.toString(),
    dashboardUrl: dashboard.toString(),
    oauthScope: ['public_repo', 'repo'].includes(process.env.GITHUB_OAUTH_SCOPE)
      ? process.env.GITHUB_OAUTH_SCOPE
      : 'public_repo',
    encryptionKey: Buffer.from(GITHUB_TOKEN_ENCRYPTION_KEY, 'hex'),
  };
}

function unavailable() {
  return new GitHubIntegrationError(
    'GITHUB_UNAVAILABLE',
    'GitHub integration is unavailable because its server configuration is incomplete.',
    503
  );
}

function encryptAccessToken(token, encryptionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    encryptedAccessToken: ciphertext.toString('base64'),
    tokenIv: iv.toString('base64'),
    tokenAuthTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptAccessToken(connection, encryptionKey) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(connection.tokenIv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(connection.tokenAuthTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(connection.encryptedAccessToken, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function safeProviderError(statusCode = 502) {
  return new GitHubIntegrationError(
    'GITHUB_PROVIDER_ERROR',
    'GitHub could not complete the requested operation.',
    statusCode
  );
}

function validateRepositoryCoordinates(owner, repository) {
  if (
    typeof owner !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(owner)
    || typeof repository !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(repository)
    || repository === '.' || repository === '..'
  ) {
    throw new GitHubIntegrationError('GITHUB_INVALID_REPOSITORY', 'Invalid GitHub repository.', 400);
  }
}

function validateRepositoryPath(filePath) {
  if (
    typeof filePath !== 'string' || filePath.length < 1 || filePath.length > 512
    || filePath.startsWith('/') || filePath.includes('\\') || filePath.includes('\0')
    || filePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new GitHubIntegrationError('GITHUB_INVALID_PATH', 'Invalid repository file path.', 400);
  }
}

function createGitHubService({
  oauthStateModel = GitHubOAuthState,
  connectionModel = GitHubConnection,
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  encryptToken = encryptAccessToken,
  decryptToken = decryptAccessToken,
} = {}) {
  function getConfiguration() {
    const config = readConfiguration();
    if (!config) throw unavailable();
    return config;
  }

  async function getStatus(userId) {
    return {
      available: Boolean(readConfiguration()),
      connected: Boolean(await connectionModel.exists({ userId })),
    };
  }

  function getDashboardReturnUrl(result) {
    const config = getConfiguration();
    const url = new URL(config.dashboardUrl);
    url.searchParams.set('github', result === 'connected' ? 'connected' : 'error');
    return url.toString();
  }

  async function startAuthorization(userId) {
    const config = getConfiguration();
    const state = randomBytes(32).toString('base64url');
    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    await oauthStateModel.create({
      stateHash,
      userId,
      expiresAt: new Date(now() + OAUTH_STATE_TTL_MS),
    });

    const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
    authorizationUrl.searchParams.set('client_id', config.clientId);
    authorizationUrl.searchParams.set('redirect_uri', config.callbackUrl);
    authorizationUrl.searchParams.set('scope', config.oauthScope);
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('allow_signup', 'false');
    return { authorizationUrl: authorizationUrl.toString() };
  }

  async function consumeState(state) {
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
      throw new GitHubIntegrationError('GITHUB_INVALID_STATE', 'GitHub authorization state is invalid or expired.', 400);
    }
    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    const record = await oauthStateModel.findOneAndDelete({
      stateHash,
      expiresAt: { $gt: new Date(now()) },
    });
    if (!record) {
      throw new GitHubIntegrationError('GITHUB_INVALID_STATE', 'GitHub authorization state is invalid or expired.', 400);
    }
    return record;
  }

  async function exchangeCode(code, config) {
    let response;
    try {
      response = await fetchImpl('https://github.com/login/oauth/access_token', {
        method: 'POST',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.callbackUrl,
        }),
        signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.access_token !== 'string' || !payload.access_token) {
        throw safeProviderError();
      }
      return payload.access_token;
    } catch (error) {
      if (error instanceof GitHubIntegrationError) throw error;
      throw safeProviderError();
    }
  }

  async function completeAuthorization({ code, state, error }) {
    const config = getConfiguration();
    const stateRecord = await consumeState(state);
    if (error || typeof code !== 'string' || code.length < 1 || code.length > 2048) {
      throw new GitHubIntegrationError('GITHUB_AUTHORIZATION_DENIED', 'GitHub authorization was not completed.', 400);
    }

    const accessToken = await exchangeCode(code, config);
    let encrypted;
    try {
      encrypted = encryptToken(accessToken, config.encryptionKey);
    } catch {
      throw new GitHubIntegrationError(
        'GITHUB_TOKEN_STORAGE_ERROR',
        'GitHub authorization could not be stored securely.',
        503
      );
    }

    try {
      const profileResponse = await fetchImpl('https://api.github.com/user', {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'CYBER-SHIELD-AI',
        },
        signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
      });
      const profile = await profileResponse.json();
      if (!profileResponse.ok || !Number.isSafeInteger(profile.id) || typeof profile.login !== 'string') {
        throw safeProviderError();
      }
      await connectionModel.findOneAndUpdate(
        { userId: stateRecord.userId },
        {
          $set: {
            githubUserId: profile.id,
            login: profile.login,
            ...encrypted,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      if (err instanceof GitHubIntegrationError) throw err;
      throw safeProviderError();
    }
    return { connected: true };
  }

  async function listRepositories(userId) {
    const config = getConfiguration();
    const connection = await connectionModel.findOne({ userId })
      .select('+encryptedAccessToken +tokenIv +tokenAuthTag');
    if (!connection) {
      throw new GitHubIntegrationError('GITHUB_NOT_CONNECTED', 'A GitHub account is not connected.', 404);
    }

    let accessToken;
    try {
      accessToken = decryptToken(connection, config.encryptionKey);
    } catch {
      throw new GitHubIntegrationError(
        'GITHUB_TOKEN_DECRYPTION_ERROR',
        'The GitHub connection cannot be used with the current encryption configuration.',
        503
      );
    }

    try {
      const response = await fetchImpl('https://api.github.com/user/repos?per_page=100&sort=updated', {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'CYBER-SHIELD-AI',
        },
        signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
      });
      const repositories = await response.json();
      if (!response.ok || !Array.isArray(repositories)) throw safeProviderError();
      return {
        repositories: repositories
          .filter((repo) => Number.isSafeInteger(repo.id) && typeof repo.full_name === 'string')
          .map((repo) => ({
            id: repo.id,
            name: typeof repo.name === 'string' ? repo.name : '',
            fullName: repo.full_name,
            private: Boolean(repo.private),
            htmlUrl: typeof repo.html_url === 'string' ? repo.html_url : '',
            defaultBranch: typeof repo.default_branch === 'string' ? repo.default_branch : '',
          })),
      };
    } catch (error) {
      if (error instanceof GitHubIntegrationError) throw error;
      throw safeProviderError();
    }
  }

  async function disconnect(userId) {
    const config = getConfiguration();
    const connection = await connectionModel.findOne({ userId })
      .select('+encryptedAccessToken +tokenIv +tokenAuthTag');
    if (!connection) return { connected: false, revoked: false };

    let revoked = false;
    try {
      const accessToken = decryptToken(connection, config.encryptionKey);
      const response = await fetchImpl(`https://api.github.com/applications/${encodeURIComponent(config.clientId)}/grant`, {
        method: 'DELETE',
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${process.env.GITHUB_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'CYBER-SHIELD-AI',
        },
        body: JSON.stringify({ access_token: accessToken }),
        signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
      });
      revoked = response.status === 204 || response.ok;
    } catch {
      revoked = false;
    }
    await connectionModel.deleteOne({ userId });
    return { connected: false, revoked };
  }

  async function getRepositoryAccessToken(userId) {
    const config = getConfiguration();
    const connection = await connectionModel.findOne({ userId })
      .select('+encryptedAccessToken +tokenIv +tokenAuthTag');
    if (!connection) {
      throw new GitHubIntegrationError('GITHUB_NOT_CONNECTED', 'A GitHub account is not connected.', 404);
    }
    try {
      return { config, accessToken: decryptToken(connection, config.encryptionKey) };
    } catch {
      throw new GitHubIntegrationError(
        'GITHUB_TOKEN_DECRYPTION_ERROR',
        'The GitHub connection cannot be used with the current encryption configuration.',
        503
      );
    }
  }

  async function requestRepositoryApi(userId, url, { method = 'GET', body } = {}) {
    const { accessToken } = await getRepositoryAccessToken(userId);
    try {
      const response = await fetchImpl(url, {
        method,
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'CYBER-SHIELD-AI',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
      });
      const payload = await response.json();
      if (!response.ok) throw safeProviderError(response.status === 403 ? 403 : 502);
      return payload;
    } catch (error) {
      if (error instanceof GitHubIntegrationError) throw error;
      throw safeProviderError();
    }
  }

  async function listBranches(userId, owner, repository) {
    validateRepositoryCoordinates(owner, repository);
    const branches = await requestRepositoryApi(
      userId,
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/branches?per_page=100`
    );
    if (!Array.isArray(branches)) throw safeProviderError();
    return {
      branches: branches
        .filter((branch) => typeof branch.name === 'string' && typeof branch.commit?.sha === 'string')
        .map((branch) => ({ name: branch.name, commitSha: branch.commit.sha })),
    };
  }

  async function getRepositoryFile(userId, owner, repository, filePath, ref) {
    validateRepositoryCoordinates(owner, repository);
    validateRepositoryPath(filePath);
    if (ref !== undefined && (typeof ref !== 'string' || !/^[\w./-]{1,255}$/.test(ref) || ref.includes('..'))) {
      throw new GitHubIntegrationError('GITHUB_INVALID_REF', 'Invalid repository branch or ref.', 400);
    }
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const query = new URLSearchParams();
    if (ref) query.set('ref', ref);
    const result = await requestRepositoryApi(
      userId,
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}${query.size ? `?${query}` : ''}`
    );
    if (Array.isArray(result) || result?.type !== 'file' || typeof result.content !== 'string' || result.size > 1_000_000) {
      throw new GitHubIntegrationError('GITHUB_INVALID_FILE', 'The requested GitHub path is not a supported file.', 400);
    }
    return {
      path: filePath,
      sha: result.sha,
      content: Buffer.from(result.content.replace(/\s/g, ''), 'base64').toString('utf8'),
    };
  }

  async function commitRepositoryFile(userId, owner, repository, { path: filePath, content, message, branch, sha } = {}) {
    validateRepositoryCoordinates(owner, repository);
    validateRepositoryPath(filePath);
    if (
      typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 1_000_000
      || typeof message !== 'string' || message.trim().length < 1 || message.length > 200
      || typeof branch !== 'string' || !/^[\w./-]{1,255}$/.test(branch) || branch.includes('..')
      || (sha !== undefined && (typeof sha !== 'string' || !/^[a-f\d]{40}$/i.test(sha)))
    ) {
      throw new GitHubIntegrationError('GITHUB_INVALID_COMMIT', 'Invalid repository file commit request.', 400);
    }
    const result = await requestRepositoryApi(
      userId,
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'PUT',
        body: {
          message: message.trim(),
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch,
          ...(sha ? { sha } : {}),
        },
      }
    );
    if (typeof result?.commit?.sha !== 'string') throw safeProviderError();
    return {
      commitSha: result.commit.sha,
      path: result.content?.path || filePath,
      htmlUrl: typeof result.content?.html_url === 'string' ? result.content.html_url : null,
    };
  }

  return {
    getStatus,
    getDashboardReturnUrl,
    startAuthorization,
    completeAuthorization,
    listRepositories,
    disconnect,
    listBranches,
    getRepositoryFile,
    commitRepositoryFile,
  };
}

const githubService = createGitHubService();

module.exports = {
  GitHubIntegrationError,
  createGitHubService,
  encryptAccessToken,
  decryptAccessToken,
  githubService,
};
