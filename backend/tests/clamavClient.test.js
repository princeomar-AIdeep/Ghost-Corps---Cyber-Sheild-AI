'use strict';

const net = require('node:net');
const { createClamAvClient } = require('../src/modules/scans/clamavClient');

async function startFakeClamd({ scanResponse = 'stream: OK', version = null, holdStream = false } = {}) {
  const commands = [];
  const versionResponse = version || `ClamAV 1.5.4/12345/${new Date().toUTCString()}`;
  const server = net.createServer((socket) => {
    let input = Buffer.alloc(0);
    let mode = '';

    socket.on('data', (chunk) => {
      input = Buffer.concat([input, chunk]);
      if (!mode) {
        const terminator = input.indexOf(0);
        if (terminator === -1) return;
        mode = input.subarray(0, terminator).toString('utf8');
        commands.push(mode);
        input = input.subarray(terminator + 1);
        if (mode === 'zVERSION') {
          socket.write(Buffer.from(`${versionResponse}\0`));
          return;
        }
        if (mode !== 'zINSTREAM') {
          socket.write(Buffer.from('UNKNOWN COMMAND\0'));
          return;
        }
      }

      if (mode !== 'zINSTREAM' || holdStream) return;
      while (input.length >= 4) {
        const length = input.readUInt32BE(0);
        if (input.length < 4 + length) return;
        input = input.subarray(4 + length);
        if (length === 0) {
          socket.write(Buffer.from(`${scanResponse}\0`));
          return;
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, port, commands };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

describe('ClamAV INSTREAM client', () => {
  it('returns ClamAV version and a clean verdict after a successful stream scan', async () => {
    const fake = await startFakeClamd({ scanResponse: 'stream: OK' });
    try {
      const result = await createClamAvClient({ host: '127.0.0.1', port: fake.port }).scan(Buffer.from('safe test fixture'));
      expect(result).toEqual(expect.objectContaining({
        engine: 'ClamAV',
        engineVersion: '1.5.4',
        signatureVersion: 12345,
        verdict: 'clean',
        detectionName: null,
      }));
      expect(fake.commands).toEqual(['zVERSION', 'zINSTREAM']);
    } finally {
      await closeServer(fake.server);
    }
  });

  it('returns the exact antivirus detection name for a harmless EICAR test string', async () => {
    const fake = await startFakeClamd({ scanResponse: 'stream: Eicar-Test-Signature FOUND' });
    try {
      const result = await createClamAvClient({ host: '127.0.0.1', port: fake.port }).scan(
        Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')
      );
      expect(result.verdict).toBe('infected');
      expect(result.detectionName).toBe('Eicar-Test-Signature');
    } finally {
      await closeServer(fake.server);
    }
  });

  it('fails closed when signature definitions are stale', async () => {
    const staleDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toUTCString();
    const fake = await startFakeClamd({ version: `ClamAV 1.5.4/12345/${staleDate}` });
    try {
      await expect(createClamAvClient({ host: '127.0.0.1', port: fake.port }).scan(Buffer.from('file')))
        .rejects.toMatchObject({ code: 'ANTIVIRUS_UNAVAILABLE' });
      expect(fake.commands).toEqual(['zVERSION']);
    } finally {
      await closeServer(fake.server);
    }
  });

  it('fails on malformed clamd scan output', async () => {
    const fake = await startFakeClamd({ scanResponse: 'unexpected response' });
    try {
      await expect(createClamAvClient({ host: '127.0.0.1', port: fake.port }).scan(Buffer.from('file')))
        .rejects.toMatchObject({ code: 'ANTIVIRUS_SCAN_FAILED' });
    } finally {
      await closeServer(fake.server);
    }
  });

  it('fails closed when clamd reports a scan limit exceeded marker', async () => {
    const fake = await startFakeClamd({ scanResponse: 'stream: Heuristics.Limits.Exceeded FOUND' });
    try {
      await expect(createClamAvClient({ host: '127.0.0.1', port: fake.port }).scan(Buffer.from('file')))
        .rejects.toMatchObject({ code: 'ANTIVIRUS_SCAN_FAILED' });
    } finally {
      await closeServer(fake.server);
    }
  });

  it('times out when clamd does not finish scanning', async () => {
    const fake = await startFakeClamd({ holdStream: true });
    try {
      await expect(createClamAvClient({ host: '127.0.0.1', port: fake.port, timeoutMs: 40 }).scan(Buffer.from('file')))
        .rejects.toMatchObject({ code: 'ANTIVIRUS_TIMEOUT' });
    } finally {
      await closeServer(fake.server);
    }
  });
});
