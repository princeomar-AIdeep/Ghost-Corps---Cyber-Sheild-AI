'use strict';

const mongoose = require('mongoose');
const { gzipSync } = require('zlib');
const Project = require('../../models/Project');
const WorkspaceFile = require('../../models/WorkspaceFile');
const WorkspaceFileQuota = require('../../models/WorkspaceFileQuota');
const asyncHandler = require('../../utils/asyncHandler');
const {
  httpError,
  validateProjectId,
  validatePath,
  validateContent,
  getLimits,
  requireOwnedProject,
  isSensitivePath,
  containsCredentialMaterial,
  containsPotentialSecretMaterial,
} = require('./workspaceFiles.service');

const MAX_EXPORT_FILES = 500;
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const TAR_BLOCK_BYTES = 512;

async function ensureQuota(projectId, session) {
  const fileCount = await WorkspaceFile.countDocuments({ projectId }, { session });
  await WorkspaceFileQuota.findOneAndUpdate(
    { projectId },
    { $set: { fileCount }, $setOnInsert: { projectId } },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );
}

async function reserveFileSlot(projectId, session) {
  const { maxFiles } = getLimits();
  const reserved = await WorkspaceFileQuota.findOneAndUpdate(
    { projectId, fileCount: mongoose.trusted({ $lt: maxFiles }) },
    { $inc: { fileCount: 1 } },
    { new: true, session }
  );
  if (!reserved) throw httpError(413, `Project exceeds the ${maxFiles}-file limit.`);
}

async function releaseFileSlot(projectId, session) {
  const result = await WorkspaceFileQuota.updateOne(
    { projectId, fileCount: mongoose.trusted({ $gt: 0 }) },
    { $inc: { fileCount: -1 } },
    { session }
  );
  if ((result.matchedCount ?? result.modifiedCount ?? 0) !== 1) {
    throw new Error('Workspace file quota could not be reconciled.');
  }
}

function transactionError(error) {
  if (error?.code === 20 || /Transaction numbers are only allowed on a replica set member or mongos/i.test(error?.message || '')) {
    return httpError(503, 'Workspace file changes require MongoDB transaction support.');
  }
  return error;
}

async function withFileTransaction(operation) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => operation(session));
  } catch (error) {
    throw transactionError(error);
  } finally {
    await session.endSession();
  }
}

function buildTree(files) {
  const roots = new Map();

  for (const file of files) {
    const segments = file.path.split('/');
    let current = roots;
    let node;

    segments.forEach((name, index) => {
      const isFile = index === segments.length - 1;
      if (!current.has(name)) {
        current.set(name, {
          name,
          path: segments.slice(0, index + 1).join('/'),
          type: isFile ? 'file' : 'directory',
          ...(isFile ? { size: Buffer.byteLength(file.content, 'utf8'), updatedAt: file.updatedAt } : { children: new Map() }),
        });
      }
      node = current.get(name);
      if (!isFile) current = node.children;
    });
  }

  function toArray(nodes) {
    return Array.from(nodes.values(), (node) => (
      node.type === 'file'
        ? node
        : { name: node.name, path: node.path, type: node.type, children: toArray(node.children) }
    ));
  }
  return toArray(roots);
}

const listFiles = asyncHandler(async (req, res) => {
  await requireOwnedProject(req.params.projectId, req.user._id);
  const files = await WorkspaceFile.find({ projectId: req.params.projectId }).sort({ path: 1 });
  res.json({
    files: files.map(({ path, content, updatedAt }) => ({
      path,
      size: Buffer.byteLength(content, 'utf8'),
      updatedAt,
    })),
    tree: buildTree(files),
  });
});

const readFile = asyncHandler(async (req, res) => {
  await requireOwnedProject(req.params.projectId, req.user._id);
  const filePath = validatePath(req.query.path);
  const file = await WorkspaceFile.findOne({ projectId: req.params.projectId, path: filePath });
  if (!file) return res.status(404).json({ error: 'Workspace file not found.' });
  res.json({ path: file.path, content: file.content, updatedAt: file.updatedAt });
});

const createFile = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  await requireOwnedProject(projectId, req.user._id);
  const filePath = validatePath(req.body.path);
  validateContent(req.body.content);
  let createdFile;
  await withFileTransaction(async (session) => {
    await ensureQuota(projectId, session);
    await reserveFileSlot(projectId, session);
    [createdFile] = await WorkspaceFile.create([{
      projectId,
      path: filePath,
      content: req.body.content,
    }], { session });
  });
  res.status(201).json({
    path: createdFile.path,
    content: createdFile.content,
    updatedAt: createdFile.updatedAt,
  });
});

const updateFile = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  await requireOwnedProject(projectId, req.user._id);
  const filePath = validatePath(req.body.path);
  validateContent(req.body.content);

  const file = await WorkspaceFile.findOneAndUpdate(
    { projectId, path: filePath },
    { $set: { content: req.body.content } },
    { new: true, runValidators: true }
  );
  if (!file) return res.status(404).json({ error: 'Workspace file not found.' });
  res.json({ path: file.path, content: file.content, updatedAt: file.updatedAt });
});

const renameFile = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  await requireOwnedProject(projectId, req.user._id);
  const fromPath = validatePath(req.body.fromPath);
  const toPath = validatePath(req.body.toPath);
  if (fromPath === toPath) return res.status(400).json({ error: 'New path must differ from the current path.' });

  const file = await WorkspaceFile.findOneAndUpdate(
    { projectId, path: fromPath },
    { $set: { path: toPath } },
    { new: true, runValidators: true }
  );
  if (!file) return res.status(404).json({ error: 'Workspace file not found.' });
  res.json({ path: file.path, content: file.content, updatedAt: file.updatedAt });
});

