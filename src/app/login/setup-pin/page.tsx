"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { hashPin, isValidPin } from "@/lib/pin";

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
      --pass: #4a7c59; --pass-soft: #e8f0eb;
      --fail: #a6421f; --fail-soft: #f7e8e2;
      min-height: 100vh; background: var(--bg);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      color: var(--ink); font-size: 14px;
      -webkit-font-smoothing: antialiased;
      display: grid; place-items: center; padding: 32px 20px;
    }
    .pin-card { width: 100%; max-width: 380px; text-align: center; }
    .pin-eyebrow {
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      text-transform: uppercase; letter-spacing: 0.16em;
      color: var(--ink-mute); margin-bottom: 14px;
    }
    .pin-title {
      font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600;
      letter-spacing: -0.02em; margin: 0 0 10px;
    }
    .pin-title em { font-style: italic; font-weight: 500; color: var(--accent); }
    .pin-sub {
      color: var(--ink-soft); font-size: 13px; line-height: 1.55;
      margin: 0 0 32px; max-width: 320px; margin-left: auto; margin-right: auto;
    }
    .pin-dots {
      display: flex; gap: 12px; justify-content: center;
      margin-bottom: 28px;
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
    .pin-dot.error { background: var(--fail); border-color: var(--fail); }
    .pin-dots.shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97); }
    @keyframes shake {
      10%, 90% { transform: translateX(-2px); }
      20%, 80% { transform: translateX(4px); }
      30%, 50%, 70% { transform: translateX(-6px); }
      40%, 60% { transform: translateX(6px); }
    }
    .pin-status {
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.1em;
      margin-bottom: 24px; min-height: 14px;
    }
    .pin-status.error { color: var(--fail); }
    .pin-status.success { color: var(--pass); }
    .pin-status.info { color: var(--ink-mute); }
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
    .pin-action-link.skip { color: var(--ink-soft); }
    .pin-action-link.skip:hover { color: var(--ink); }
    .pin-spinner {
      width: 14px; height: 14px;
      border: 2px solid var(--accent-soft);
      border-top-color: var(--accent);
      border-radius: 50%; display: inline-block;
      animation: spin 0.8s linear infinite;
      vertical-align: middle; margin-left: 6px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .pin-step-indicator {
      display: flex; gap: 6px; justify-content: center; margin-bottom: 20px;
    }
    .pin-step-dot {
      width: 24px; height: 3px; border-radius: 2px;
      background: var(--line-strong); transition: all 0.2s ease;
    }
    .pin-step-dot.active { background: var(--accent); }
  `,
    }}
  />
));
PinStyles.displayName = "PinStyles";

const PIN_LENGTH = 8;
type Step = "create" | "confirm" | "saving" | "done";

export default function SetupPinPage() {
  const router = useRouter();
  const { user, profile, refreshProfile, loading } = useAuth();

  const [step, setStep] = useState<Step>("create");
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && profile?.hasPinSet) router.replace("/home");
  }, [loading, user, profile, router]);

  const skip = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pinSetupDismissed", "1");
    }
    router.replace("/home");
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin("");
    }, 450);
  };

  const handleDigit = (d: string) => {
    if (step === "saving" || step === "done") return;
    setError("");
    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + d;
      if (next.length === PIN_LENGTH) {
        setTimeout(() => handleComplete(next), 100);
      }
      return next;
    });
  };

  const handleBackspace = () => {
    if (step === "saving") return;
    setError("");
    setPin((prev) => prev.slice(0, -1));
  };

  const handleComplete = async (candidate: string) => {
    if (!isValidPin(candidate)) {
      setError("Must be 8 digits");
      triggerShake();
      return;
    }

    if (step === "create") {
      // Avoid trivially weak PINs
      if (/^(\d)\1+$/.test(candidate)) {
        setError("Try a less predictable PIN");
        triggerShake();
        return;
      }
      setFirstPin(candidate);
      setPin("");
      setStep("confirm");
      return;
    }

    if (step === "confirm") {
      if (candidate !== firstPin) {
        setError("PINs don't match — try again");
        setFirstPin("");
        setStep("create");
        triggerShake();
        return;
      }

      // Save
      setStep("saving");
      try {
        if (!user) throw new Error("not authenticated");
        const hash = await hashPin(candidate);
        await setDoc(
          doc(db, "users", user.uid),
          { pinHash: hash, hasPinSet: true },
          { merge: true }
        );
        await refreshProfile();
        setStep("done");
        setTimeout(() => router.replace("/home"), 700);
      } catch (err) {
        console.error("PIN save failed:", err);
        setError("Couldn't save your PIN. Please try again.");
        setStep("create");
        setFirstPin("");
        setPin("");
      }
    }
  };

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step === "saving" || step === "done") return;
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Backspace") handleBackspace();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pin, firstPin]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  const titleByStep = {
    create: (
      <>
        Set a quick <em>PIN</em>
      </>
    ),
    confirm: (
      <>
        Confirm your <em>PIN</em>
      </>
    ),
    saving: <>Saving…</>,
    done: <>All set</>,
  };

  const subByStep = {
    create:
      "Choose 8 digits you'll use to unlock the app on this device. It's stored securely and never sent in plain text.",
    confirm: "Type those same 8 digits one more time to confirm.",
    saving: "",
    done: "Redirecting you to your workspace…",
  };

  return (
    <div className="auth-page" suppressHydrationWarning>
      <PinStyles />
      <div className="pin-card">
        <div className="pin-eyebrow">Account setup</div>
        <h1 className="pin-title">{titleByStep[step]}</h1>
        {subByStep[step] && <p className="pin-sub">{subByStep[step]}</p>}

        <div className="pin-step-indicator">
          <div
            className={`pin-step-dot${
              step === "create" || step === "confirm" || step === "saving" || step === "done"
                ? " active"
                : ""
            }`}
          />
          <div
            className={`pin-step-dot${
              step === "confirm" || step === "saving" || step === "done"
                ? " active"
                : ""
            }`}
          />
          <div className={`pin-step-dot${step === "done" ? " active" : ""}`} />
        </div>

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

        <div
          className={`pin-status${
            error ? " error" : step === "done" ? " success" : " info"
          }`}
        >
          {error ||
            (step === "saving" ? (
              <>
                Saving<span className="pin-spinner" />
              </>
            ) : step === "done" ? (
              "PIN saved ✓"
            ) : step === "confirm" ? (
              "Re-enter to confirm"
            ) : (
              "Choose 8 digits"
            ))}
        </div>

        <div className="pin-keypad">
          {keys.map((k) => (
            <button
              key={k}
              className="pin-key"
              onClick={() => handleDigit(k)}
              disabled={step === "saving" || step === "done"}
              type="button"
            >
              {k}
            </button>
          ))}
          <button
            className="pin-key action"
            onClick={handleBackspace}
            disabled={step === "saving" || step === "done" || pin.length === 0}
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
            disabled={step === "saving" || step === "done"}
            type="button"
          >
            0
          </button>
          <div />
        </div>

        <div className="pin-actions">
          <button className="pin-action-link skip" onClick={skip}>
            Skip for now
          </button>
          {step === "confirm" && (
            <button
              className="pin-action-link"
              onClick={() => {
                setFirstPin("");
                setPin("");
                setError("");
                setStep("create");
              }}
            >
              ← Start over
            </button>
          )}
        </div>
      </div>
    </div>
  );
}