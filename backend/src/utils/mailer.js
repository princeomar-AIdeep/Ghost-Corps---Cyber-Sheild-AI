'use strict';

/**
 * mailer.js — Nodemailer sender.
 * SMTP credentials stay in environment variables. Failures never include secrets.
 */

const nodemailer = require('nodemailer');

let _transporter = null;

function getSmtpConfig() {
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']
    .filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    return {
      ok: false,
      reason: 'not_configured',
      message: `Set ${missing.join(', ')} in backend/.env.`,
    };
  }

  const portText = process.env.SMTP_PORT || '587';
  if (!/^\d+$/.test(portText)) {
    return { ok: false, reason: 'invalid_configuration', message: 'SMTP_PORT must be a valid port number.' };
  }
  const port = Number(portText);
  if (port < 1 || port > 65535) {
    return { ok: false, reason: 'invalid_configuration', message: 'SMTP_PORT must be between 1 and 65535.' };
  }

  return {
    ok: true,
    host: process.env.SMTP_HOST,
    port,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };
}

function getTransporter() {
  if (_transporter) return _transporter;

  const config = getSmtpConfig();
  if (!config.ok) return null;

  _transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  return _transporter;
}

async function sendMail({ to, subject, html, text }) {
  const config = getSmtpConfig();
  if (!config.ok) {
    console.warn(`[mailer] SMTP configuration unavailable (${config.reason}); email not sent`);
    return { ok: false, reason: config.reason, message: config.message };
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[mailer] SMTP transport unavailable; email not sent');
    return { ok: false, reason: 'invalid_configuration', message: 'SMTP transport could not be configured.' };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || config.user,
      to,
      subject,
      html,
      text: text || String(html || '').replace(/<[^>]+>/g, ''),
    });
    console.log('[mailer] Email sent');
    return { ok: true };
  } catch (err) {
    console.error('[mailer] Failed to send email');
    return { ok: false, reason: 'delivery_failed', message: 'Email delivery failed. Check SMTP settings and provider availability.' };
  }
}

function resetMailerForTests() {
  _transporter = null;
}

module.exports = {
  sendMail,
  isConfigured: () => getSmtpConfig().ok && Boolean(getTransporter()),
  resetMailerForTests,
};
