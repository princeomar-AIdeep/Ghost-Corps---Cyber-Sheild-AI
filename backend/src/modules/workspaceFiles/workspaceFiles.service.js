'use strict';

const Project = require('../../models/Project');
const WorkspaceFile = require('../../models/WorkspaceFile');

const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const MAX_FILE_BYTES_CEILING = 768 * 1024;
const DEFAULT_MAX_FILES = 500;
const MAX_FILES_CEILING = 10000;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateProjectId(projectId) {
  if (typeof projectId !== 'string' || !/^[a-f\d]{24}$/i.test(projectId)) {
    throw httpError(400, 'Invalid project ID.');
  }
}

function validatePath(filePath) {
  if (
    typeof filePath !== 'string' ||
    !filePath ||
    filePath.length > 512 ||
    filePath.startsWith('/') ||
    filePath.includes('\\') ||
    filePath.includes('\0') ||
    /[\u0000-\u001f\u007f]/.test(filePath) ||
    filePath.includes(':')
  ) {
    throw httpError(400, 'Invalid workspace file path.');
  }

  const segments = filePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.trim() !== segment)) {
    throw httpError(400, 'Invalid workspace file path.');
  }

  return filePath;
}

function validateContent(content) {
  if (typeof content !== 'string') {
    throw httpError(400, 'File content must be a string.');
  }

  const { maxFileBytes } = getLimits();
  if (Buffer.byteLength(content, 'utf8') > maxFileBytes) {
    throw httpError(413, `File exceeds the ${maxFileBytes}-byte size limit.`);
  }
}

function configuredLimit(name, fallback, ceiling) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > ceiling) {
    throw new Error(`${name} exceeds the supported maximum.`);
  }
  return limit;
}

function getLimits() {
  return {
    maxFileBytes: configuredLimit('WORKSPACE_FILE_MAX_BYTES', DEFAULT_MAX_FILE_BYTES, MAX_FILE_BYTES_CEILING),
    maxFiles: configuredLimit('WORKSPACE_FILE_MAX_COUNT', DEFAULT_MAX_FILES, MAX_FILES_CEILING),
  };
}

async function requireOwnedProject(projectId, userId) {
  validateProjectId(projectId);
  const project = await Project.findOne({ _id: projectId, userId });
  if (!project) throw httpError(404, 'Project not found.');
  return project;
}

function isSensitivePath(filePath) {
  const segments = filePath.split('/');
  const sensitiveNames = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|authorized_keys|known_hosts)$/i;
  const sensitiveWords = /(?:^|[._-])(?:secret|secrets|credential|credentials|private|token)(?:[._-]|$)/i;
  const sensitiveExtensions = /\.(?:pem|key|p12|pfx|p7b|p7c|jks|keystore|kdbx)$/i;
  return segments.some((segment) => (
    ['.git', '.ssh', 'node_modules', 'coverage'].includes(segment.toLowerCase()) ||
    sensitiveNames.test(segment) ||
    sensitiveWords.test(segment) ||
    sensitiveExtensions.test(segment) ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)$/i.test(segment)
  ));
}

function normalizeSecretLikeContent(content) {
  return typeof content === 'string' ? content : '';
}

function containsCredentialMaterial(content) {
  const value = normalizeSecretLikeContent(content);
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}|(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9]{20,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|AIza[A-Za-z0-9_-]{30,})|Bearer\s+[A-Za-z0-9._~-]{20,}|(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|(?:aws[_-]?)?secret[_-]?access[_-]?key|password|passwd|secret)\s*[:=]\s*["'][^"'\r\n]{8,}["']/i.test(value);
}

function containsPotentialSecretMaterial(content) {
  const value = normalizeSecretLikeContent(content);
  return /sk-(?:proj-)?[A-Za-z0-9_-]{20,}|(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9]{20,})|(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|(?:aws[_-]?)?secret[_-]?access[_-]?key|password|passwd|secret|credential|smtp[_-]?pass|mongo(?:db)?[_-]?uri|database[_-]?url)\s*[:=]\s*(?:["'][^"'\r\n]{4,}["']|[^\s"'`]{8,})|(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\s]+:[^@\s]+@/i.test(value);
}

async function loadSelectedWorkspaceFiles(projectId, userId, paths) {
  await requireOwnedProject(projectId, userId);
  const safePaths = paths.map(validatePath);
  const files = await WorkspaceFile.find({
    projectId,
    path: { $in: safePaths },
  }).lean();

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const missingPaths = safePaths.filter((filePath) => !filesByPath.has(filePath));
  if (missingPaths.length > 0) {
    throw httpError(404, 'One or more selected workspace files were not found.');
  }

  const included = [];
  const excluded = [];
  for (const filePath of safePaths) {
    const file = filesByPath.get(filePath);
    if (
      isSensitivePath(file.path) ||
      containsCredentialMaterial(file.content) ||
      containsPotentialSecretMaterial(file.content)
    ) {
      excluded.push(file.path);
    } else {
      included.push({ path: file.path, content: file.content });
    }
  }
  return { files: included, excludedPaths: excluded };
}

module.exports = {
  httpError,
  validateProjectId,
  validatePath,
  validateContent,
  getLimits,
  requireOwnedProject,
  isSensitivePath,
  containsCredentialMaterial,
  containsPotentialSecretMaterial,
  loadSelectedWorkspaceFiles,
};
