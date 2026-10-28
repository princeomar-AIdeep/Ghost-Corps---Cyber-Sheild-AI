'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const WorkspaceFile = require('../../models/WorkspaceFile');

const DEFAULT_PREVIEW_IMAGE = 'cyber-shield-preview:vite6';
const MAX_LOG_BYTES = 64 * 1024;
const MAX_WORKSPACE_FILES = 2000;
const MAX_WORKSPACE_BYTES = 200 * 1024 * 1024;
const SESSION_TTL_MS = 30 * 60 * 1000;
const RUNTIME_PORT = 4173;

function safeText(value, maxBytes = MAX_LOG_BYTES) {
  const text = String(value || '');
  const bytes = Buffer.from(text);
  if (bytes.length <= maxBytes) return text;
  return `${bytes.subarray(bytes.length - maxBytes).toString('utf8')}\n[preview logs truncated]`;
}

function safeRelativePath(filePath) {
  return typeof filePath === 'string' && filePath.length <= 512
    && !filePath.startsWith('/') && !filePath.includes('\\') && !filePath.includes('\0')
    && !filePath.split('/').some((segment) => !segment || segment === '.' || segment === '..');
}

function runDocker(dockerPath, args, { timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerPath, args, { env: { PATH: process.env.PATH || '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    timeout.unref?.();
    child.stdout.on('data', (chunk) => { stdout = safeText(stdout + chunk.toString()); });
    child.stderr.on('data', (chunk) => { stderr = safeText(stderr + chunk.toString()); });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(safeText(stderr || `Docker command exited with status ${code}.`)));
    });
  });
}

function requestPreview(port, requestPath, req, res) {
  const upstream = http.request({
    host: '127.0.0.1',
    port,
    path: requestPath,
    method: req.method,
    headers: {
      accept: req.headers.accept || '*/*',
      'accept-encoding': 'identity',
      'user-agent': 'CYBER-SHIELD-preview-proxy',
    },
    timeout: 10_000,
  }, (upstreamResponse) => {
    res.status(upstreamResponse.statusCode || 502);
    const contentType = upstreamResponse.headers['content-type'];
    if (contentType) res.setHeader('Content-Type', contentType);
    if (req.headers.origin === 'null') res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (String(contentType || '').includes('text/html')) {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    }
    upstreamResponse.pipe(res);
  });
  upstream.once('timeout', () => upstream.destroy(new Error('Preview request timed out.')));
  upstream.once('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'Preview application is unavailable.' });
    else res.destroy();
  });
  upstream.end();
}

