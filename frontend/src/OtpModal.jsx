/**
 * OtpModal.jsx — Cyber Shield AI
 * Premium futuristic email OTP verification modal.
 *
 * Props
 * ─────
 *   email       {string}   The email address the code was sent to (masked at render time)
 *   onSubmit    {(otp: string) => void}   Called with the 6-digit code when "Verify Code" is pressed
 *   onResend    {() => void}              Called when "Resend code" is clicked
 *   onBack      {() => void}              Called when the back arrow / back link is clicked
 *   busy        {boolean}                 True while a network request is in progress
 *   error       {string}                  Error message from the caller (empty string = no error)
 *   info        {string}                  Info/success message from the caller
 *   expiresIn   {number|null}             Seconds until expiry (null = unknown / hide timer)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  Check,
  Mail,
  RefreshCw,
  Shield,
  X,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import './otp-modal.css';

/* ── helpers ─────────────────────────────────────────────────────────────── */

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}@${domain}`;
}

function padTwo(n) {
  return String(n).padStart(2, '0');
}

/* ── component ───────────────────────────────────────────────────────────── */

export default function OtpModal({
  email = '',
  onSubmit,
  onResend,
  onBack,
  busy = false,
  error = '',
  info = '',
  expiresIn = null,
}) {
  // Six-cell digits array
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);

  // Local countdown (seeded by expiresIn prop or defaulted to 600s when a resend fires)
  const [countdown, setCountdown] = useState(() =>
    typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 600,
  );
  const timerRef = useRef(null);

  // Track resend cooldown (30 s)
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendRef = useRef(null);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Sync expiresIn prop → restart countdown
  useEffect(() => {
    if (typeof expiresIn === 'number' && expiresIn > 0) {
      setCountdown(expiresIn);
    }
  }, [expiresIn]);

  // Countdown tick
  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Resend cooldown tick
  useEffect(() => {
    clearInterval(resendRef.current);
    if (resendCooldown > 0) {
      resendRef.current = setInterval(() => {
        setResendCooldown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(resendRef.current);
  }, [resendCooldown]);

  const codeComplete = digits.every((d) => d !== '');
  const countdownStr =
    countdown > 0
      ? `${padTwo(Math.floor(countdown / 60))}:${padTwo(countdown % 60)}`
      : null;

  /* ── input handlers ──────────────────────────────────────────────────── */

  const handleChange = useCallback((index, value) => {
    // Extract only the last numeric character typed
    const numeric = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = numeric;
      return next;
    });
    if (numeric && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index, e) => {
    if (e.key === 'Backspace') {
      if (digits[index] === '' && index > 0) {
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
        inputRefs.current[index - 1]?.focus();
      } else {
        setDigits((prev) => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [digits]);

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < 6; i++) {
        next[i] = pasted[i] ?? '';
      }
      return next;
    });
    const lastFilled = Math.min(pasted.length, 5);
    inputRefs.current[lastFilled]?.focus();
  }, []);

  /* ── submission ──────────────────────────────────────────────────────── */

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!codeComplete || busy) return;
    onSubmit(digits.join(''));
  };

  const handleResend = () => {
    if (busy || resendCooldown > 0) return;
    setDigits(['', '', '', '', '', '']);
    setCountdown(600);
    setResendCooldown(30);
    inputRefs.current[0]?.focus();
    onResend();
  };

  /* ── render ──────────────────────────────────────────────────────────── */

  return (
    <div className="otp-overlay" role="dialog" aria-modal="true" aria-labelledby="otp-heading">
      {/* Full-page backdrop */}
      <div className="otp-backdrop" aria-hidden="true" />

      <div className="otp-panel">
        {/* Shield badge */}
        <div className="otp-shield-badge" aria-hidden="true">
          <Shield size={28} />
          <span>VERIFICATION<br />SECURED</span>
        </div>

        {/* Header */}
        <div className="otp-header">
          <span className="otp-header-icon" aria-hidden="true"><Mail size={22} /></span>
          <h1 id="otp-heading" className="otp-heading">
            Verify <span className="otp-heading-accent">Your Email</span>
          </h1>
        </div>

        <p className="otp-subtext">
          We've sent a 6-digit verification code to{' '}
          <strong className="otp-email">{maskEmail(email)}</strong>.
          <br />
          Please enter the code below to continue.
        </p>

        {/* Feedback */}
        {info && !error && (
          <div className="otp-info" role="status">
            <Check size={14} />
            <span>{info}</span>
          </div>
        )}
        {error && (
          <div className="otp-error" role="alert" aria-live="assertive">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Six-digit input group */}
        <form onSubmit={handleSubmit} noValidate>
          <div
            className="otp-inputs"
            role="group"
            aria-label="One-time verification code"
          >
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputRefs.current[i] = el)}
                id={`otp-digit-${i}`}
                className={`otp-cell${digit ? ' otp-cell--filled' : ''}${error ? ' otp-cell--error' : ''}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${i + 1} of 6`}
                aria-invalid={!!error}
                disabled={busy}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
              />
            ))}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="otp-submit"
            disabled={!codeComplete || busy}
            aria-busy={busy}
          >
            {busy ? (
              <span className="otp-spinner" aria-hidden="true" />
            ) : null}
            <span>{busy ? 'Verifying…' : 'Verify Code'}</span>
            {!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>

        {/* Secondary row */}
        <div className="otp-secondary">
          <button
            type="button"
            className="otp-resend"
            onClick={handleResend}
            disabled={busy || resendCooldown > 0}
            aria-disabled={busy || resendCooldown > 0}
          >
            <RefreshCw size={13} aria-hidden="true" />
            <span>
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : 'Resend code'}
            </span>
          </button>

          {countdownStr && (
            <span className="otp-countdown" aria-live="off" aria-label={`Code expires in ${countdownStr}`}>
              <Clock size={13} aria-hidden="true" />
              Code expires in {countdownStr}
            </span>
          )}
        </div>

        {/* Spam hint */}
        <div className="otp-spam-hint">
          <Shield size={13} aria-hidden="true" />
          <span>Didn't receive the code?{' '}
            <span className="otp-spam-link">Check your spam folder</span>
          </span>
        </div>

        {/* Back */}
        <button type="button" className="otp-back" onClick={onBack}>
          <X size={13} aria-hidden="true" /> Back
        </button>
      </div>
    </div>
  );
}
