'use strict';

const { randomUUID } = require('crypto');
const {
  createTerminalService,
  TerminalServiceError,
  MAX_OUTPUT_BYTES,
} = require('../src/modules/terminal/terminal.service');

describe('terminal service broker adapter', () => {
  const scope = {
    userId: 'owner-1',
    projectId: 'project-1',
  };

  it('uses the local broker by default and creates an opaque server-side job ID', async () => {
    const service = createTerminalService();
    const result = await service.submit({ ...scope, taskType: 'project_test' });

    expect(result).toEqual({ jobId: expect.any(String), status: 'queued' });
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/i);

    const status = await service.getStatus({ ...scope, jobId: result.jobId });
    expect(status.jobId).toBe(result.jobId);
    expect(['queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled']).toContain(status.status);
  });

  it('creates an opaque server-side job ID and sends only validated task metadata to the broker', async () => {
    const broker = { submit: jest.fn().mockResolvedValue(true) };
    const service = createTerminalService(broker);
    const result = await service.submit({ ...scope, taskType: 'project_test' });

    expect(result).toEqual({ jobId: expect.any(String), status: 'queued' });
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(broker.submit).toHaveBeenCalledWith({
      jobId: result.jobId,
      ...scope,
      taskType: 'project_test',
    }, { signal: expect.any(AbortSignal) });
    expect(broker.submit.mock.calls[0][0]).not.toHaveProperty('command');
  });

  it('accepts the supported project build workflow in addition to tests', async () => {
    const broker = { submit: jest.fn().mockResolvedValue(true) };
    const service = createTerminalService(broker);
    await expect(service.submit({ ...scope, taskType: 'project_build' }))
      .resolves.toMatchObject({ status: 'queued' });
    expect(broker.submit.mock.calls[0][0]).toMatchObject({ ...scope, taskType: 'project_build' });
  });

  it('validates and forwards a supported command without shell parsing', async () => {
    const broker = { submit: jest.fn().mockResolvedValue(true) };
    const service = createTerminalService(broker);
    const result = await service.submit({ ...scope, command: 'npm run lint' });

    expect(result).toEqual({ jobId: expect.any(String), status: 'queued' });
    expect(broker.submit).toHaveBeenCalledWith({
      jobId: result.jobId,
      ...scope,
      command: 'npm run lint',
    }, { signal: expect.any(AbortSignal) });
  });

  it('rejects unsupported commands before calling the broker', async () => {
    const broker = { submit: jest.fn().mockResolvedValue(true) };
    const service = createTerminalService(broker);

    await expect(service.submit({ ...scope, command: 'pwd; cat /etc/passwd' }))
      .rejects.toMatchObject({
        code: 'TERMINAL_INVALID_COMMAND',
        statusCode: 400,
      });
    expect(broker.submit).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['unknown', 'shell_command'],
    ['malformed', ['project_test']],
  ])('rejects %s task types before calling the broker', async (_label, taskType) => {
    const broker = { submit: jest.fn().mockResolvedValue(true) };
    const service = createTerminalService(broker);
    const input = taskType === undefined ? scope : { ...scope, taskType };

    await expect(service.submit(input)).rejects.toMatchObject({
      code: 'TERMINAL_INVALID_TASK_TYPE',
      statusCode: 400,
      message: 'The requested terminal task type is not allowed.',
    });
    expect(broker.submit).not.toHaveBeenCalled();
  });

  it('rejects a missing submission input without calling the broker', async () => {
    const broker = { submit: jest.fn().mockResolvedValue(true) };
    const service = createTerminalService(broker);

    await expect(service.submit()).rejects.toMatchObject({
      code: 'TERMINAL_INVALID_TASK_TYPE',
      statusCode: 400,
    });
    expect(broker.submit).not.toHaveBeenCalled();
  });

  it('converts broker failures to safe errors without preserving sensitive details', async () => {
    const broker = {
      submit: jest.fn().mockRejectedValue(new Error('private broker credential or command data')),
    };
    const service = createTerminalService(broker);

    await expect(service.submit({ ...scope, taskType: 'project_test' }))
      .rejects.toMatchObject({
        code: 'TERMINAL_BROKER_ERROR',
        statusCode: 502,
        message: 'The terminal broker could not complete the request.',
      });
  });

  it.each(['submit', 'getStatus', 'cancel'])('aborts a broker %s request after the configured timeout', async (method) => {
    let signal;
    const broker = {
      [method]: jest.fn((_payload, options) => {
        signal = options.signal;
        return new Promise(() => {});
      }),
    };
    const service = createTerminalService(broker, { timeoutMs: 5 });
    const operation = method === 'submit'
      ? service.submit({ ...scope, taskType: 'project_test' })
      : method === 'getStatus'
        ? service.getStatus({ ...scope, jobId: randomUUID() })
        : service.cancel({ ...scope, jobId: randomUUID() });

    await expect(operation).rejects.toMatchObject({
      code: 'TERMINAL_TIMEOUT',
      statusCode: 504,
      message: 'The terminal broker did not respond before the request timed out.',
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(true);
  });

  it('rejects an invalid broker timeout configuration', () => {
    expect(() => createTerminalService({}, { timeoutMs: 0 }))
      .toThrow('Terminal broker timeout must be a positive integer.');
    expect(() => createTerminalService({}, { timeoutMs: 1.5 }))
      .toThrow('Terminal broker timeout must be a positive integer.');
  });

  it('scopes status and cancel operations to the owner and project', async () => {
    const jobId = randomUUID();
    const broker = {
      getStatus: jest.fn().mockResolvedValue({ status: 'running' }),
      cancel: jest.fn().mockResolvedValue(true),
    };
    const service = createTerminalService(broker);

    await expect(service.getStatus({ ...scope, jobId })).resolves.toEqual({ jobId, status: 'running' });
    await expect(service.cancel({ ...scope, jobId })).resolves.toEqual({ jobId, status: 'cancellation_requested' });
    expect(broker.getStatus).toHaveBeenCalledWith({ ...scope, jobId }, { signal: expect.any(AbortSignal) });
    expect(broker.cancel).toHaveBeenCalledWith({ ...scope, jobId }, { signal: expect.any(AbortSignal) });
  });

  it('returns output only as strictly byte-bounded plain strings and rejects unknown job states', async () => {
    const broker = {
      getStatus: jest.fn().mockResolvedValue({
        status: 'failed',
        stdout: 'untrusted <script>text</script>',
        stderr: '😀'.repeat(MAX_OUTPUT_BYTES),
      }),
    };
    const service = createTerminalService(broker);
    const job = await service.getStatus({ ...scope, jobId: randomUUID() });

    expect(job.stdout).toBe('untrusted <script>text</script>');
    expect(Buffer.byteLength(job.stderr, 'utf8')).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(job.stderr).toMatch(/\[output truncated\]$/);
    expect(job.stderr).not.toContain('\uFFFD');

    broker.getStatus.mockResolvedValueOnce({ status: 'unknown' });
    await expect(service.getStatus({ ...scope, jobId: randomUUID() }))
      .rejects.toBeInstanceOf(TerminalServiceError);
  });
});
