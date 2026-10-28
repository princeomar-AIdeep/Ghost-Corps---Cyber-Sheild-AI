import React, { useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, KeyRound, LockKeyhole, Mail, RefreshCw, Shield, User, X, AlertTriangle } from 'lucide-react';
import './auth.css';
import OtpModal from './OtpModal';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

export default function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [step, setStep] = useState('form');  // 'form' | 'otp' | 'reset'
  const [form, setForm] = useState({ email: '', password: '', displayName: '', newPassword: '' });
  const [otp, setOtp] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [preAuthToken, setPreAuthToken] = useState('');

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const switchMode = (m) => {
    setMode(m); setStep('form'); setError(''); setInfo('');
    setForm({ email: '', password: '', displayName: '', newPassword: '' });
    setOtp(''); setPreAuthToken('');
  };

  // Step 1: submit main form → if OTP needed, send it and move to otp step
  const submitForm = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');

    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) {
      setError('Enter a valid email address.'); return;
    }
    if ((mode === 'login' || mode === 'register') && form.password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    if (mode === 'register' && !/^(?=.*[A-Za-z])(?=.*\d).+$/.test(form.password)) {
      setError('Password must include at least one letter and one number.'); return;
    }

    setBusy(true);
    try {
      // For register and forgot: send OTP first
      if (mode === 'register' || mode === 'forgot') {
        const scope = mode === 'register' ? 'register' : 'reset';
        const res = await fetch(`${API}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.trim(), scope }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Could not send OTP.'); return; }
        setError('');
        setInfo(data.message || 'Check your email for the verification code.');
        setStep('otp');
        return;
      }

      // Login: try directly first (OTP optional unless REQUIRE_OTP_LOGIN=true)
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });
      const data = await res.json();

      if (res.ok) {
        onAuthSuccess(data.token, data.user);
        return;
      }

      if (data.otpRequired) {
        // Backend requires OTP for login — send OTP and step to OTP entry
        const otpRes = await fetch(`${API}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.trim(), scope: 'login' }),
        });
        const otpData = await otpRes.json();
        if (!otpRes.ok) { setError(otpData.error || 'Could not send OTP.'); return; }
        setInfo(otpData.message || 'Enter the verification code sent to your email.');
        setStep('otp');
        return;
      }

      setError(data.error || 'Login failed.');
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setBusy(false);
    }
  };

  // Step 2: verify OTP
  // codeOverride — when called from OtpModal, the code is passed directly to avoid
  // relying on the async state update (setOtp) having settled before submission.
  const submitOtp = async (e, codeOverride) => {
    e.preventDefault();
    setError('');
    const codeToVerify = (codeOverride ?? otp).trim();
    if (!codeToVerify) { setError('Enter the verification code.'); return; }
    setBusy(true);

    const scope = mode === 'register' ? 'register' : mode === 'forgot' ? 'reset' : 'login';
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), scope, otp: codeToVerify }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Incorrect code.'); return; }

      setPreAuthToken(data.preAuthToken);

      if (mode === 'register') {
        // OTP verified — now create the account
        const regRes = await fetch(`${API}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email.trim(),
            password: form.password,
            displayName: form.displayName.trim(),
            preAuthToken: data.preAuthToken,
          }),
        });
        const regData = await regRes.json();
        if (!regRes.ok) {
          setOtp('');
          setPreAuthToken('');
          setError(regData.error || 'Registration failed.');
          setStep('form');
          return;
        }
        if (regRes.status !== 201 || typeof regData.token !== 'string' || !regData.token
          || !regData.user || typeof regData.user._id !== 'string' || typeof regData.user.email !== 'string') {
          setError('Registration response was invalid. Please try again or contact support.');
          setStep('form');
          return;
        }
        onAuthSuccess(regData.token, regData.user);
      } else if (mode === 'login') {
        // OTP verified — now login with preAuthToken
        const loginRes = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.trim(), password: form.password, preAuthToken: data.preAuthToken }),
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) { setError(loginData.error || 'Login failed.'); return; }
        onAuthSuccess(loginData.token, loginData.user);
      } else if (mode === 'forgot') {
        setInfo('Code verified. Enter your new password.');
        setStep('reset');
      }
    } catch {
      setError('Cannot reach server.');
    } finally {
      setBusy(false);
    }
  };

  // Step 3 (forgot only): set new password
  const submitReset = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), newPassword: form.newPassword, preAuthToken }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Reset failed.'); return; }
      setInfo('Password reset! Please sign in.');
      switchMode('login');
    } catch {
      setError('Cannot reach server.');
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    setBusy(true); setError('');
    const scope = mode === 'register' ? 'register' : mode === 'forgot' ? 'reset' : 'login';
    try {
      const res = await fetch(`${API}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), scope }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not resend.'); return; }
      setInfo(data.message || 'New code sent.');
    } catch { setError('Cannot reach server.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/assets/cyber-shield-ai-logo.png" alt="Cyber Shield AI" />
        </div>

        {step === 'form' && mode !== 'forgot' && (
          <>
            <div className="auth-tabs" role="tablist">
              {['login', 'register'].map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'auth-tab active' : 'auth-tab'} onClick={() => switchMode(m)}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            <form className="auth-form" onSubmit={submitForm} noValidate>
              <h1 className="auth-heading">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="auth-sub">
                {mode === 'login' ? 'Sign in to your Cyber Shield AI workspace.' : 'Register for your AI-powered security workspace.'}
              </p>

              {mode === 'register' && (
                <div className="auth-field">
                  <label htmlFor="auth-name">Display name</label>
                  <div className="auth-input-wrap"><User size={16} />
                    <input id="auth-name" type="text" placeholder="Your name (optional)" value={form.displayName} onChange={update('displayName')} maxLength={100} />
                  </div>
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="auth-email">Email address</label>
                <div className="auth-input-wrap"><Mail size={16} />
                  <input id="auth-email" type="email" placeholder="you@gmail.com" autoComplete="email" value={form.email} onChange={update('email')} required maxLength={254} />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password">
                  Password {mode === 'register' && <small> — min 8 chars</small>}
                </label>
                <div className="auth-input-wrap"><LockKeyhole size={16} />
                  <input id="auth-password" type={showPw ? 'text' : 'password'} placeholder={mode === 'register' ? 'Create a strong password' : 'Your password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={update('password')} required maxLength={128} />
                  <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide' : 'Show'}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>

              {mode === 'login' && (
                <button type="button" className="auth-forgot" onClick={() => switchMode('forgot')}>Forgot password?</button>
              )}

              {error && <div className="auth-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}

              <button type="submit" className="auth-submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'register' ? <>Send Verification Code <ArrowRight size={16} /></> : <>Sign In <ArrowRight size={16} /></>}
              </button>
            </form>
          </>
        )}

        {/* Forgot password form */}
        {step === 'form' && mode === 'forgot' && (
          <form className="auth-form" onSubmit={submitForm} noValidate>
            <h1 className="auth-heading">Reset password</h1>
            <p className="auth-sub">Enter your email to receive a verification code.</p>
            <div className="auth-field">
              <label>Email address</label>
              <div className="auth-input-wrap"><Mail size={16} />
                <input type="email" placeholder="you@gmail.com" value={form.email} onChange={update('email')} required />
              </div>
            </div>
            {error && <div className="auth-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Sending…' : <>Send Code <ArrowRight size={16} /></>}</button>
            <button type="button" className="auth-back" onClick={() => switchMode('login')}><X size={14} /> Back to sign in</button>
          </form>
        )}

        {/* OTP entry step — rendered as a full-screen modal overlay */}
        {step === 'otp' && (
          <OtpModal
            email={form.email}
            busy={busy}
            error={error}
            info={info}
            onSubmit={(code) => {
              setOtp(code);
              submitOtp({ preventDefault: () => {} }, code);
            }}
            onResend={resendOtp}
            onBack={() => { setStep('form'); setError(''); setInfo(''); }}
          />
        )}

        {/* Password reset step */}
        {step === 'reset' && (
          <form className="auth-form" onSubmit={submitReset} noValidate>
            <h1 className="auth-heading">New password</h1>
            <p className="auth-sub">{info}</p>
            <div className="auth-field">
              <label>New password <small>— min 8 chars</small></label>
              <div className="auth-input-wrap"><LockKeyhole size={16} />
                <input type="password" placeholder="Create a new password" value={form.newPassword} onChange={update('newPassword')} required minLength={8} maxLength={128} autoFocus />
              </div>
            </div>
            {error && <div className="auth-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Saving…' : <>Set New Password <ArrowRight size={16} /></>}</button>
          </form>
        )}

        <div className="auth-footer">
          <Shield size={13} />
          <span>Passwords hashed with bcrypt. Codes expire in 10 minutes.</span>
        </div>
        {step === 'form' && mode !== 'forgot' && (
          <button className="auth-back" onClick={() => { window.location.href = '/'; }}><X size={14} /> Back to home</button>
        )}
      </div>
    </div>
  );
}
