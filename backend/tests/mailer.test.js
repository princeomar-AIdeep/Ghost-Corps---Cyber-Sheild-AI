'use strict';

const nodemailer = require('nodemailer');
const { sendMail, isConfigured, resetMailerForTests } = require('../src/utils/mailer');

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
let originalEnv;

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SMTP mailer configuration', () => {
  beforeEach(() => {
    originalEnv = Object.fromEntries(SMTP_KEYS.map((key) => [key, process.env[key]]));
    SMTP_KEYS.forEach((key) => delete process.env[key]);
    nodemailer.createTransport.mockReset();
    resetMailerForTests();
  });

  afterEach(() => {
    SMTP_KEYS.forEach((key) => {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
    resetMailerForTests();
  });

  it('reports the required missing SMTP keys without creating a transport', async () => {
    const result = await sendMail({ to: 'recipient@example.com', subject: 'test', text: 'test' });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      reason: 'not_configured',
      message: 'Set SMTP_HOST, SMTP_USER, SMTP_PASS in backend/.env.',
    }));
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(isConfigured()).toBe(false);
  });

  it('rejects an invalid SMTP_PORT before creating a transport', async () => {
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'user@example.test',
      SMTP_PASS: 'test-only-password',
      SMTP_PORT: 'not-a-port',
    });

    const result = await sendMail({ to: 'recipient@example.com', subject: 'test', text: 'test' });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      reason: 'invalid_configuration',
      message: 'SMTP_PORT must be a valid port number.',
    }));
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('sends through the configured transport without exposing SMTP credentials', async () => {
    const send = jest.fn().mockResolvedValue({});
    nodemailer.createTransport.mockReturnValue({ sendMail: send });
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'user@example.test',
      SMTP_PASS: 'test-only-password',
    });

    const result = await sendMail({ to: 'recipient@example.com', subject: 'test', text: 'test' });

    expect(result).toEqual({ ok: true });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      auth: { user: 'user@example.test', pass: 'test-only-password' },
    }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'user@example.test' }));
  });

  it('reports transport delivery failures without returning provider details', async () => {
    nodemailer.createTransport.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(new Error('provider response included sensitive details')),
    });
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'user@example.test',
      SMTP_PASS: 'test-only-password',
    });

    const result = await sendMail({ to: 'recipient@example.com', subject: 'test', text: 'test' });

    expect(result).toEqual({
      ok: false,
      reason: 'delivery_failed',
      message: 'Email delivery failed. Check SMTP settings and provider availability.',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive details');
    expect(JSON.stringify(result)).not.toContain('test-only-password');
  });
});
