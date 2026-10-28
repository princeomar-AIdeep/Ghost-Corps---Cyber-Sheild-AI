'use strict';

const http = require('http');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');
const { createLocalPreviewBroker, DEFAULT_PREVIEW_IMAGE } = require('../src/modules/preview/localPreviewBroker');

const files = [
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'preview-smoke-test',
      private: true,
      type: 'module',
      dependencies: { vite: '^6.4.1', react: '^18.3.1', 'react-dom': '^18.3.1' },
    }),
  },
  { path: 'index.html', content: '<html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
  { path: 'src/main.jsx', content: "import React from 'react'; import { createRoot } from 'react-dom/client'; createRoot(document.getElementById('root')).render(React.createElement('h1', null, 'Preview is live'));" },
];

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    }).on('error', reject);
  });
}

describe('isolated Vite preview worker integration', () => {
  it('fails closed before workspace access when egress-filtered network setup is absent', async () => {
    const loadFiles = jest.fn();
    const broker = createLocalPreviewBroker({ publicBaseUrl: 'https://preview.example', loadFiles });
    await expect(broker.start({ projectId: 'project-1', projectType: 'vite_react', entryPath: 'index.html' }))
      .rejects.toThrow(/operator-managed Docker network/i);
    expect(loadFiles).not.toHaveBeenCalled();
    expect(broker.available).toBe(false);
  });

  it('starts React in Docker, waits for HTTP readiness, proxies the app, scopes access, and cleans up', async () => {
    if (
      spawnSync('docker', ['image', 'inspect', DEFAULT_PREVIEW_IMAGE], { stdio: 'ignore' }).status !== 0
      || !process.env.PREVIEW_DOCKER_NETWORK
      || process.env.PREVIEW_EGRESS_POLICY_CONFIRMED !== 'true'
    ) {
      console.info('[skip] Real preview test requires the image and an operator-managed, egress-filtered Docker network.');
      return;
    }
    const broker = createLocalPreviewBroker({
      publicBaseUrl: 'http://127.0.0.1:1',
      network: process.env.PREVIEW_DOCKER_NETWORK,
      networkPolicyConfirmed: true,
      loadFiles: async () => files,
      sessionTtlMs: 60_000,
      startupTimeoutMs: 30_000,
    });
    const scope = { userId: 'owner-1', projectId: 'project-1', sessionId: randomUUID(), projectType: 'vite_react', entryPath: 'index.html' };
    let proxyServer;
    try {
      await expect(broker.start(scope)).resolves.toBe(true);
      let status;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        status = await broker.getStatus(scope);
        if (status.status === 'ready' || status.status === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(status).toEqual({ status: 'ready', previewUrl: expect.any(String) });
      expect(status.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:1\/api\/preview-access\/[A-Za-z0-9_-]{43}\/$/);
      expect(await broker.getStatus({ ...scope, userId: 'other-user' })).toBeNull();

      const token = new URL(status.previewUrl).pathname.split('/')[3];
      proxyServer = http.createServer((req, res) => {
        req.url = req.url.slice(`/api/preview-access/${token}`.length) || '/';
        broker.proxy(token, req, res);
      });
      await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
      const proxyUrl = `http://127.0.0.1:${proxyServer.address().port}/api/preview-access/${token}/`;
      const page = await get(proxyUrl);
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('src="/api/preview-access/');
      expect(page.headers['content-security-policy']).toContain("object-src 'none'");
      const assetPath = page.body.match(/src="([^"]+\.jsx)"/)[1];
      const asset = await get(new URL(assetPath, proxyUrl));
      expect(asset.statusCode).toBe(200);
      expect(asset.body).toContain('Preview is live');

      await expect(broker.stop(scope)).resolves.toBe(true);
      expect(await broker.getStatus(scope)).toMatchObject({ status: 'stopped' });
    } finally {
      if (proxyServer) await new Promise((resolve) => proxyServer.close(resolve));
      await broker.cleanup();
    }
  });
});