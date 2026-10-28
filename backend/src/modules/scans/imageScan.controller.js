'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const Scan = require('../../models/Scan');
const multer = require('multer');
const { ClamAvError, createClamAvClient } = require('./clamavClient');
const { MAX_FILE_BYTES, UnsupportedFileError, inspectFile, sha256 } = require('./fileScan');

const configuredConcurrentScans = Number(process.env.CLAMAV_MAX_CONCURRENT_SCANS);
const MAX_CONCURRENT_SCANS = Number.isSafeInteger(configuredConcurrentScans)
  && configuredConcurrentScans > 0 && configuredConcurrentScans <= 8
  ? configuredConcurrentScans
  : 2;
let activeScans = 0;

const receiveFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 1, headerPairs: 100 },
}).single('file');

function reserveScanSlot(req, res, next) {
  if (activeScans >= MAX_CONCURRENT_SCANS) {
    return res.status(503).json({ error: 'Antivirus scanner is busy. Try again shortly.', code: 'ANTIVIRUS_BUSY' });
  }
  activeScans += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeScans -= 1;
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}

function uploadFile(req, res, next) {
  receiveFile(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File exceeds the 25 MiB upload limit.', code: 'FILE_TOO_LARGE' });
    }
    return res.status(400).json({ error: 'Invalid file upload.', code: 'INVALID_FILE_UPLOAD' });
  });
}

function scannerFailure(res, error) {
  const code = error instanceof ClamAvError ? error.code : 'ANTIVIRUS_UNAVAILABLE';
  const unavailable = code !== 'ANTIVIRUS_SCAN_FAILED';
  return res.status(unavailable ? 503 : 502).json({
    error: unavailable
      ? 'Antivirus scanning is unavailable or could not be completed. No clean result was produced.'
      : 'Antivirus scanning failed. No clean result was produced.',
    code,
  });
}

const scanImage = asyncHandler(async (req, res) => {
  if (!req.file || !Buffer.isBuffer(req.file.buffer)) {
    return res.status(400).json({ error: 'Attach one file in the "file" field.', code: 'FILE_REQUIRED' });
  }

  const uploadBuffer = req.file.buffer;
  try {
    let fileInfo;
    try {
      fileInfo = await inspectFile(uploadBuffer, req.file.originalname);
    } catch (error) {
      if (error instanceof UnsupportedFileError) {
        return res.status(415).json({ error: error.message, code: 'UNSUPPORTED_FILE_TYPE' });
      }
      console.error('[file-scan] file inspection failed');
      return res.status(400).json({ error: 'File content could not be validated.', code: 'INVALID_FILE_CONTENT' });
    }

    let antivirusResult;
    try {
      antivirusResult = await createClamAvClient().scan(uploadBuffer);
    } catch (error) {
      return scannerFailure(res, error);
    }

    if (!['clean', 'infected'].includes(antivirusResult?.verdict)) {
      return scannerFailure(res, new ClamAvError('ANTIVIRUS_SCAN_FAILED', 'Invalid scanner result.'));
    }

  const scannedAt = new Date();
  const infected = antivirusResult.verdict === 'infected';
  const detectionName = infected ? antivirusResult.detectionName : null;
  const findings = [infected
    ? { severity: 'Critical', title: 'Threat detected', detail: `ClamAV detected ${detectionName}.` }
    : { severity: 'Info', title: 'No malware detected by ClamAV', detail: 'The file was scanned by ClamAV. This result is not a guarantee that the file is completely safe.' }];
  const antivirus = {
    engine: antivirusResult.engine,
    engineVersion: antivirusResult.engineVersion,
    signatureVersion: antivirusResult.signatureVersion,
    signatureUpdatedAt: new Date(antivirusResult.signatureUpdatedAt),
    verdict: antivirusResult.verdict,
    detectionName,
    sha256: sha256(uploadBuffer),
    fileSizeBytes: req.file.size,
    mimeType: fileInfo.mimeType,
    scannedAt,
  };
  const result = infected
    ? `ClamAV detected ${detectionName}.`
    : 'No malware detected by ClamAV. This is not a guarantee that the file is completely safe.';

  let scan;
  try {
    scan = await Scan.create({
      userId: req.user._id,
      type: 'File',
      target: fileInfo.filename,
      status: 'complete',
      risk: infected ? 'Critical' : 'Low',
      result,
      findings,
      antivirus,
    });
  } catch {
    console.error('[file-scan] scan metadata could not be persisted');
    return res.status(503).json({ error: 'Scan completed but its result could not be saved.', code: 'SCAN_PERSISTENCE_FAILED' });
  }

  res.status(201).json({
    scan,
    status: antivirus.verdict,
    risk: scan.risk,
    findings,
    filename: fileInfo.filename,
    sizeBytes: req.file.size,
    analysisType: 'antivirus',
    antivirus,
  });
  } finally {
    uploadBuffer.fill(0);
  }
});

module.exports = { scanImage, uploadFile, reserveScanSlot };
