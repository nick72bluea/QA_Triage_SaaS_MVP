"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const PinStyles = React.memo(() => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');

    .auth-page {
      --bg: #f4f3ef; --surface: #ffffff; --surface-alt: #fafaf7;
      --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f;
      --line: #e5e2db; --line-strong: #d4d0c7;
      --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329;
      --fail: #a6421f; --fail-soft: #f7e8e2;
      min-height: 100vh; background: var(--bg);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      color: var(--ink); font-size: 14px;
      -webkit-font-smoothing: antialiased;
      display: grid; place-items: center; padding: 32px 20px;
    }
    .pin-card {
      width: 100%; max-width: 360px; text-align: center;
    }
    .pin-greeting {
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      text-transform: uppercase; letter-spacing: 0.16em;
      color: var(--ink-mute); margin-bottom: 14px;
    }
    .pin-greeting b { color: var(--accent); font-weight: 700; }
    .pin-title {
      font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600;
      letter-spacing: -0.02em; margin: 0 0 36px;
    }
    .pin-dots {
      display: flex; gap: 12px; justify-content: center;
      margin-bottom: 36px;
    }
    .pin-dot {
      width: 14px; height: 14px; border-radius: 50%;
      background: var(--surface); border: 2px solid var(--line-strong);
      transition: all 0.15s cubic-bezier(.2,.6,.2,1);
    }
    .pin-dot.filled {
      background: var(--accent); border-color: var(--accent);
      transform: scale(1.05);
    }
    .pin-dot.error {
      background: var(--fail); border-color: var(--fail);
    }
    .pin-dots.shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97); }
    @keyframes shake {
      10%, 90% { transform: translateX(-2px); }
      20%, 80% { transform: translateX(4px); }
      30%, 50%, 70% { transform: translateX(-6px); }
      40%, 60% { transform: translateX(6px); }
    }
    .pin-error {
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--fail); text-transform: uppercase; letter-spacing: 0.1em;
      margin-bottom: 24px; min-height: 14px;
    }
    .pin-keypad {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px; margin-bottom: 20px;
    }
    .pin-key {
      height: 60px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--line);
      font-family: 'Fraunces', serif; font-size: 24px; font-weight: 500;
      color: var(--ink); cursor: pointer;
      transition: all 0.12s ease;
      display: grid; place-items: center;
      user-select: none; -webkit-tap-highlight-color: transparent;
    }
    .pin-key:hover { background: var(--surface-alt); border-color: var(--line-strong); }
    .pin-key:active {
      transform: scale(0.96); background: var(--accent-soft);
      border-color: var(--accent); color: var(--accent);
    }
    .pin-key:disabled { opacity: 0.4; cursor: not-allowed; }
    .pin-key.action {
      font-family: 'IBM Plex Sans', sans-serif; font-size: 13px;
      color: var(--ink-mute); font-weight: 500;
    }
    .pin-key.action svg { stroke: currentColor; }
    .pin-actions {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 20px;
    }
    .pin-action-link {
      background: none; border: none; padding: 8px 4px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.1em;
      cursor: pointer; transition: color 0.15s ease;
    }
    .pin-action-link:hover { color: var(--ink); }
    .pin-spinner {
      width: 14px; height: 14px;
      border: 2px solid var(--accent-soft);
      border-top-color: var(--accent);
      border-radius: 50%; display: inline-block;
      animation: spin 0.8s linear infinite;
      vertical-align: middle; margin-left: 6px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
    }}
  />
));
PinStyles.displayName = "PinStyles";

const PIN_LENGTH = 8;

export default function PinPage() {
  const router = useRouter();
  const { user, profile, verifyUserPin, fullSignOut, loading } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const verifyingRef = useRef(false);

  const firstName = profile?.displayName?.split(" ")[0] || "you";

  useEffect(() => {
    // If user is no longer authenticated, kick back to login
    if (!loading && !user) router.replace("/login");
    // If user has no PIN set, they shouldn't be here
    if (!loading && profile && !profile.hasPinSet) router.replace("/home");
  }, [loading, user, profile, router]);

  const tryVerify = async (candidate: string) => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setError("");
    try {
      const ok = await verifyUserPin(candidate);
      if (ok) {
        router.replace("/home");
      } else {
        setShake(true);
        setError("Incorrect PIN");
        setAttempts((a) => a + 1);
        setTimeout(() => {
          setShake(false);
          setPin("");
        }, 450);
      }
    } catch {
      setError("Something went wrong. Try again.");
      setPin("");
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  const handleDigit = (d: string) => {
    if (verifying) return;
    setError("");
    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + d;
      if (next.length === PIN_LENGTH) {
        // auto-submit
        setTimeout(() => tryVerify(next), 80);
      }
      return next;
    });
  };

  const handleBackspace = () => {
    if (verifying) return;
    setError("");
    setPin((prev) => prev.slice(0, -1));
  };

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (verifying) return;
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifying, pin]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="auth-page" suppressHydrationWarning>
      <PinStyles />
      <div className="pin-card">
        <div className="pin-greeting">
          Signed in as <b>{firstName}</b>
        </div>
        <h1 className="pin-title">Enter your PIN</h1>

        <div className={`pin-dots${shake ? " shake" : ""}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`pin-dot${i < pin.length ? " filled" : ""}${
                shake ? " error" : ""
              }`}
            />
          ))}
        </div>

        <div className="pin-error">
          {error && (
            <>
              {error}
              {attempts >= 3 && " · Forgot it? Sign in with email instead."}
            </>
          )}
        </div>

        <div className="pin-keypad">
          {keys.map((k) => (
            <button
              key={k}
              className="pin-key"
              onClick={() => handleDigit(k)}
              disabled={verifying}
              type="button"
            >
              {k}
            </button>
          ))}
          <button
            className="pin-key action"
            onClick={handleBackspace}
            disabled={verifying || pin.length === 0}
            type="button"
            aria-label="Delete"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
              <line x1="18" y1="9" x2="12" y2="15" />
              <line x1="12" y1="9" x2="18" y2="15" />
            </svg>
          </button>
          <button
            className="pin-key"
            onClick={() => handleDigit("0")}
            disabled={verifying}
            type="button"
          >
            0
          </button>
          <div /> {/* spacer */}
        </div>

        <div className="pin-actions">
          <button className="pin-action-link" onClick={fullSignOut}>
            ← Use a different account
          </button>
          {verifying && (
            <span className="pin-action-link">
              Verifying<span className="pin-spinner" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}