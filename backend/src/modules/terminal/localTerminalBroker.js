'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const WorkspaceFile = require('../../models/WorkspaceFile');
const { parseSupportedCommand } = require('./terminal.commands');

const MAX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_JOB_TIMEOUT_MS = 120 * 1000;
const DEFAULT_SANDBOX_IMAGE = 'cyber-shield-terminal:node22';

class LocalTerminalBrokerError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'LocalTerminalBrokerError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function findPackageRoots(workspaceRoot, scriptName) {
  const candidates = [];
  const ignoredDirectories = new Set(['.git', 'node_modules']);
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === 'package.json')) {
      const packageJsonPath = path.join(directory, 'package.json');
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
          candidates.push({ directory, error: 'Project package.json must contain a JSON object.' });
        } else {
          const scripts = pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)
            ? pkg.scripts
            : {};
          candidates.push({
            directory,
            hasScript: typeof scripts[scriptName] === 'string',
          });
        }
      } catch (error) {
        candidates.push({
          directory,
          error: error instanceof SyntaxError
            ? 'Project package.json is not valid JSON.'
            : 'Project package.json could not be read.',
        });
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name) && !entry.name.startsWith('.env')) {
        visit(path.join(directory, entry.name));
      }
    }
  };

  visit(workspaceRoot);
  return candidates;
}

function resolveCommand(workspaceRoot, taskType, userCommand) {
  let execution;
  if (userCommand) {
    execution = parseSupportedCommand(userCommand);
  } else {
    const scriptName = taskType === 'project_test' ? 'test' : 'build';
    execution = {
      args: taskType === 'project_test' ? ['npm', 'test'] : ['npm', 'run', 'build'],
      scriptName,
    };
  }

  if (!execution.scriptName) return { command: execution.args, workingDirectory: '.' };

  let candidates;
  try {
    candidates = findPackageRoots(workspaceRoot, execution.scriptName);
  } catch {
    return { error: 'Project workspace could not be inspected.', exitCode: 2 };
  }
  if (candidates.length === 0) {
    return { error: 'Project package.json is missing.', exitCode: 2 };
  }

  const depth = (candidate) => path.relative(workspaceRoot, candidate.directory).split(path.sep).filter(Boolean).length;
  const matching = candidates.filter((candidate) => candidate.hasScript)
    .sort((left, right) => depth(left) - depth(right));
  const selected = matching[0] || candidates.sort((left, right) => depth(left) - depth(right))[0];
  if (selected.error) return { error: selected.error, exitCode: 2 };
  if (!selected.hasScript) {
    return { error: `Project package.json does not define a "${execution.scriptName}" script.`, exitCode: 2 };
  }

  const relativeDirectory = path.relative(workspaceRoot, selected.directory).split(path.sep).join('/');
  return {
    command: execution.args,
    workingDirectory: relativeDirectory || '.',
  };
}

function safeWriteProjectFiles(projectId, workspaceRoot, workspaceFileModel = WorkspaceFile, required = true) {
  const dbState = workspaceFileModel && workspaceFileModel.db ? workspaceFileModel.db.readyState : 0;
  if (dbState !== 1) {
    if (required) throw new Error('Workspace file storage is not connected.');
    return Promise.resolve();
  }

  return workspaceFileModel.find({ projectId }).sort({ path: 1 }).lean().then((files) => {
    for (const file of files) {
      const filePath = file && typeof file.path === 'string' ? file.path : '';
      if (!filePath || filePath.startsWith('/') || filePath.includes('..') || filePath.includes('\\') || filePath.includes('\0')) {
        continue;
      }
      if (filePath === '.env' || filePath.startsWith('.env.') || filePath.includes('/.env') || filePath.startsWith('.git/') || filePath === '.git' || filePath.startsWith('node_modules/')) {
        continue;
      }

      const targetPath = path.resolve(workspaceRoot, filePath);
      const allowedRoot = path.resolve(workspaceRoot);
      if (targetPath !== allowedRoot && !targetPath.startsWith(`${allowedRoot}${path.sep}`)) {
        continue;
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, String(file.content || ''), 'utf8');
    }
  });
}