const deleteFile = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  await requireOwnedProject(projectId, req.user._id);
  const filePath = validatePath(req.body.path);
  let deleted;
  await withFileTransaction(async (session) => {
    await ensureQuota(projectId, session);
    deleted = await WorkspaceFile.findOneAndDelete(
      { projectId, path: filePath },
      { session }
    );
    if (!deleted) return;
    await releaseFileSlot(projectId, session);
  });
  if (!deleted) return res.status(404).json({ error: 'Workspace file not found.' });
  res.json({ message: 'Workspace file deleted.' });
});

function tarOctal(value, length) {
  return `${Math.trunc(value).toString(8).padStart(length - 1, '0')}\0`;
}

function tarHeader(filePath, size, type = '0') {
  const header = Buffer.alloc(TAR_BLOCK_BYTES);
  const pathBytes = Buffer.from(filePath);
  let name = pathBytes;
  let prefix = Buffer.alloc(0);
  if (pathBytes.length > 100) {
    const slash = filePath.lastIndexOf('/');
    if (slash > 0) {
      const candidatePrefix = Buffer.from(filePath.slice(0, slash));
      const candidateName = Buffer.from(filePath.slice(slash + 1));
      if (candidatePrefix.length <= 155 && candidateName.length <= 100) {
        prefix = candidatePrefix;
        name = candidateName;
      }
    }
  }
  if (name.length > 100 || prefix.length > 155) throw httpError(400, 'Workspace file path cannot be represented safely in an export archive.');
  name.copy(header, 0);
  Buffer.from(tarOctal(0o644, 8)).copy(header, 100);
  Buffer.from(tarOctal(0, 8)).copy(header, 108);
  Buffer.from(tarOctal(0, 8)).copy(header, 116);
  Buffer.from(tarOctal(size, 12)).copy(header, 124);
  Buffer.from(tarOctal(0, 12)).copy(header, 136);
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  Buffer.from('ustar\0').copy(header, 257);
  Buffer.from('00').copy(header, 263);
  prefix.copy(header, 345);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `).copy(header, 148);
  return header;
}

function paddedTarEntry(header, content) {
  const paddingSize = (TAR_BLOCK_BYTES - (content.length % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES;
  return paddingSize ? [header, content, Buffer.alloc(paddingSize)] : [header, content];
}

function paxPathRecord(filePath) {
  const body = `path=${filePath}\n`;
  let length = Buffer.byteLength(body) + 2;
  while (true) {
    const record = `${length} ${body}`;
    const actualLength = Buffer.byteLength(record);
    if (actualLength === length) return Buffer.from(record);
    length = actualLength;
  }
}

function createTarGzip(files) {
  const chunks = [];
  files.forEach((file, index) => {
    const content = Buffer.from(file.content, 'utf8');
    let archivePath = file.path;
    const pathBytes = Buffer.from(archivePath);
    const slash = archivePath.lastIndexOf('/');
    const prefixBytes = slash > 0 ? Buffer.from(archivePath.slice(0, slash)) : Buffer.alloc(0);
    const nameBytes = Buffer.from(slash > 0 ? archivePath.slice(slash + 1) : archivePath);
    if (nameBytes.length > 100 || prefixBytes.length > 155 || pathBytes.length > 255) {
      const pax = paxPathRecord(archivePath);
      chunks.push(...paddedTarEntry(tarHeader(`PaxHeaders/${index}`, pax.length, 'x'), pax));
      archivePath = `file-${index}`;
    }
    chunks.push(...paddedTarEntry(tarHeader(archivePath, content.length), content));
  });
  chunks.push(Buffer.alloc(TAR_BLOCK_BYTES * 2));
  return gzipSync(Buffer.concat(chunks));
}

const exportSource = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  await requireOwnedProject(projectId, req.user._id);

  const cursor = WorkspaceFile.find({ projectId }).sort({ path: 1 }).cursor();
  const files = [];
  let scannedFiles = 0;
  let totalBytes = 0;
  for await (const file of cursor) {
    scannedFiles += 1;
    if (scannedFiles > MAX_EXPORT_FILES) {
      throw httpError(413, `Source export exceeds the ${MAX_EXPORT_FILES}-file limit.`);
    }
    const filePath = validatePath(file.path);
    if (
      isSensitivePath(filePath) ||
      containsCredentialMaterial(file.content) ||
      containsPotentialSecretMaterial(file.content)
    ) continue;
    const fileBytes = Buffer.byteLength(file.content, 'utf8');
    if (totalBytes + fileBytes > MAX_EXPORT_BYTES) {
      throw httpError(413, `Source export exceeds the ${MAX_EXPORT_BYTES}-byte limit.`);
    }
    files.push({ path: filePath, content: file.content });
    totalBytes += fileBytes;
  }

  const archive = createTarGzip(files);
  res
    .status(200)
    .type('application/gzip')
    .set('Content-Disposition', 'attachment; filename="project-source.tar.gz"')
    .set('X-Exported-File-Count', String(files.length))
    .send(archive);
});

module.exports = {
  listFiles,
  readFile,
  createFile,
  updateFile,
  renameFile,
  deleteFile,
  exportSource,
  validatePath,
  validateContent,
  getLimits,
  buildTree,
  MAX_EXPORT_FILES,
  MAX_EXPORT_BYTES,
};
