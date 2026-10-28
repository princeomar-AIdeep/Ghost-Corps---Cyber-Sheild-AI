'use strict';

const {
  createPreviewService,
  PreviewServiceError,
} = require('../src/modules/preview/preview.service');

const scope = { userId: 'owner-1', projectId: 'project-1' };

describe('preview service adapter contract', () => {
  it('fails closed without an approved isolated preview adapter', async () => {
    const service = createPreviewService();

    await expect(service.start({
      ...scope,
      projectType: 'vite_react',
      entryPath: 'index.html',
    })).rejects.toMatchObject({ code: 'PREVIEW_UNAVAILABLE', statusCode: 503 });
    await expect(service.getStatus({ ...scope, sessionId: 'session-1' }))
      .rejects.toMatchObject({ code: 'PREVIEW_UNAVAILABLE', statusCode: 503 });
    await expect(service.stop({ ...scope, sessionId: 'session-1' }))
      .rejects.toMatchObject({ code: 'PREVIEW_UNAVAILABLE', statusCode: 503 });
  });

  it.each([
    ['missing', undefined, 'index.html'],
    ['unsupported project type', 'node_server', 'index.html'],
    ['path traversal', 'vite_react', '../secret.html'],
    ['absolute path', 'vite_react', '/index.html'],
    ['non-HTML entry', 'vite_react', 'src/main.js'],
  ])('rejects %s before calling the preview adapter', async (_label, projectType, entryPath) => {
    const adapter = { start: jest.fn().mockResolvedValue(true) };
    const service = createPreviewService(adapter);

    await expect(service.start({ ...scope, projectType, entryPath })).rejects.toBeInstanceOf(PreviewServiceError);
    expect(adapter.start).not.toHaveBeenCalled();
  });

  it('sends only a validated project-scoped request to the adapter', async () => {
    const adapter = { start: jest.fn().mockResolvedValue(true) };
    const service = createPreviewService(adapter);

    const result = await service.start({
      ...scope,
      projectType: 'vite_react',
      entryPath: 'src/index.html',
    });

    expect(result).toEqual({ sessionId: expect.any(String), status: 'starting' });
    expect(adapter.start).toHaveBeenCalledWith({
      ...scope,
      sessionId: result.sessionId,
      projectType: 'vite_react',
      entryPath: 'src/index.html',
    }, { signal: expect.any(AbortSignal) });
    expect(result).not.toHaveProperty('url');
  });

  it('limits status output to known state and never passes through a worker URL', async () => {
    const adapter = {
      getStatus: jest.fn().mockResolvedValue({
        status: 'ready',
        previewUrl: 'https://preview.example/api/preview-access/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
        output: 'untrusted content',
      }),
    };
    const service = createPreviewService(adapter);
    process.env.PREVIEW_PUBLIC_BASE_URL = 'https://preview.example/';
    const result = await service.getStatus({ ...scope, sessionId: 'session-1' });

    expect(result).toEqual({
      sessionId: 'session-1',
      status: 'ready',
      previewUrl: 'https://preview.example/api/preview-access/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
    });
    expect(result).not.toHaveProperty('url');
    delete process.env.PREVIEW_PUBLIC_BASE_URL;
    adapter.getStatus.mockResolvedValueOnce({ status: 'unknown' });
    await expect(service.getStatus({ ...scope, sessionId: 'session-1' }))
      .rejects.toMatchObject({ code: 'PREVIEW_SERVICE_ERROR', statusCode: 502 });
  });

  it('times out and aborts adapter requests', async () => {
    let signal;
    const adapter = {
      start: jest.fn((_payload, options) => {
        signal = options.signal;
        return new Promise(() => {});
      }),
    };
    const service = createPreviewService(adapter, { timeoutMs: 5 });

    await expect(service.start({
      ...scope,
      projectType: 'vite_react',
      entryPath: 'index.html',
    })).rejects.toMatchObject({ code: 'PREVIEW_TIMEOUT', statusCode: 504 });
    expect(signal.aborted).toBe(true);
  });

  it('rejects invalid timeout limits', () => {
    expect(() => createPreviewService({}, { timeoutMs: 0 }))
      .toThrow('Preview service timeout must be a positive integer.');
  });
});
