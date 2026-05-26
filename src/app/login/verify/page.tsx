"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeMagicLinkSignIn } from "@/lib/auth";

const VerifyStyles = React.memo(() => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

    .auth-page {
      --bg: #f4f3ef; --surface: #ffffff;
      --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f;
      --line: #e5e2db;
      --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329;
      --fail: #a6421f; --fail-soft: #f7e8e2;
      min-height: 100vh; background: var(--bg);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      color: var(--ink); font-size: 14px;
      -webkit-font-smoothing: antialiased;
      display: grid; place-items: center; padding: 32px 20px;
    }
    .verify-card {
      width: 100%; max-width: 420px; text-align: center;
    }
    .verify-icon {
      width: 56px; height: 56px; margin: 0 auto 24px;
      border-radius: 14px; display: grid; place-items: center;
      background: var(--accent-soft); color: var(--accent);
    }
    .verify-icon.error { background: var(--fail-soft); color: var(--fail); }
    .verify-title {
      font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600;
      letter-spacing: -0.02em; margin: 0 0 12px;
    }
    .verify-msg {
      color: var(--ink-soft); font-size: 14px; line-height: 1.55;
      margin: 0 0 24px;
    }
    .verify-spinner {
      width: 28px; height: 28px;
      border: 2.5px solid var(--accent-soft);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .verify-btn {
      display: inline-block; height: 40px; padding: 0 18px;
      background: var(--accent); color: #fff;
      border-radius: 8px; border: none;
      font-family: inherit; font-size: 13px; font-weight: 500;
      cursor: pointer; transition: background 0.15s ease;
      text-decoration: none; line-height: 40px;
    }
    .verify-btn:hover { background: var(--accent-ink); }
  `,
    }}
  />
));
VerifyStyles.displayName = "VerifyStyles";

type Status = "verifying" | "success" | "error" | "no-link";

export default function VerifyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = window.location.href;
        const user = await completeMagicLinkSignIn(url);
        if (cancelled) return;

        if (!user) {
          setStatus("no-link");
          return;
        }

        setStatus("success");
        // AuthContext will pick up the user and route appropriately.
        // Give it a beat, then redirect to /home as the post-login destination.
        setTimeout(() => {
          if (!cancelled) router.replace("/home");
        }, 800);
      } catch (err: any) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(
          err?.code === "auth/invalid-action-code"
            ? "This link has expired or already been used. Please request a new one."
            : "We couldn't verify this link. Please try signing in again."
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="auth-page" suppressHydrationWarning>
      <VerifyStyles />
      <div className="verify-card">
        {status === "verifying" && (
          <>
            <div className="verify-icon">
              <div className="verify-spinner" />
            </div>
            <h1 className="verify-title">Signing you in</h1>
            <p className="verify-msg">Verifying your sign-in link…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="verify-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </div>
            <h1 className="verify-title">Welcome aboard</h1>
            <p className="verify-msg">Redirecting you to your workspace…</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="verify-icon error">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="verify-title">Couldn&apos;t verify</h1>
            <p className="verify-msg">{errorMsg}</p>
            <button className="verify-btn" onClick={() => router.replace("/login")}>
              Back to sign in
            </button>
          </>
        )}

        {status === "no-link" && (
          <>
            <div className="verify-icon error">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="verify-title">No sign-in link</h1>
            <p className="verify-msg">
              This page completes a sign-in started from your email. Head back
              and request a new link.
            </p>
            <button className="verify-btn" onClick={() => router.replace("/login")}>
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}