"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  sendMagicLink,
  signInWithGoogle,
  signInWithMicrosoft,
} from "@/lib/auth";

interface LastUserHint {
  displayName: string;
  email: string;
  hasPinSet: boolean;
}

function readLastUserHint(): LastUserHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("proofdeck_last_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const LoginStyles = React.memo(() => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

    .auth-page {
      --bg: #f4f3ef; --surface: #ffffff; --surface-alt: #fafaf7;
      --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f;
      --line: #e5e2db; --line-strong: #d4d0c7;
      --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329;
      --pass: #4a7c59; --fail: #a6421f; --fail-soft: #f7e8e2;
      min-height: 100vh; background: var(--bg);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      color: var(--ink); font-size: 14px;
      -webkit-font-smoothing: antialiased;
      display: grid; place-items: center; padding: 32px 20px;
      position: relative; overflow: hidden;
    }
    .auth-page::before {
      content: ''; position: absolute; inset: 0;
      background-image:
        radial-gradient(circle at 15% 20%, rgba(45,74,62,0.04) 0%, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(166,66,31,0.03) 0%, transparent 40%);
      pointer-events: none;
    }
    .auth-card {
      width: 100%; max-width: 420px; position: relative; z-index: 1;
    }
    .auth-mark {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 40px; justify-content: center;
    }
    .auth-mark-logo {
      width: 32px; height: 32px; background: var(--accent);
      border-radius: 7px; display: grid; place-items: center; color: #fff;
    }
    .auth-mark-name {
      font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600;
      letter-spacing: -0.01em;
    }
    .auth-eyebrow {
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      text-transform: uppercase; letter-spacing: 0.16em;
      color: var(--ink-mute); margin-bottom: 12px; font-weight: 500;
    }
    .auth-title {
      font-family: 'Fraunces', serif; font-size: 34px; font-weight: 600;
      letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 12px;
    }
    .auth-title em {
      font-style: italic; font-weight: 500; color: var(--accent);
    }
    .auth-sub {
      color: var(--ink-soft); font-size: 14px; line-height: 1.55;
      margin: 0 0 32px; max-width: 340px;
    }
    .auth-form { display: flex; flex-direction: column; gap: 10px; }
    .auth-label {
      font-size: 12px; font-weight: 500; color: var(--ink-soft);
      margin-bottom: 6px; display: block;
    }
    .auth-input {
      width: 100%; height: 44px; padding: 0 14px;
      font-family: inherit; font-size: 14px; color: var(--ink);
      background: var(--surface); border: 1px solid var(--line-strong);
      border-radius: 8px; transition: all 0.15s ease;
    }
    .auth-input::placeholder { color: var(--ink-mute); }
    .auth-input:hover { border-color: #b8b3a8; }
    .auth-input:focus {
      outline: none; border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(45,74,62,0.12);
    }
    .auth-btn {
      width: 100%; height: 44px; padding: 0 16px;
      font-family: inherit; font-size: 14px; font-weight: 500;
      border-radius: 8px; cursor: pointer; transition: all 0.15s ease;
      border: 1px solid transparent;
      display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    }
    .auth-btn-primary { background: var(--accent); color: #fff; }
    .auth-btn-primary:hover:not(:disabled) { background: var(--accent-ink); }
    .auth-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .auth-btn-social {
      background: var(--surface); border-color: var(--line-strong); color: var(--ink);
    }
    .auth-btn-social:hover:not(:disabled) {
      background: var(--surface-alt); border-color: #b8b3a8;
    }
    .auth-btn-social:disabled { opacity: 0.6; cursor: not-allowed; }
    .auth-divider {
      display: flex; align-items: center; gap: 14px;
      margin: 18px 0; color: var(--ink-mute);
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      text-transform: uppercase; letter-spacing: 0.14em;
    }
    .auth-divider::before, .auth-divider::after {
      content: ''; flex: 1; height: 1px; background: var(--line);
    }
    .auth-error {
      padding: 12px 14px; background: var(--fail-soft);
      border: 1px solid rgba(166,66,31,0.2); border-radius: 8px;
      color: var(--fail); font-size: 13px; line-height: 1.45;
    }
    .auth-success {
      padding: 18px; background: var(--accent-soft);
      border: 1px solid rgba(45,74,62,0.2); border-radius: 10px;
      text-align: center;
    }
    .auth-success-icon {
      width: 44px; height: 44px; margin: 0 auto 12px;
      background: var(--accent); color: #fff; border-radius: 50%;
      display: grid; place-items: center;
    }
    .auth-success-title {
      font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600;
      margin: 0 0 6px; color: var(--ink);
    }
    .auth-success-msg {
      font-size: 13px; color: var(--ink-soft); line-height: 1.55; margin: 0;
    }
    .auth-success-msg b { color: var(--ink); font-weight: 600; }
    .auth-foot {
      margin-top: 32px; text-align: center;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--ink-mute); letter-spacing: 0.04em;
    }
    .auth-foot a { color: var(--accent); text-decoration: none; }
    .auth-foot a:hover { text-decoration: underline; }
    .auth-returning {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; margin-bottom: 24px;
      background: var(--accent-soft); border: 1px solid rgba(45,74,62,0.2);
      border-radius: 10px; cursor: default;
    }
    .auth-returning-avatar {
      width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      background: var(--accent); color: #fff;
      display: grid; place-items: center;
      font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600;
    }
    .auth-returning-text { flex: 1; min-width: 0; }
    .auth-returning-name { font-size: 13px; font-weight: 600; color: var(--ink); }
    .auth-returning-hint { font-size: 12px; color: var(--ink-soft); margin-top: 2px; display: flex; align-items: center; gap: 5px; }
    .auth-returning-pin-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.08em;
      padding: 2px 6px; border-radius: 4px;
      background: var(--accent); color: #fff;
    }
    .auth-returning-clear {
      background: none; border: none; padding: 4px 6px; cursor: pointer;
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em;
      flex-shrink: 0; transition: color 0.15s;
    }
    .auth-returning-clear:hover { color: var(--ink); }
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .auth-card > * { animation: fade-in 0.5s cubic-bezier(.2,.6,.2,1) backwards; }
    .auth-card > *:nth-child(1) { animation-delay: 0.05s; }
    .auth-card > *:nth-child(2) { animation-delay: 0.12s; }
    .auth-card > *:nth-child(3) { animation-delay: 0.18s; }
    .auth-card > *:nth-child(4) { animation-delay: 0.24s; }
    .auth-card > *:nth-child(5) { animation-delay: 0.30s; }
    .auth-card > *:nth-child(6) { animation-delay: 0.36s; }
  `,
    }}
  />
));
LoginStyles.displayName = "LoginStyles";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "microsoft" | null>(null);
  const [lastUser, setLastUser] = useState<LastUserHint | null>(null);

  useEffect(() => {
    const hint = readLastUserHint();
    if (hint?.hasPinSet) {
      setLastUser(hint);
      setEmail(hint.email);
    }
  }, []);

  const clearHint = () => {
    setLastUser(null);
    setEmail("");
    try { localStorage.removeItem("proofdeck_last_user"); } catch {}
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || sending) return;
    setError("");
    setSending(true);
    try {
      await sendMagicLink(email.trim().toLowerCase());
      setSent(true);
    } catch (err: any) {
      setError(
        err?.code === "auth/invalid-email"
          ? "That doesn't look like a valid email address."
          : "Couldn't send the link. Check the address and try again."
      );
    } finally {
      setSending(false);
    }
  };

  const handleGoogle = async () => {
    if (oauthLoading) return;
    setError("");
    setOauthLoading("google");
    try {
      await signInWithGoogle();
      router.replace("/home");
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user") {
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setOauthLoading(null);
    }
  };

  const handleMicrosoft = async () => {
    if (oauthLoading) return;
    setError("");
    setOauthLoading("microsoft");
    try {
      await signInWithMicrosoft();
      router.replace("/home");
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user") {
        setError("Microsoft sign-in failed. Please try again.");
      }
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <div className="auth-page" suppressHydrationWarning>
      <LoginStyles />
      <div className="auth-card">
        <div className="auth-mark">
          <div className="auth-mark-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <div className="auth-mark-name">Proofdeck</div>
        </div>

        <div>
          <div className="auth-eyebrow">Sign in</div>
          <h1 className="auth-title">
            Welcome <em>back</em>.
          </h1>
          <p className="auth-sub">
            Enter your email to receive a one-time sign-in link, or continue
            with a connected account.
          </p>
        </div>

        {lastUser && !sent && (
          <div className="auth-returning">
            <div className="auth-returning-avatar">
              {lastUser.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="auth-returning-text">
              <div className="auth-returning-name">{lastUser.displayName}</div>
              <div className="auth-returning-hint">
                <span className="auth-returning-pin-badge">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  PIN
                </span>
                Sign in and you'll be prompted for your PIN
              </div>
            </div>
            <button className="auth-returning-clear" onClick={clearHint} type="button">
              Not you?
            </button>
          </div>
        )}

        {sent ? (
          <div className="auth-success">
            <div className="auth-success-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h3 className="auth-success-title">Check your email</h3>
            <p className="auth-success-msg">
              We sent a sign-in link to <b>{email}</b>. Click it from any device
              to continue.
            </p>
          </div>
        ) : (
          <>
            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleMagicLink}>
              <div>
                <label className="auth-label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="auth-btn auth-btn-primary"
                disabled={sending || !email}
              >
                {sending ? (
                  "Sending link…"
                ) : (
                  <>
                    Send sign-in link
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12,5 19,12 12,19" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="auth-divider">or continue with</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="auth-btn auth-btn-social"
                onClick={handleGoogle}
                disabled={!!oauthLoading}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {oauthLoading === "google" ? "Connecting…" : "Continue with Google"}
              </button>

              <button
                className="auth-btn auth-btn-social"
                onClick={handleMicrosoft}
                disabled={!!oauthLoading}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#F25022" d="M1 1h10v10H1z" />
                  <path fill="#7FBA00" d="M13 1h10v10H13z" />
                  <path fill="#00A4EF" d="M1 13h10v10H1z" />
                  <path fill="#FFB900" d="M13 13h10v10H13z" />
                </svg>
                {oauthLoading === "microsoft"
                  ? "Connecting…"
                  : "Continue with Microsoft"}
              </button>
            </div>
          </>
        )}

        <div className="auth-foot">
          By signing in you agree to our terms · Testers don&apos;t need an account
        </div>
      </div>
    </div>
  );
}