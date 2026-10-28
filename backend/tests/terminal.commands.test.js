'use strict';

const { parseSupportedCommand } = require('../src/modules/terminal/terminal.commands');

describe('restricted terminal command parser', () => {
  it.each([
    ['pwd', ['pwd']],
    ['ls', ['ls']],
    ['ls src/components', ['ls', '--', 'src/components']],
    ['node --version', ['node', '--version']],
    ['npm --version', ['npm', '--version']],
    ['npm test', ['npm', 'test']],
    ['npm run build', ['npm', 'run', 'build']],
  ])('parses the supported command %s into fixed argv', (input, args) => {
    expect(parseSupportedCommand(input).args).toEqual(args);
  });

  it.each([
    'sh -c whoami',
    'pwd; cat /etc/passwd',
    'npm test && touch /tmp/unrestricted',
    'ls ../../etc',
    'ls /etc',
    'npm run build -- --help',
    'npm run',
    'pwd\nnode --version',
  ])('rejects unsupported or unsafe command %s', (input) => {
    expect(() => parseSupportedCommand(input)).toThrow(/Unsupported/);
  });
});
