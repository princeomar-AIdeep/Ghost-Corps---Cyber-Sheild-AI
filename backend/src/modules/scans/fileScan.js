'use strict';

const crypto = require('node:crypto');

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const TEXT_SCRIPT_EXTENSIONS = new Set([
  'bat', 'bash', 'c', 'cc', 'cmd', 'conf', 'cpp', 'csh', 'css', 'csv', 'go', 'h', 'hpp',
  'html', 'ini', 'java', 'js', 'json', 'jsx', 'md', 'mjs', 'php', 'ps1', 'py', 'rb',
  'rs', 'sh', 'sql', 'svg', 'toml', 'ts', 'tsx', 'txt', 'xml', 'yaml', 'yml', 'zsh',
]);
const SUPPORTED_BINARY_MIMES = new Set([
  'application/java-archive',
  'application/pdf',
  'application/vnd.ms-cab-compressed',
  'application/x-7z-compressed',
  'application/x-apple-diskimage',
  'application/x-bzip2',
  'application/x-cfb',
  'application/x-dosexec',
  'application/x-elf',
  'application/x-executable',
  'application/x-iso9660-image',
  'application/x-mach-binary',
  'application/x-msdownload',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/x-xz',
  'application/zip',
  'application/gzip',
  'application/vnd.rar',
  'application/vnd.microsoft.portable-executable',
]);

class UnsupportedFileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}

function sanitizeFilename(filename) {
  const base = String(filename || 'uploaded-file').replace(/\\/g, '/').split('/').pop();
  const safe = base.replace(/[^\w.\- ()\[\]]+/g, '_').slice(0, 255);
  return safe || 'uploaded-file';
}

function isSupportedMime(mime) {
  return mime.startsWith('image/') || SUPPORTED_BINARY_MIMES.has(mime);
}

function isValidText(buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

async function inspectFile(buffer, originalName) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new UnsupportedFileError('The selected file is empty or invalid.');
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new UnsupportedFileError('File exceeds the 25 MiB upload limit.');
  }

  const { fileTypeFromBuffer } = require('file-type');
  const detected = await fileTypeFromBuffer(buffer);
  if (detected && isSupportedMime(detected.mime)) {
    return {
      filename: sanitizeFilename(originalName),
      mimeType: detected.mime,
      detectedExtension: detected.ext,
    };
  }

  const extension = sanitizeFilename(originalName).split('.').pop().toLowerCase();
  if (!detected && TEXT_SCRIPT_EXTENSIONS.has(extension) && isValidText(buffer)) {
    return { filename: sanitizeFilename(originalName), mimeType: 'text/plain', detectedExtension: extension };
  }

  throw new UnsupportedFileError('Unsupported or unrecognized file content.');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { MAX_FILE_BYTES, UnsupportedFileError, inspectFile, sanitizeFilename, sha256 };