function buildLocalWorkspace({ userId, projectId, taskType, workspaceBuilder }) {
  const baseDir = os.tmpdir();
  const rootName = `cyber-terminal-${String(projectId).slice(-8)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspaceRoot = path.join(baseDir, rootName);
  fs.mkdirSync(workspaceRoot, { recursive: true });

  if (typeof workspaceBuilder === 'function') {
    return Promise.resolve(workspaceBuilder({ userId, projectId, taskType, workspaceRoot })).then((resolved) => {
      if (typeof resolved === 'string' && resolved.trim()) return resolved;
      return workspaceRoot;
    });
  }

  return Promise.resolve(workspaceRoot);
}

function containerName(jobId) {
  return `cyber-terminal-${String(jobId).replace(/[^a-f\d-]/gi, '').toLowerCase()}`;
}

function makeDockerArgs({ image, workspaceRoot, user, name, command, workingDirectory = '/workspace' }) {
  return [
    'run', '--rm', '--pull=never', '--name', name,
    '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--pids-limit=128',
    '--memory=512m', '--memory-swap=512m', '--cpus=1',
    '--ulimit', 'fsize=67108864:67108864',
    '--user', user,
    '--workdir=/workspace',
    '--tmpfs', '/workspace:rw,nosuid,nodev,size=256m,mode=1777',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=64m',
    '--mount', `type=bind,src=${workspaceRoot},dst=/project-input,readonly`,
    '--env', `TERMINAL_WORKDIR=${workingDirectory}`,
    image,
    ...command,
  ];
}

function signalContainer(spawnImpl, dockerPath, signal, name) {
  const child = spawnImpl(dockerPath, ['kill', `--signal=${signal}`, name], { stdio: 'ignore' });
  if (child && typeof child.on === 'function') child.on('error', () => {});
}

function createLocalTerminalBroker(options = {}) {
  const jobs = new Map();
  const workspaceBuilder = options.workspaceBuilder || null;
  const dockerPath = options.dockerPath || process.env.TERMINAL_DOCKER_PATH || 'docker';
  const spawnImpl = options.spawnImpl || spawn;
  const sandboxImage = options.sandboxImage || process.env.TERMINAL_SANDBOX_IMAGE || DEFAULT_SANDBOX_IMAGE;
  const runtimeUser = options.runtimeUser || `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`;
  const cleanupDelayMs = Number.isSafeInteger(options.cleanupDelayMs) && options.cleanupDelayMs >= 0
    ? options.cleanupDelayMs
    : 3000;
  const jobTimeoutMs = Number.isSafeInteger(options.jobTimeoutMs) && options.jobTimeoutMs > 0 ? options.jobTimeoutMs : DEFAULT_JOB_TIMEOUT_MS;
  const outputLimit = Number.isSafeInteger(options.outputLimit) && options.outputLimit > 0 ? options.outputLimit : MAX_OUTPUT_BYTES;

  function validateScope(job, payload) {
    return job && job.userId === String(payload.userId)
      && job.projectId === String(payload.projectId);
  }

  function completeJob(jobId, finalState, exitCode = null, summary = {}) {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = finalState;
    job.exitCode = exitCode;
    if (typeof summary.stdout === 'string') job.stdout = boundedOutput(summary.stdout, outputLimit);
    if (typeof summary.stderr === 'string') job.stderr = boundedOutput(summary.stderr, outputLimit);
    if (job.timeoutHandle) {
      clearTimeout(job.timeoutHandle);
      job.timeoutHandle = null;
    }
    if (job.cleanupHandle) {
      clearTimeout(job.cleanupHandle);
      job.cleanupHandle = null;
    }
    if (job.retentionHandle) clearTimeout(job.retentionHandle);
    job.retentionHandle = setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
    job.retentionHandle.unref?.();
    if (job.child && job.child.exitCode === null) {
      try {
        job.child.kill('SIGKILL');
      } catch {
        // Ignore kill failures during cleanup.
      }
    }
    if (job.workspaceRoot) {
      setTimeout(() => {
        try {
          fs.rmSync(job.workspaceRoot, { recursive: true, force: true });
        } catch {
          // Ignore best-effort cleanup errors.
        }
      }, cleanupDelayMs).unref?.();
    }
  }

  async function startJob({ userId, projectId, jobId, taskType, command: userCommand }) {
    let workspaceRoot;
    try {
      workspaceRoot = await buildLocalWorkspace({ userId, projectId, taskType, workspaceBuilder });
      const preparedJob = jobs.get(jobId);
      if (!preparedJob) return;
      preparedJob.workspaceRoot = workspaceRoot;
      if (preparedJob.status === 'cancelled') {
        completeJob(jobId, 'cancelled', preparedJob.exitCode, {
          stdout: preparedJob.stdout,
          stderr: preparedJob.stderr,
        });
        return;
      }
      await safeWriteProjectFiles(projectId, workspaceRoot, WorkspaceFile, !workspaceBuilder);
    } catch {
      const job = jobs.get(jobId);
      if (job) completeJob(jobId, 'failed', 1, { stderr: 'Unable to prepare the project workspace.' });
      return;
    }

    const job = jobs.get(jobId);
    if (!job || job.status === 'cancelled') return;
    let resolved;
    try {
      resolved = resolveCommand(workspaceRoot, taskType, userCommand);
    } catch (error) {
      completeJob(jobId, 'failed', 2, { stderr: error.message });
      return;
    }
    if (resolved.error) {
      completeJob(jobId, 'failed', resolved.exitCode, { stderr: resolved.error });
      return;
    }

    if (!Number.isSafeInteger(Number(runtimeUser.split(':')[0])) || Number(runtimeUser.split(':')[0]) === 0) {
      completeJob(jobId, 'failed', 2, { stderr: 'The sandbox must run as a non-root numeric user.' });
      return;
    }

    const name = containerName(jobId);
    const child = spawnImpl(dockerPath, makeDockerArgs({
      image: sandboxImage,
      workspaceRoot,
      user: runtimeUser,
      name,
      command: resolved.command,
      workingDirectory: resolved.workingDirectory,
    }), {
      env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    job.child = child;
    job.containerName = name;
    job.status = 'running';
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > outputLimit) {
        stdout = boundedOutput(stdout, outputLimit);
      }
      job.stdout = boundedOutput(stdout, outputLimit);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > outputLimit) {
        stderr = boundedOutput(stderr, outputLimit);
      }
      job.stderr = boundedOutput(stderr, outputLimit);
    });

    child.on('error', () => {
      completeJob(jobId, 'failed', 1, {
        stdout,
        stderr: `${stderr}\nUnable to start the configured Docker sandbox. Verify Docker access and that the sandbox image is installed.`,
      });
    });

    child.on('exit', (exitCode, signal) => {
      const normalizedCode = typeof exitCode === 'number' ? exitCode : (signal ? 1 : 0);
      const combinedStdout = boundedOutput(stdout, outputLimit);
      const imageUnavailable = /no such image|pull access denied|repository does not exist/i.test(stderr);
      const missingExecutable = exitCode !== 0 && /(?:^|\n)(?:sh: )?([A-Za-z0-9._-]+): not found(?:\n|$)/m.exec(stderr);
      const combinedStderr = imageUnavailable
        ? 'The configured Docker sandbox image is unavailable. Install the approved image before enabling terminal execution.'
        : missingExecutable
          ? boundedOutput(`${stderr.trimEnd()}\nThe project command "${missingExecutable[1]}" is unavailable in the isolated workspace. Project dependencies are not installed automatically, and sandbox network access is disabled.`, outputLimit)
        : boundedOutput(stderr, outputLimit);

      if (job.status === 'cancelled' || job.status === 'timed_out') {
        return;
      }

      if (signal) {
        completeJob(jobId, 'failed', normalizedCode, { stdout, stderr: combinedStderr });
        return;
      }

      completeJob(jobId, exitCode === 0 ? 'succeeded' : 'failed', exitCode, { stdout, stderr: combinedStderr });
    });

    job.timeoutHandle = setTimeout(() => {
      if (job.status === 'cancelled' || job.status === 'succeeded' || job.status === 'failed') return;
      if (job.child && !job.child.killed) job.child.kill('SIGTERM');
      if (job.containerName) signalContainer(spawnImpl, dockerPath, 'KILL', job.containerName);
      completeJob(jobId, 'timed_out', 124, { stdout, stderr: stderr + '\nCommand timed out in the isolated workspace.' });
    }, jobTimeoutMs);
  }

  return {
    async submit(payload = {}, options = {}) {
      const hasTaskType = payload?.taskType !== undefined;
      const hasCommand = payload?.command !== undefined;
      const taskTypeValid = ['project_test', 'project_build'].includes(payload?.taskType);
      if (!payload || !payload.jobId || !payload.userId || !payload.projectId || hasTaskType === hasCommand) {
        throw new LocalTerminalBrokerError('TERMINAL_INVALID_TASK_TYPE', 'The requested terminal task type is not allowed.', 400);
      }
      if (hasTaskType && !taskTypeValid) {
        throw new LocalTerminalBrokerError('TERMINAL_INVALID_TASK_TYPE', 'The requested terminal task type is not allowed.', 400);
      }
      if (hasCommand) {
        if (typeof payload.command !== 'string') {
          throw new LocalTerminalBrokerError('TERMINAL_INVALID_COMMAND', 'The requested terminal command is not allowed.', 400);
        }
        parseSupportedCommand(payload.command);
      }

      const jobId = payload.jobId;
      jobs.set(jobId, {
        jobId,
        userId: String(payload.userId),
        projectId: String(payload.projectId),
        taskType: payload.taskType,
        status: 'queued',
        stdout: '',
        stderr: '',
        exitCode: null,
        child: null,
        workspaceRoot: null,
        timeoutHandle: null,
        cleanupHandle: null,
        retentionHandle: null,
      });

      startJob({
        userId: payload.userId,
        projectId: payload.projectId,
        taskType: payload.taskType,
        command: payload.command,
        jobId,
      }).catch(() => {
        completeJob(jobId, 'failed', 1, { stderr: 'Terminal sandbox failed unexpectedly.' });
      });

      if (options && typeof options.signal === 'object' && options.signal && options.signal.aborted) {
        throw new LocalTerminalBrokerError('TERMINAL_TIMEOUT', 'The terminal broker did not respond before the request timed out.', 504);
      }

      return true;
    },

    async getStatus(payload = {}, options = {}) {
      if (!payload || !payload.jobId || !payload.userId || !payload.projectId) {
        throw new LocalTerminalBrokerError('TERMINAL_INVALID_TASK_TYPE', 'The requested terminal task type is not allowed.', 400);
      }
      const job = jobs.get(payload.jobId);
      if (!validateScope(job, payload)) {
        throw new LocalTerminalBrokerError('TERMINAL_NOT_FOUND', 'Terminal job not found.', 404);
      }
      if (options && typeof options.signal === 'object' && options.signal && options.signal.aborted) {
        throw new LocalTerminalBrokerError('TERMINAL_TIMEOUT', 'The terminal broker did not respond before the request timed out.', 504);
      }
      return {
        jobId: job.jobId,
        status: job.status,
        stdout: job.stdout || '',
        stderr: job.stderr || '',
        ...(typeof job.exitCode === 'number' ? { exitCode: job.exitCode } : {}),
      };
    },

    async cancel(payload = {}, options = {}) {
      if (!payload || !payload.jobId || !payload.userId || !payload.projectId) {
        throw new LocalTerminalBrokerError('TERMINAL_INVALID_TASK_TYPE', 'The requested terminal task type is not allowed.', 400);
      }
      const job = jobs.get(payload.jobId);
      if (!validateScope(job, payload)) {
        throw new LocalTerminalBrokerError('TERMINAL_NOT_FOUND', 'Terminal job not found.', 404);
      }
      if (['succeeded', 'failed', 'timed_out', 'cancelled'].includes(job.status)) return true;
      if (job.containerName) signalContainer(spawnImpl, dockerPath, 'KILL', job.containerName);
      completeJob(payload.jobId, 'cancelled', 130, { stdout: job.stdout, stderr: job.stderr });
      if (options && typeof options.signal === 'object' && options.signal && options.signal.aborted) {
        throw new LocalTerminalBrokerError('TERMINAL_TIMEOUT', 'The terminal broker did not respond before the request timed out.', 504);
      }
      return true;
    },
  };
}

function boundedOutput(value, limit = MAX_OUTPUT_BYTES) {
  if (typeof value !== 'string') return '';
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= limit) return value;
  const marker = '\n[output truncated]';
  const contentLimit = limit - Buffer.byteLength(marker);
  let content = bytes.subarray(0, contentLimit).toString('utf8');
  while (Buffer.byteLength(content, 'utf8') > contentLimit) {
    content = content.slice(0, -1);
  }
  return `${content}${marker}`;
}

module.exports = {
  createLocalTerminalBroker,
  LocalTerminalBrokerError,
  MAX_OUTPUT_BYTES,
  DEFAULT_JOB_TIMEOUT_MS,
  DEFAULT_SANDBOX_IMAGE,
  makeDockerArgs,
  resolveCommand,
  safeWriteProjectFiles,
};
