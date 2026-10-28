'use strict';

const { randomUUID } = require('crypto');
const { createLocalTerminalBroker } = require('./localTerminalBroker');
const { parseSupportedCommand, SUPPORTED_COMMANDS } = require('./terminal.commands');

const MAX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_BROKER_TIMEOUT_MS = 15_000;
const ALLOWED_TASK_TYPES = new Set(['project_test', 'project_build']);
const ALLOWED_JOB_STATES = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out']);

class TerminalServiceError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'TerminalServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function unavailable() {
  return new TerminalServiceError(
    'TERMINAL_UNAVAILABLE',
    'Terminal execution is unavailable.',
    503
  );
}

function brokerFailure() {
  return new TerminalServiceError(
    'TERMINAL_BROKER_ERROR',
    'The terminal broker could not complete the request.',
    502
  );
}

function brokerTimeout() {
  return new TerminalServiceError(
    'TERMINAL_TIMEOUT',
    'The terminal broker did not respond before the request timed out.',
    504
  );
}

function invalidTaskType() {
  return new TerminalServiceError(
    'TERMINAL_INVALID_TASK_TYPE',
    'The requested terminal task type is not allowed.',
    400
  );
}

function invalidCommand(message) {
  return new TerminalServiceError(
    'TERMINAL_INVALID_COMMAND',
    message || `Unsupported command. Supported commands: ${SUPPORTED_COMMANDS}.`,
    400
  );
}

function boundedOutput(value) {
  if (typeof value !== 'string') return '';
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= MAX_OUTPUT_BYTES) return value;
  const marker = '\n[output truncated]';
  const contentLimit = MAX_OUTPUT_BYTES - Buffer.byteLength(marker);
  let content = bytes.subarray(0, contentLimit).toString('utf8');
  while (Buffer.byteLength(content, 'utf8') > contentLimit) {
    content = content.slice(0, -1);
  }
  return `${content}${marker}`;
}

function createTerminalService(brokerClient = createLocalTerminalBroker(), { timeoutMs = DEFAULT_BROKER_TIMEOUT_MS } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('Terminal broker timeout must be a positive integer.');
  }

  async function invoke(method, payload) {
    if (!brokerClient || typeof brokerClient[method] !== 'function') throw unavailable();

    const controller = new AbortController();
    let timeout;
    const timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(brokerTimeout());
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        Promise.resolve().then(() => brokerClient[method](payload, { signal: controller.signal })),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof TerminalServiceError) throw error;
      throw brokerFailure();
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async submit({ userId, projectId, taskType, command } = {}) {
      const hasTaskType = taskType !== undefined;
      const hasCommand = command !== undefined;
      const taskTypeValid = ALLOWED_TASK_TYPES.has(taskType);
      if (hasTaskType === hasCommand) {
        if (hasCommand) throw invalidCommand();
        throw invalidTaskType();
      }
      if (hasTaskType && !taskTypeValid) throw invalidTaskType();
      if (hasCommand) {
        if (typeof command !== 'string') throw invalidCommand();
        try {
          parseSupportedCommand(command);
        } catch (error) {
          throw invalidCommand(error.message);
        }
      }
      const jobId = randomUUID();
      const accepted = await invoke('submit', {
        jobId,
        userId,
        projectId,
        ...(hasTaskType ? { taskType } : { command: command.trim() }),
      });
      if (accepted !== true) throw brokerFailure();
      return { jobId, status: 'queued' };
    },

    async getStatus({ userId, projectId, jobId }) {
      const status = await invoke('getStatus', { userId, projectId, jobId });
      if (!status || !ALLOWED_JOB_STATES.has(status.status)) throw brokerFailure();
      return {
        jobId,
        status: status.status,
        ...(typeof status.stdout === 'string' ? { stdout: boundedOutput(status.stdout) } : {}),
        ...(typeof status.stderr === 'string' ? { stderr: boundedOutput(status.stderr) } : {}),
        ...(typeof status.exitCode === 'number' ? { exitCode: status.exitCode } : {}),
      };
    },

    async cancel({ userId, projectId, jobId }) {
      const cancelled = await invoke('cancel', { userId, projectId, jobId });
      if (cancelled !== true) throw brokerFailure();
      return { jobId, status: 'cancellation_requested' };
    },
  };
}

const terminalService = createTerminalService();

module.exports = {
  createTerminalService,
  terminalService,
  TerminalServiceError,
  MAX_OUTPUT_BYTES,
  DEFAULT_BROKER_TIMEOUT_MS,
};
