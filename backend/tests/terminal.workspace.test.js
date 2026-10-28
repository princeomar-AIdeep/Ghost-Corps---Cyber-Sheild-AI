'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  makeDockerArgs,
  resolveCommand,
  safeWriteProjectFiles,
} = require('../src/modules/terminal/localTerminalBroker');

describe('terminal workspace preparation', () => {
  let workspaceRoot;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-terminal-workspace-test-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('reports a missing package manifest accurately', () => {
    expect(resolveCommand(workspaceRoot, 'project_test')).toEqual({
      error: 'Project package.json is missing.',
      exitCode: 2,
    });
  });

  it.each([
    ['project_test', 'test', ['npm', 'test']],
    ['project_build', 'build', ['npm', 'run', 'build']],
  ])('selects the nested project root for %s', (taskType, script, command) => {
    fs.mkdirSync(path.join(workspaceRoot, 'frontend'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      name: 'repository-root',
      scripts: { lint: 'node lint.js' },
    }));
    fs.writeFileSync(path.join(workspaceRoot, 'frontend', 'package.json'), JSON.stringify({
      name: 'frontend-app',
      scripts: { [script]: 'node task.js' },
    }));

    expect(resolveCommand(workspaceRoot, taskType)).toEqual({
      command,
      workingDirectory: 'frontend',
    });
  });

  it('prefers the shallowest package manifest defining the requested script', () => {
    fs.mkdirSync(path.join(workspaceRoot, 'apps', 'web'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      scripts: { build: 'node root-build.js' },
    }));
    fs.writeFileSync(path.join(workspaceRoot, 'apps', 'web', 'package.json'), JSON.stringify({
      scripts: { build: 'node web-build.js' },
    }));

    expect(resolveCommand(workspaceRoot, 'project_build')).toEqual({
      command: ['npm', 'run', 'build'],
      workingDirectory: '.',
    });
  });

  it('sets Docker working directory to the detected nested root without changing isolation flags', () => {
    const args = makeDockerArgs({
      image: 'cyber-shield-terminal:node22',
      workspaceRoot,
      user: '1000:1000',
      name: 'cyber-terminal-test',
      command: ['npm', 'run', 'build'],
      workingDirectory: 'frontend',
    });

    expect(args).toContain('--workdir=/workspace');
    expect(args).toContain('TERMINAL_WORKDIR=frontend');
    expect(args).toEqual(expect.arrayContaining([
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
    ]));
  });

  it('fails explicitly when workspace file storage is disconnected', async () => {
    const disconnectedModel = { db: { readyState: 0 } };

    expect(() => safeWriteProjectFiles('project-1', workspaceRoot, disconnectedModel))
      .toThrow('Workspace file storage is not connected.');
  });

  it('propagates workspace file query failures rather than running an empty copy', async () => {
    const query = {
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(new Error('workspace query failed')),
    };
    const model = {
      db: { readyState: 1 },
      find: jest.fn().mockReturnValue(query),
    };

    await expect(safeWriteProjectFiles('project-1', workspaceRoot, model))
      .rejects.toThrow('workspace query failed');
  });

  it('propagates filesystem copy failures during workspace preparation', async () => {
    const query = {
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { path: 'frontend/package.json', content: '{}' },
      ]),
    };
    const model = {
      db: { readyState: 1 },
      find: jest.fn().mockReturnValue(query),
    };
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
      throw new Error('copy destination is unavailable');
    });

    try {
      await expect(safeWriteProjectFiles('project-1', workspaceRoot, model))
        .rejects.toThrow('copy destination is unavailable');
    } finally {
      mkdirSpy.mockRestore();
    }
  });

  it('copies project files into the temporary mirror only', async () => {
    const query = {
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { path: 'frontend/package.json', content: '{"scripts":{"build":"node build.js"}}' },
      ]),
    };
    const model = {
      db: { readyState: 1 },
      find: jest.fn().mockReturnValue(query),
    };

    await safeWriteProjectFiles('project-1', workspaceRoot, model);

    expect(fs.readFileSync(path.join(workspaceRoot, 'frontend', 'package.json'), 'utf8'))
      .toBe('{"scripts":{"build":"node build.js"}}');
    expect(model.find).toHaveBeenCalledWith({ projectId: 'project-1' });
  });
});
