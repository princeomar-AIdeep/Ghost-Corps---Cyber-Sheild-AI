'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');
const {
  createLocalTerminalBroker,
  DEFAULT_SANDBOX_IMAGE,
  makeDockerArgs,
} = require('../src/modules/terminal/localTerminalBroker');

async function waitForJob(broker, scope, attempts = 60) {
  let status;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    status = await broker.getStatus(scope);
    if (['succeeded', 'failed', 'timed_out', 'cancelled'].includes(status.status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return status;
}

describe('local terminal broker integration', () => {
  it('uses a hardened Docker execution configuration', () => {
    const args = makeDockerArgs({
      image: DEFAULT_SANDBOX_IMAGE,
      workspaceRoot: '/tmp/project-workspace',
      user: '1000:1000',
      name: 'cyber-terminal-1234',
      command: ['npm', 'test'],
    });

    expect(args).toEqual(expect.arrayContaining([
      '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--pids-limit=128',
      '--memory=512m', '--cpus=1', '--user', '1000:1000',
      '--tmpfs', '/workspace:rw,nosuid,nodev,size=256m,mode=1777',
    ]));
    expect(args).toContain(DEFAULT_SANDBOX_IMAGE);
    expect(args.slice(-3)).toEqual([DEFAULT_SANDBOX_IMAGE, 'npm', 'test']);
  });

  it('runs supported commands in the copied project workspace and can execute repeatedly', async () => {
    if (spawnSync('docker', ['image', 'inspect', DEFAULT_SANDBOX_IMAGE], { stdio: 'ignore' }).status !== 0) return;
    const broker = createLocalTerminalBroker({
      workspaceBuilder: async () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-terminal-command-'));
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
          name: 'terminal-command-test',
          private: true,
          scripts: {
            verify: 'node -e "process.exit(7)"',
            dependencyCheck: 'missing-terminal-executable',
          },
        }));
        return workspaceRoot;
      },
      jobTimeoutMs: 20000,
    });

    const workingDirectoryJobId = randomUUID();
    await broker.submit({
      jobId: workingDirectoryJobId,
      userId: 'owner-1',
      projectId: 'project-1',
      command: 'pwd',
    });
    const workingDirectory = await waitForJob(broker, {
      userId: 'owner-1',
      projectId: 'project-1',
      jobId: workingDirectoryJobId,
    });
    expect(workingDirectory).toMatchObject({ status: 'succeeded', exitCode: 0 });
    expect(workingDirectory.stdout.trim()).toBe('/workspace');

    const listedFileJobId = randomUUID();
    await broker.submit({
      jobId: listedFileJobId,
      userId: 'owner-1',
      projectId: 'project-1',
      command: 'ls package.json',
    });
    const listedFile = await waitForJob(broker, {
      userId: 'owner-1',
      projectId: 'project-1',
      jobId: listedFileJobId,
    });
    expect(listedFile).toMatchObject({ status: 'succeeded', exitCode: 0 });
    expect(listedFile.stdout).toContain('package.json');

    const nonzeroJobId = randomUUID();
    await broker.submit({
      jobId: nonzeroJobId,
      userId: 'owner-1',
      projectId: 'project-1',
      command: 'npm run verify',
    });
    const nonzeroResult = await waitForJob(broker, {
      userId: 'owner-1',
      projectId: 'project-1',
      jobId: nonzeroJobId,
    });
    expect(nonzeroResult).toMatchObject({ status: 'failed', exitCode: 7 });
    expect(`${nonzeroResult.stdout}${nonzeroResult.stderr}`).toContain('verify');

    const missingDependencyJobId = randomUUID();
    await broker.submit({
      jobId: missingDependencyJobId,
      userId: 'owner-1',
      projectId: 'project-1',
      command: 'npm run dependencyCheck',
    });
    const missingDependencyResult = await waitForJob(broker, {
      userId: 'owner-1',
      projectId: 'project-1',
      jobId: missingDependencyJobId,
    });
    expect(missingDependencyResult).toMatchObject({ status: 'failed', exitCode: 127 });
    expect(missingDependencyResult.stderr).toMatch(/unavailable in the isolated workspace/i);
    expect(missingDependencyResult.stderr).toMatch(/network access is disabled/i);
  }, 30000);

  it('reports a missing package build script with a real failure and exit code 2', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-terminal-no-build-'));
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      name: 'terminal-no-build-test',
      private: true,
      scripts: { test: 'node -p "process.version"' },
    }));
    const spawnImpl = jest.fn();
    const broker = createLocalTerminalBroker({
      workspaceBuilder: async () => workspaceRoot,
      spawnImpl,
      cleanupDelayMs: 0,
    });
    const jobId = randomUUID();

    await broker.submit({ jobId, userId: 'owner-1', projectId: 'project-1', taskType: 'project_build' });
    const status = await waitForJob(broker, { userId: 'owner-1', projectId: 'project-1', jobId });

    expect(status).toMatchObject({ status: 'failed', exitCode: 2 });
    expect(status.stderr).toMatch(/does not define a "build" script/);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('runs a real project test in Docker when the configured sandbox image is available, otherwise fails closed', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-terminal-'));
    const projectRoot = path.join(workspaceRoot, 'frontend');
    fs.mkdirSync(projectRoot, { recursive: true });
    const packageJsonPath = path.join(projectRoot, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({ name: 'terminal-job-test', private: true, scripts: { test: 'node -p "process.version"' } }, null, 2));
    const imageAvailable = spawnSync('docker', ['image', 'inspect', DEFAULT_SANDBOX_IMAGE], { stdio: 'ignore' }).status === 0;

    const broker = createLocalTerminalBroker({
      workspaceBuilder: async () => workspaceRoot,
      jobTimeoutMs: 20000,
      cleanupDelayMs: 0,
    });

    const jobId = randomUUID();
    const accepted = await broker.submit({ jobId, userId: 'owner-1', projectId: 'project-1', taskType: 'project_test' });

    expect(accepted).toBe(true);

    let status;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      status = await broker.getStatus({ userId: 'owner-1', projectId: 'project-1', jobId });
      if (status.status === 'succeeded' || status.status === 'failed' || status.status === 'timed_out' || status.status === 'cancelled') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(status.jobId).toBe(jobId);
    if (imageAvailable) {
      expect(status).toMatchObject({ status: 'succeeded', exitCode: 0 });
      expect(String(status.stdout || '') + String(status.stderr || '')).toMatch(/v\d+\.\d+\.\d+/);
    } else {
      expect(status).toMatchObject({ status: 'failed' });
      expect(status.stderr).toMatch(/sandbox image is unavailable|unable to start the configured docker sandbox/i);
      expect(status.stdout).not.toMatch(/v\d+\.\d+\.\d+/);
    }
  }, 15000);

  it('runs the approved npm build workflow in the same isolated runtime', async () => {
    if (spawnSync('docker', ['image', 'inspect', DEFAULT_SANDBOX_IMAGE], { stdio: 'ignore' }).status !== 0) return;
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-terminal-build-'));
    const projectRoot = path.join(workspaceRoot, 'frontend');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
      name: 'terminal-build-test',
      private: true,
      scripts: { build: 'node -p "process.version"' },
    }));
    const broker = createLocalTerminalBroker({ workspaceBuilder: async () => workspaceRoot, jobTimeoutMs: 20000, cleanupDelayMs: 0 });
    const jobId = randomUUID();
    await broker.submit({ jobId, userId: 'owner-1', projectId: 'project-1', taskType: 'project_build' });

    let status;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      status = await broker.getStatus({ userId: 'owner-1', projectId: 'project-1', jobId });
      if (['succeeded', 'failed', 'timed_out', 'cancelled'].includes(status.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(status).toMatchObject({ status: 'succeeded', exitCode: 0 });
    expect(`${status.stdout}${status.stderr}`).toMatch(/v\d+\.\d+\.\d+/);
  }, 15000);

  it('cancels a running Docker container and reports cancelled instead of failed', async () => {
    if (spawnSync('docker', ['image', 'inspect', DEFAULT_SANDBOX_IMAGE], { stdio: 'ignore' }).status !== 0) return;
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-terminal-cancel-'));
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      name: 'terminal-cancel-test',
      private: true,
      scripts: { test: 'node -e "setTimeout(() => {}, 30000)"' },
    }));
    const broker = createLocalTerminalBroker({ workspaceBuilder: async () => workspaceRoot, jobTimeoutMs: 30000 });
    const jobId = randomUUID();
    const scope = { userId: 'owner-1', projectId: 'project-1', jobId };
    await broker.submit({ ...scope, taskType: 'project_test' });

    let status;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      status = await broker.getStatus(scope);
      if (status.status === 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await broker.cancel(scope);
    status = await broker.getStatus(scope);
    expect(status).toMatchObject({ status: 'cancelled', exitCode: 130 });
  }, 15000);

  it('reports a running job timeout instead of a successful container exit', async () => {
    if (spawnSync('docker', ['image', 'inspect', DEFAULT_SANDBOX_IMAGE], { stdio: 'ignore' }).status !== 0) return;
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-terminal-timeout-'));
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      name: 'terminal-timeout-test',
      private: true,
      scripts: { test: 'node -e "setTimeout(() => {}, 30000)"' },
    }));
    const broker = createLocalTerminalBroker({
      workspaceBuilder: async () => workspaceRoot,
      jobTimeoutMs: 1500,
      cleanupDelayMs: 0,
    });
    const jobId = randomUUID();
    const scope = { userId: 'owner-1', projectId: 'project-1', jobId };
    await broker.submit({ ...scope, taskType: 'project_test' });
    const status = await waitForJob(broker, scope);

    expect(status).toMatchObject({ status: 'timed_out', exitCode: 124 });
    expect(status.stderr).toMatch(/Command timed out in the isolated workspace/);
  }, 15000);

  it('hides jobs from another user or project on status and cancellation', async () => {
    let finishWorkspace;
    const workspaceReady = new Promise((resolve) => { finishWorkspace = resolve; });
    const broker = createLocalTerminalBroker({
      workspaceBuilder: () => workspaceReady,
      cleanupDelayMs: 0,
    });
    const jobId = randomUUID();
    await broker.submit({ jobId, userId: 'user-a', projectId: 'project-a', taskType: 'project_test' });

    await expect(broker.getStatus({ jobId, userId: 'user-b', projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'TERMINAL_NOT_FOUND', statusCode: 404 });
    await expect(broker.cancel({ jobId, userId: 'user-a', projectId: 'project-b' }))
      .rejects.toMatchObject({ code: 'TERMINAL_NOT_FOUND', statusCode: 404 });

    finishWorkspace('/does/not/need/to/exist');
  });

  it('normalizes Mongo ObjectId-like scopes for authenticated status polling', async () => {
    let finishWorkspace;
    const workspaceReady = new Promise((resolve) => { finishWorkspace = resolve; });
    const broker = createLocalTerminalBroker({ workspaceBuilder: () => workspaceReady });
    const jobId = randomUUID();
    const userId = { toString: () => 'user-object-id' };
    const projectId = { toString: () => 'project-object-id' };
    await broker.submit({ jobId, userId, projectId, taskType: 'project_test' });

    await expect(broker.getStatus({ jobId, userId: 'user-object-id', projectId: 'project-object-id' }))
      .resolves.toMatchObject({ status: 'queued' });
    finishWorkspace('/does/not/need/to/exist');
  });
});
