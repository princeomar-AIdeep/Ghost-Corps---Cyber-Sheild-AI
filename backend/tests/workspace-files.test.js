'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { gunzipSync } = require('zlib');
const createApp = require('../app');
const Project = require('../src/models/Project');
const WorkspaceFile = require('../src/models/WorkspaceFile');
const WorkspaceFileQuota = require('../src/models/WorkspaceFileQuota');

jest.mock('../src/models/Project', () => ({
  findOne: jest.fn(),
}));

jest.mock('../src/models/WorkspaceFile', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
}));

jest.mock('../src/models/WorkspaceFileQuota', () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));

const PROJECT_ID = '65a1b2c3d4e5f67890123456';
const USER_ID = '65f1b2c3d4e5f67890123456';
const app = createApp();

function authorization(userId = USER_ID) {
  const token = jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'workspace@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

function makeFile(path, content = 'source', updatedAt = new Date('2026-01-01T00:00:00Z')) {
  return { path, content, updatedAt };
}

function mockCursor(files) {
  return {
    sort: jest.fn().mockReturnThis(),
    cursor: jest.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield* files;
      },
    })),
  };
}

function readTarEntries(archive) {
  const tar = gunzipSync(archive);
  const entries = [];
  let offset = 0;
  let pendingPath = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString().replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8);
    const type = String.fromCharCode(header[156]);
    const contentStart = offset + 512;
    const content = tar.subarray(contentStart, contentStart + size);
    if (type === 'x') {
      pendingPath = content.toString().match(/\d+ path=([^\n]*)\n/)?.[1] || null;
    } else {
      entries.push({
        path: pendingPath || [prefix, name].filter(Boolean).join('/'),
        content: content.toString(),
      });
      pendingPath = null;
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

describe('/api/projects/:projectId/files', () => {
  let originalMaxBytes;
  let originalMaxFiles;
  let session;

  beforeEach(() => {
    originalMaxBytes = process.env.WORKSPACE_FILE_MAX_BYTES;
    originalMaxFiles = process.env.WORKSPACE_FILE_MAX_COUNT;
    delete process.env.WORKSPACE_FILE_MAX_BYTES;
    delete process.env.WORKSPACE_FILE_MAX_COUNT;
    session = {
      withTransaction: jest.fn((operation) => operation(session)),
      endSession: jest.fn().mockResolvedValue(),
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    Project.findOne.mockResolvedValue({ _id: PROJECT_ID, userId: USER_ID });
    WorkspaceFile.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
    WorkspaceFile.findOne.mockResolvedValue(null);
    WorkspaceFile.countDocuments.mockResolvedValue(0);
    WorkspaceFile.create.mockResolvedValue([makeFile('src/index.js')]);
    WorkspaceFile.findOneAndUpdate.mockResolvedValue(makeFile('src/index.js'));
    WorkspaceFile.findOneAndDelete.mockResolvedValue(makeFile('src/index.js'));
    WorkspaceFileQuota.findOneAndUpdate
      .mockResolvedValueOnce({ projectId: PROJECT_ID, fileCount: 0 })
      .mockResolvedValue({ projectId: PROJECT_ID, fileCount: 1 });
    WorkspaceFileQuota.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  afterEach(() => {
    if (originalMaxBytes === undefined) delete process.env.WORKSPACE_FILE_MAX_BYTES;
    else process.env.WORKSPACE_FILE_MAX_BYTES = originalMaxBytes;
    if (originalMaxFiles === undefined) delete process.env.WORKSPACE_FILE_MAX_COUNT;
    else process.env.WORKSPACE_FILE_MAX_COUNT = originalMaxFiles;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('requires authentication', async () => {
    const response = await request(app).get(`/api/projects/${PROJECT_ID}/files`);
    expect(response.statusCode).toBe(401);
    expect(Project.findOne).not.toHaveBeenCalled();
  });

  it('rejects malformed project IDs before querying ownership', async () => {
    const response = await request(app)
      .get('/api/projects/not-an-object-id/files')
      .set(authorization());

    expect(response.statusCode).toBe(400);
    expect(Project.findOne).not.toHaveBeenCalled();
  });

  it('isolates files by project ownership', async () => {
    Project.findOne.mockResolvedValueOnce(null);

    const response = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization());

    expect(response.statusCode).toBe(404);
    expect(Project.findOne).toHaveBeenCalledWith({ _id: PROJECT_ID, userId: USER_ID });
    expect(WorkspaceFile.find).not.toHaveBeenCalled();
  });

  it.each([
    ['parent traversal', '../secrets.txt'],
    ['nested traversal', 'src/../../secrets.txt'],
    ['absolute path', '/etc/passwd'],
    ['Windows separator', 'src\\secrets.txt'],
    ['null byte', 'src/file\0.txt'],
    ['empty path segment', 'src//file.txt'],
    ['dot segment', 'src/./file.txt'],
  ])('rejects %s paths', async (_label, path) => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization())
      .send({ path, content: 'safe text' });

    expect(response.statusCode).toBe(400);
    expect(WorkspaceFileQuota.findOneAndUpdate).not.toHaveBeenCalled();
    expect(WorkspaceFile.create).not.toHaveBeenCalled();
  });

  it('enforces the configured UTF-8 file size limit', async () => {
    process.env.WORKSPACE_FILE_MAX_BYTES = '4';

    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization())
      .send({ path: 'note.txt', content: 'ééé' });

    expect(response.statusCode).toBe(413);
    expect(WorkspaceFileQuota.findOneAndUpdate).not.toHaveBeenCalled();
    expect(WorkspaceFile.create).not.toHaveBeenCalled();
  });

  it('enforces the configured project file-count limit atomically', async () => {
    process.env.WORKSPACE_FILE_MAX_COUNT = '1';
    WorkspaceFileQuota.findOneAndUpdate
      .mockReset()
      .mockResolvedValueOnce({ projectId: PROJECT_ID, fileCount: 1 })
      .mockResolvedValueOnce(null);

    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization())
      .send({ path: 'note.txt', content: 'safe text' });

    expect(response.statusCode).toBe(413);
    expect(WorkspaceFile.create).not.toHaveBeenCalled();
  });

  it('creates a file and reserves its quota in the same transaction', async () => {
    WorkspaceFile.create.mockResolvedValueOnce([makeFile('note.txt', 'contents')]);

    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization())
      .send({ path: 'note.txt', content: 'contents' });

    expect(response.statusCode).toBe(201);
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(WorkspaceFile.countDocuments).toHaveBeenCalledWith({ projectId: PROJECT_ID }, { session });
    expect(WorkspaceFileQuota.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { projectId: PROJECT_ID },
      { $set: { fileCount: 0 }, $setOnInsert: { projectId: PROJECT_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
    expect(WorkspaceFileQuota.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { projectId: PROJECT_ID, fileCount: mongoose.trusted({ $lt: 500 }) },
      { $inc: { fileCount: 1 } },
      { new: true, session }
    );
    expect(WorkspaceFile.create).toHaveBeenCalledWith([{
      projectId: PROJECT_ID,
      path: 'note.txt',
      content: 'contents',
    }], { session });
    expect(session.endSession).toHaveBeenCalled();
  });

  it('reconciles a stale quota counter from stored files before creating another file', async () => {
    WorkspaceFile.countDocuments.mockResolvedValueOnce(4);

    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization())
      .send({ path: 'note.txt', content: 'contents' });

    expect(response.statusCode).toBe(201);
    expect(WorkspaceFileQuota.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { projectId: PROJECT_ID },
      { $set: { fileCount: 4 }, $setOnInsert: { projectId: PROJECT_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
  });

  it('does not separately compensate quota when file creation fails inside the transaction', async () => {
    WorkspaceFile.create.mockRejectedValueOnce(Object.assign(new Error('duplicate file'), { code: 11000 }));

    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization())
      .send({ path: 'note.txt', content: 'contents' });

    expect(response.statusCode).toBe(409);
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(WorkspaceFileQuota.updateOne).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('deletes a file and decrements its quota in the same transaction', async () => {
    const response = await request(app)
      .delete(`/api/projects/${PROJECT_ID}/files/file`)
      .set(authorization())
      .send({ path: 'note.txt' });

    expect(response.statusCode).toBe(200);
    expect(WorkspaceFile.findOneAndDelete).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, path: 'note.txt' },
      { session }
    );
    expect(WorkspaceFileQuota.updateOne).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, fileCount: mongoose.trusted({ $gt: 0 }) },
      { $inc: { fileCount: -1 } },
      { session }
    );
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when MongoDB transactions are unsupported', async () => {
    session.withTransaction.mockRejectedValueOnce(Object.assign(
      new Error('Transaction numbers are only allowed on a replica set member or mongos'),
      { code: 20 }
    ));

    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization())
      .send({ path: 'note.txt', content: 'contents' });

    expect(response.statusCode).toBe(503);
    expect(response.body.error).toMatch(/MongoDB transaction support/);
    expect(session.endSession).toHaveBeenCalled();
  });

  it('lists files as a tree and supports read, create, update, rename, and delete', async () => {
    const listedFile = makeFile('src/index.js', 'console.log("safe")');
    WorkspaceFile.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([listedFile]) });
    WorkspaceFile.findOne.mockResolvedValueOnce(listedFile);
    WorkspaceFile.create.mockResolvedValueOnce([makeFile('README.md', 'initial')]);
    WorkspaceFile.findOneAndUpdate
      .mockResolvedValueOnce(makeFile('README.md', 'updated'))
      .mockResolvedValueOnce(makeFile('README.md', 'updated'));
    WorkspaceFile.findOneAndDelete.mockResolvedValueOnce(makeFile('README.md', 'updated'));

    const listResponse = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization());
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.files).toEqual([{
      path: 'src/index.js',
      size: Buffer.byteLength('console.log("safe")', 'utf8'),
      updatedAt: listedFile.updatedAt.toISOString(),
    }]);
    expect(listResponse.body.tree).toEqual([{
      name: 'src',
      path: 'src',
      type: 'directory',
      children: [{
        name: 'index.js',
        path: 'src/index.js',
        type: 'file',
        size: Buffer.byteLength('console.log("safe")', 'utf8'),
        updatedAt: listedFile.updatedAt.toISOString(),
      }],
    }]);

    const readResponse = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files/file`)
      .query({ path: 'src/index.js' })
      .set(authorization());
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.body.content).toBe('console.log("safe")');

    const createResponse = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files`)
      .set(authorization())
      .send({ path: 'README.md', content: 'initial' });
    expect(createResponse.statusCode).toBe(201);
    expect(WorkspaceFile.create).toHaveBeenCalledWith([{
      projectId: PROJECT_ID,
      path: 'README.md',
      content: 'initial',
    }], { session });

    const updateResponse = await request(app)
      .put(`/api/projects/${PROJECT_ID}/files/file`)
      .set(authorization())
      .send({ path: 'README.md', content: 'updated' });
    expect(updateResponse.statusCode).toBe(200);
    expect(WorkspaceFile.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { projectId: PROJECT_ID, path: 'README.md' },
      { $set: { content: 'updated' } },
      { new: true, runValidators: true }
    );

    const renameResponse = await request(app)
      .post(`/api/projects/${PROJECT_ID}/files/rename`)
      .set(authorization())
      .send({ fromPath: 'README.md', toPath: 'docs/README.md' });
    expect(renameResponse.statusCode).toBe(200);
    expect(WorkspaceFile.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { projectId: PROJECT_ID, path: 'README.md' },
      { $set: { path: 'docs/README.md' } },
      { new: true, runValidators: true }
    );

    const deleteResponse = await request(app)
      .delete(`/api/projects/${PROJECT_ID}/files/file`)
      .set(authorization())
      .send({ path: 'docs/README.md' });
    expect(deleteResponse.statusCode).toBe(200);
    expect(WorkspaceFile.findOneAndDelete).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, path: 'docs/README.md' },
      { session }
    );
    expect(WorkspaceFileQuota.updateOne).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, fileCount: mongoose.trusted({ $gt: 0 }) },
      { $inc: { fileCount: -1 } },
      { session }
    );
  });

  it('exports only safe project source files as a bounded gzip tar archive', async () => {
    WorkspaceFile.find.mockReturnValueOnce(mockCursor([
      makeFile('src/app.js', 'export const app = true;'),
      makeFile('.env', 'PRIVATE_VALUE_DO_NOT_EXPORT'),
      makeFile('config/credentials.json', '{"secret":"PRIVATE_VALUE_DO_NOT_EXPORT"}'),
      makeFile('src/embedded.js', 'const api_key = "PRIVATE_VALUE_DO_NOT_EXPORT";'),
      makeFile('src/unquoted-config.js', 'api_key=example-placeholder-value'),
      makeFile('node_modules/pkg/index.js', 'dependency source'),
    ]));

    const response = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files/export`)
      .set(authorization())
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/gzip/);
    expect(response.headers['content-disposition']).toContain('project-source.tar.gz');
    expect(response.headers['x-exported-file-count']).toBe('1');
    expect(readTarEntries(response.body)).toEqual([{
      path: 'src/app.js',
      content: 'export const app = true;',
    }]);
    expect(response.body.toString()).not.toContain('PRIVATE_VALUE_DO_NOT_EXPORT');
  });

  it('preserves long valid file paths in the tar archive using a PAX path record', async () => {
    const longPath = `src/${'nested/'.repeat(24)}file.js`;
    WorkspaceFile.find.mockReturnValueOnce(mockCursor([makeFile(longPath, 'safe source')]));

    const response = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files/export`)
      .set(authorization())
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.statusCode).toBe(200);
    expect(readTarEntries(response.body)).toEqual([{ path: longPath, content: 'safe source' }]);
  });

  it('requires authentication and project ownership for source exports', async () => {
    const unauthenticated = await request(app).get(`/api/projects/${PROJECT_ID}/files/export`);
    expect(unauthenticated.statusCode).toBe(401);

    Project.findOne.mockResolvedValueOnce(null);
    const notOwner = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files/export`)
      .set(authorization());
    expect(notOwner.statusCode).toBe(404);
    expect(WorkspaceFile.find).not.toHaveBeenCalled();
  });

  it('rejects unsafe stored paths instead of placing them in an export', async () => {
    WorkspaceFile.find.mockReturnValueOnce(mockCursor([makeFile('../outside.txt', 'unsafe')]));

    const response = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files/export`)
      .set(authorization());

    expect(response.statusCode).toBe(400);
  });

  it('enforces source export file-count and total content limits', async () => {
    WorkspaceFile.find.mockReturnValueOnce(mockCursor(
      Array.from({ length: 501 }, (_, index) => makeFile(`src/${index}.js`, 'x'))
    ));
    const tooManyFiles = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files/export`)
      .set(authorization());
    expect(tooManyFiles.statusCode).toBe(413);

    WorkspaceFile.find.mockReturnValueOnce(mockCursor([
      makeFile('src/large.js', 'x'.repeat(10 * 1024 * 1024 + 1)),
    ]));
    const tooLarge = await request(app)
      .get(`/api/projects/${PROJECT_ID}/files/export`)
      .set(authorization());
    expect(tooLarge.statusCode).toBe(413);
  });
});
