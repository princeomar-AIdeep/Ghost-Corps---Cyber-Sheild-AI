'use strict';

const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;
const WORKSPACE_PATH_PATTERN = /^[A-Za-z0-9._/-]{1,512}$/;

const SUPPORTED_COMMANDS = 'pwd, ls [workspace-path], node --version, npm --version, npm test, or npm run <script>';

function parseSupportedCommand(input) {
  if (typeof input !== 'string' || input.length > 256 || /[\r\n\0]/.test(input)) {
    throw new TypeError(`Unsupported command. Supported commands: ${SUPPORTED_COMMANDS}.`);
  }

  const value = input.trim();
  if (value === 'pwd') return { args: ['pwd'] };
  if (value === 'node --version') return { args: ['node', '--version'] };
  if (value === 'npm --version') return { args: ['npm', '--version'] };
  if (value === 'npm test') return { args: ['npm', 'test'], scriptName: 'test' };

  const listing = /^ls(?:\s+([A-Za-z0-9._/-]{1,512}))?$/.exec(value);
  if (listing) {
    const workspacePath = listing[1];
    if (workspacePath && !isSafeWorkspacePath(workspacePath)) {
      throw new TypeError(`Unsupported workspace path. ${SUPPORTED_COMMANDS}.`);
    }
    return { args: ['ls', ...(workspacePath ? ['--', workspacePath] : [])] };
  }

  const npmRun = /^npm run ([A-Za-z0-9][A-Za-z0-9:_-]{0,63})$/.exec(value);
  if (npmRun && SCRIPT_NAME_PATTERN.test(npmRun[1])) {
    return { args: ['npm', 'run', npmRun[1]], scriptName: npmRun[1] };
  }

  throw new TypeError(`Unsupported command. Supported commands: ${SUPPORTED_COMMANDS}.`);
}

function isSafeWorkspacePath(value) {
  return WORKSPACE_PATH_PATTERN.test(value)
    && !value.startsWith('/')
    && !value.includes('//')
    && !value.split('/').some((segment) => !segment || segment === '..' || segment === '.');
}

module.exports = { parseSupportedCommand, SUPPORTED_COMMANDS };