function createLocalPreviewBroker(options = {}) {
  const sessions = new Map();
  const dockerPath = options.dockerPath || process.env.TERMINAL_DOCKER_PATH || 'docker';
  const image = options.image || process.env.PREVIEW_SANDBOX_IMAGE || DEFAULT_PREVIEW_IMAGE;
  const runtimeUser = options.runtimeUser || `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`;
  const baseUrl = options.publicBaseUrl || process.env.PREVIEW_PUBLIC_BASE_URL;
  const dockerNetwork = options.network || process.env.PREVIEW_DOCKER_NETWORK;
  const egressPolicyConfirmed = options.networkPolicyConfirmed === true
    || process.env.PREVIEW_EGRESS_POLICY_CONFIRMED === 'true';
  const ttlMs = Number.isSafeInteger(options.sessionTtlMs) ? options.sessionTtlMs : SESSION_TTL_MS;
  const startupTimeoutMs = Number.isSafeInteger(options.startupTimeoutMs) ? options.startupTimeoutMs : 60_000;
  const loadFiles = options.loadFiles || ((projectId) => WorkspaceFile.find({ projectId }).sort({ path: 1 }).lean());

  async function writeWorkspace(projectId) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-preview-input-'));
    if (!options.loadFiles && WorkspaceFile?.db?.readyState !== 1) throw new Error('Workspace database is unavailable.');
    const files = await loadFiles(projectId);
    if (files.length > MAX_WORKSPACE_FILES) {
      fs.rmSync(root, { recursive: true, force: true });
      throw new Error('Preview project exceeds the file-count limit.');
    }
    let totalBytes = 0;
    for (const file of files) {
      if (!safeRelativePath(file.path)) continue;
      const segments = file.path.split('/');
      if (segments.some((segment) => segment === '.git' || segment === 'node_modules' || segment === '.env' || segment.startsWith('.env.'))) continue;
      const content = String(file.content || '');
      totalBytes += Buffer.byteLength(content, 'utf8');
      if (totalBytes > MAX_WORKSPACE_BYTES) {
        fs.rmSync(root, { recursive: true, force: true });
        throw new Error('Preview project exceeds the workspace size limit.');
      }
      const target = path.resolve(root, file.path);
      if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8', { mode: 0o600 });
    }
    return root;
  }

  async function removeSession(session) {
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    await runDocker(dockerPath, ['kill', '--signal=KILL', session.containerName]).catch(() => {});
    await runDocker(dockerPath, ['rm', '--force', session.containerName]).catch(() => {});
    try { fs.rmSync(session.workspaceRoot, { recursive: true, force: true }); } catch {}
  }

  return {
    async start(payload = {}) {
      if (!baseUrl || !dockerNetwork || !egressPolicyConfirmed) {
        throw new Error('Preview requires a public base URL, an operator-managed Docker network, and confirmed egress filtering.');
      }
      if (payload.projectType !== 'vite_react' || !safeRelativePath(payload.entryPath)) {
        throw new Error('Only supported Vite/React workspace projects can be previewed.');
      }
      const workspaceRoot = await writeWorkspace(payload.projectId);
      let packageData;
      try { packageData = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')); } catch {}
      const allDependencies = { ...packageData?.dependencies, ...packageData?.devDependencies };
      if (!allDependencies.vite || !allDependencies.react || !allDependencies['react-dom']) {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
        throw new Error('Preview requires package.json dependencies for Vite, React, and React DOM.');
      }

      const sessionId = payload.sessionId;
      const capability = randomBytes(32).toString('base64url');
      const containerName = `cyber-preview-${sessionId.replace(/-/g, '')}`;
      const root = baseUrl.replace(/\/+$/, '');
      const accessPath = `/api/preview-access/${capability}/`;
      const session = {
        userId: String(payload.userId),
        projectId: String(payload.projectId),
        sessionId,
        capability,
        containerName,
        network: dockerNetwork,
        workspaceRoot,
        status: 'starting',
        startedAt: Date.now(),
        stdout: '',
        stderr: '',
        port: null,
        previewUrl: `${root}${accessPath}`,
        expiryTimer: null,
      };
      sessions.set(sessionId, session);

      try {
        await runDocker(dockerPath, [
          'run', '-d', '--pull=never', '--name', containerName,
          '--network', dockerNetwork, '--publish', `127.0.0.1::${RUNTIME_PORT}/tcp`,
          '--label', 'cyber-shield.preview=true',
          '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
          '--pids-limit=128', '--memory=512m', '--memory-swap=512m', '--cpus=1',
          '--ulimit', 'fsize=67108864:67108864', '--user', runtimeUser,
          '--workdir=/workspace', '--tmpfs', '/workspace:rw,nosuid,nodev,size=256m,mode=1777',
          '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=64m',
          '--mount', `type=bind,src=${workspaceRoot},dst=/project-input,readonly`,
          image, 'vite', '--host', '0.0.0.0', '--port', String(RUNTIME_PORT), '--strictPort', '--hmr', 'false', '--base', accessPath,
        ]);
        const published = await runDocker(dockerPath, ['port', containerName, `${RUNTIME_PORT}/tcp`]);
        const match = published.match(/127\.0\.0\.1:(\d+)/);
        if (!match) throw new Error('Preview container did not publish a loopback port.');
        session.port = Number(match[1]);
        session.expiryTimer = setTimeout(() => {
          session.status = 'expired';
          removeSession(session);
        }, ttlMs);
        session.expiryTimer.unref?.();
        return true;
      } catch (error) {
        session.status = 'failed';
        session.stderr = safeText(error.message);
        await removeSession(session);
        session.expiryTimer = setTimeout(() => sessions.delete(sessionId), ttlMs);
        session.expiryTimer.unref?.();
      }
      return true;
    },

    async getStatus(payload = {}) {
      const session = sessions.get(payload.sessionId);
      if (!session || session.userId !== String(payload.userId) || session.projectId !== String(payload.projectId)) {
        return null;
      }
      if (session.status === 'starting' && session.port) {
        try {
          const response = await fetch(`http://127.0.0.1:${session.port}/`, {
            signal: AbortSignal.timeout(1500),
          });
          if (response.ok) session.status = 'ready';
          else if (Date.now() - session.startedAt > startupTimeoutMs) {
            session.status = 'failed';
            session.stderr = `Preview readiness returned HTTP ${response.status}.`;
            await removeSession(session);
            session.expiryTimer = setTimeout(() => sessions.delete(session.sessionId), ttlMs);
            session.expiryTimer.unref?.();
          }
        } catch {
          if (Date.now() - session.startedAt > startupTimeoutMs) {
            session.status = 'failed';
            try {
              session.stderr = await runDocker(dockerPath, ['logs', '--tail', '100', session.containerName], { timeoutMs: 2000 });
            } catch (error) {
              session.stderr = safeText(error.message);
            }
            await removeSession(session);
            session.expiryTimer = setTimeout(() => sessions.delete(session.sessionId), ttlMs);
            session.expiryTimer.unref?.();
          }
        }
      }
      return {
        status: session.status,
        ...(session.status === 'ready' ? { previewUrl: session.previewUrl } : {}),
        ...(session.stderr ? { stderr: safeText(session.stderr) } : {}),
      };
    },

    async stop(payload = {}) {
      const session = sessions.get(payload.sessionId);
      if (!session || session.userId !== String(payload.userId) || session.projectId !== String(payload.projectId)) return false;
      session.status = 'stopped';
      await removeSession(session);
      session.expiryTimer = setTimeout(() => sessions.delete(session.sessionId), ttlMs);
      session.expiryTimer.unref?.();
      return true;
    },

    proxy(token, req, res) {
      const session = [...sessions.values()].find((value) => value.capability === token && value.status === 'ready');
      if (!session || !session.port) return res.status(404).json({ error: 'Preview not found.' });
      if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).json({ error: 'Preview method is not allowed.' });
      const relativePath = req.url.split('?')[0];
      if (relativePath.includes('..') || relativePath.includes('\\') || relativePath.includes('\0')) {
        return res.status(400).json({ error: 'Invalid preview path.' });
      }
      const requestPath = `${new URL(session.previewUrl).pathname.replace(/\/$/, '')}${req.url}`;
      return requestPreview(session.port, requestPath, req, res);
    },
    get available() {
      return Boolean(baseUrl && dockerNetwork && egressPolicyConfirmed);
    },
    async cleanup() {
      await Promise.all([...sessions.values()].map(removeSession));
      sessions.clear();
    },
  };
}

module.exports = { createLocalPreviewBroker, DEFAULT_PREVIEW_IMAGE, safeRelativePath };
