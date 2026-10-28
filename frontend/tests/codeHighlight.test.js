import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, tokenizeCode } from '../src/dashboards/codeHighlight.js';
import { classifyTerminalLine, splitTerminalPaths } from '../src/dashboards/terminalOutput.js';

test('detects supported syntax highlighting from the actual file extension', () => {
  assert.equal(detectLanguage('src/App.tsx'), 'typescript');
  assert.equal(detectLanguage('scripts/check.py'), 'python');
  assert.equal(detectLanguage('package.json'), 'json');
  assert.equal(detectLanguage('notes.unknown'), 'plain text');
});

test('highlights language tokens without treating strings and comments as keywords', () => {
  const tokens = tokenizeCode('const greet = (name) => "return"; // const\nreturn greet("hello");', 'src/app.js');
  assert.ok(tokens.some((token) => token.type === 'keyword' && token.text === 'const'));
  assert.ok(tokens.some((token) => token.type === 'function' && token.text === 'greet'));
  assert.ok(tokens.some((token) => token.type === 'string' && token.text === '"return"'));
  assert.ok(tokens.some((token) => token.type === 'comment' && token.text === '// const'));
  assert.ok(tokens.some((token) => token.type === 'keyword' && token.text === 'return'));
});

test('marks unmatched bracket characters distinctly', () => {
  const tokens = tokenizeCode('function start() { return value;', 'main.js');
  const errorParts = tokens.flatMap((token) => token.parts || []).filter((part) => part.type === 'error');
  assert.deepEqual(errorParts.map((part) => part.text), ['{']);
});

test('classifies only actual returned terminal lines and path fragments', () => {
  assert.equal(classifyTerminalLine('> npm test'), 'command');
  assert.equal(classifyTerminalLine('Warning: slow response'), 'warning');
  assert.equal(classifyTerminalLine('FAILED test suite'), 'error');
  assert.equal(classifyTerminalLine('test.js:18'), 'output');
  assert.equal(classifyTerminalLine('anything', 'stderr'), 'error');
  assert.deepEqual(splitTerminalPaths('See src/main.jsx:18'), [
    { type: 'text', value: 'See ' },
    { type: 'path', value: 'src/main.jsx:18' },
  ]);
});
