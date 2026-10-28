'use strict';

/**
 * usbAlert.controller.js — Pen Drive / USB Device Scan Alert
 *
 * POST /api/usb/alert
 *   Receives a report from the frontend USB monitor (file list + metadata).
 *   Runs heuristic checks on filenames, scans for suspicious extensions.
 *   Sends an email alert to the authenticated user if threats are found.
 *
 * NOTE: Browser-based USB monitoring cannot access the raw filesystem.
 * The frontend uses the File System Access API (user must grant access to
 * a directory on the drive). This endpoint processes whatever filenames
 * and sizes the user provides.
 */

const asyncHandler = require('../../utils/asyncHandler');
const { sendMail } = require('../../utils/mailer');
const { escapeHtml } = require('../../utils/htmlEscape');
const User = require('../../models/User');
const Scan = require('../../models/Scan');

const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.vbs', '.js', '.jse', '.wsf', '.wsh',
  '.ps1', '.ps2', '.psc1', '.psc2', '.msi', '.msp', '.scr', '.hta', '.cpl',
  '.dll', '.sys', '.drv', '.vxd', '.pif', '.lnk', '.jar', '.apk',
  '.sh', '.bash', '.zsh', '.py', '.rb', '.pl', '.php',
];

const SUSPICIOUS_PATTERNS = [
  /autorun\.inf$/i,
  /setup\.exe$/i,
  /install\.exe$/i,
  /update\.exe$/i,
  /patch\.exe$/i,
  /crack/i,
  /keygen/i,
  /hack/i,
  /trojan/i,
  /virus/i,
  /malware/i,
  /ransomware/i,
];

function scanFileList(files) {
  const threats = [];
  const warnings = [];

  for (const file of files) {
    const name = (file.name || '').toLowerCase();
    const ext = '.' + name.split('.').pop();

    if (SUSPICIOUS_PATTERNS.some((p) => p.test(name))) {
      threats.push({ name: file.name, reason: 'Name matches known malicious pattern', severity: 'Critical' });
    } else if (DANGEROUS_EXTENSIONS.includes(ext)) {
      warnings.push({ name: file.name, reason: `Executable extension: ${ext}`, severity: 'High' });
    }
  }

  return { threats, warnings };
}

/**
 * POST /api/usb/alert
 * Body: { deviceLabel: string, files: [{ name, size, type }] }
 */
const reportUsbDevice = asyncHandler(async (req, res) => {
  const { deviceLabel = 'Unknown Device', files = [] } = req.body;

  if (!Array.isArray(files)) {
    return res.status(400).json({ error: 'files must be an array.' });
  }

  const { threats, warnings } = scanFileList(files);
  const hasThreat = threats.length > 0 || warnings.length > 0;
  const risk = threats.length > 0 ? 'Critical' : warnings.length > 0 ? 'High' : 'Low';

  // Fetch user email
  const user = await User.findById(req.user._id);
  const userEmail = user?.email;

  let emailResult = { ok: false, reason: 'No threats detected — email not sent' };

  if (hasThreat && userEmail) {
    const itemRows = [...threats, ...warnings].map((f) =>
      `<tr style="border-bottom:1px solid #1e3a4a">
        <td style="padding:6px 10px;color:#ff8a8a">${escapeHtml(f.severity)}</td>
        <td style="padding:6px 10px;color:#e0edf5;word-break:break-all">${escapeHtml(f.name)}</td>
        <td style="padding:6px 10px;color:#9ab8c6">${escapeHtml(f.reason)}</td>
      </tr>`
    ).join('');

    const html = `
      <div style="font-family:Arial,sans-serif;background:#030b11;color:#e0edf5;padding:24px;border-radius:10px;max-width:600px">
        <h2 style="color:#ff4b57;margin:0 0 8px">⚠️ USB Threat Alert — CYBER-AGENT AI</h2>
        <p style="color:#9ab8c6;margin:0 0 16px">A removable device was scanned and suspicious files were detected.</p>
        <table style="width:100%;border-collapse:collapse;background:#06141d;border-radius:8px;overflow:hidden">
          <thead><tr style="background:#0b2232">
            <th style="padding:8px 10px;text-align:left;color:#7db8cb;font-size:11px">SEVERITY</th>
            <th style="padding:8px 10px;text-align:left;color:#7db8cb;font-size:11px">FILE</th>
            <th style="padding:8px 10px;text-align:left;color:#7db8cb;font-size:11px">REASON</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p style="margin:16px 0 0;color:#7db8cb;font-size:12px">
          Device: <strong style="color:#e0edf5">${escapeHtml(deviceLabel)}</strong> ·
          ${files.length} file(s) scanned ·
          ${threats.length} threat(s), ${warnings.length} warning(s)
        </p>
        <p style="margin:8px 0 0;color:#506070;font-size:11px">CYBER-AGENT AI · Automated Security Alert</p>
      </div>`;

    emailResult = await sendMail({
      to: userEmail,
      subject: `USB Threat Alert — ${threats.length} threat(s) detected`,
      html,
    });
  }

  await Scan.create({
    userId: req.user._id,
    type: 'File',
    target: `usb:${String(deviceLabel).slice(0, 180)}`,
    status: 'complete',
    risk,
    findings: [...threats, ...warnings].map((item) => ({
      severity: item.severity,
      title: item.name,
      detail: item.reason,
    })),
    result: 'Heuristic filename review from a user-selected folder. This is not operating-system USB monitoring or antivirus.',
  });

  res.status(201).json({
    deviceLabel,
    filesScanned: files.length,
    threats,
    warnings,
    risk,
    emailSent: emailResult.ok,
    emailNote: emailResult.ok ? 'Alert email sent to your account address.' : (emailResult.reason || undefined),
    analysisType: 'heuristic-filenames',
    osMonitor: false,
  });
});

module.exports = { reportUsbDevice };
