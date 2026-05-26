"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ScriptPath, WizardScriptStep, SavedScriptSummary } from '@/types';

// Import our new path-aware orchestrators
import { Step2Script } from './_components/Step2Script';
import { Step3Script } from './_components/Step3Script';

// MOCK DATA for v1 (to be replaced by Firestore query in Scripts Library handoff)
const MOCK_SAVED_SCRIPTS: SavedScriptSummary[] = [
  { id: 's1', name: 'Onboarding v3', stepCount: 23, estimatedMinutes: 22, tags: ['UAT', 'Onboarding'] },
  { id: 's2', name: 'Checkout regression suite', stepCount: 42, estimatedMinutes: 40, tags: ['Regression'] },
  { id: 's3', name: 'Mobile signup smoke test', stepCount: 8, estimatedMinutes: 6, tags: ['Smoke'] },
  { id: 's4', name: 'Search ranking edge cases', stepCount: 18, estimatedMinutes: 15, tags: ['UAT'] },
];

const MOCK_SCRIPT_STEPS: Record<string, WizardScriptStep[]> = {
  's1': [
    { id: crypto.randomUUID(), action: 'Open the app for the first time after install', expectedResult: 'Welcome screen appears with sign-in options visible within 2s', priority: 'High', area: 'Onboarding' },
    { id: crypto.randomUUID(), action: 'Tap "Continue with Google"', expectedResult: 'Google account picker appears within 2s', priority: 'High', area: 'Auth' },
    { id: crypto.randomUUID(), action: 'Complete the email verification step', expectedResult: 'User is redirected to the welcome dashboard', priority: 'Medium', area: 'Auth' },
  ],
  // Fallback for others
  'default': [
    { id: crypto.randomUUID(), action: 'Generic test step 1', expectedResult: 'Works as expected', priority: 'Medium', area: 'Core' }
  ]
};

const GlobalWizardStyles = React.memo(() => (
  <style dangerouslySetInnerHTML={{__html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
    
    :root {
      --bg: #f4f3ef; --surface: #ffffff; --surface-alt: #fafaf7;
      --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f;
      --line: #e5e2db; --line-strong: #d4d0c7;
      --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329;
      --rail: #121a17; --rail-ink: #e5e2db; --rail-mute: #7a7a72;
      --pass: #4a7c59; --fail: #a6421f; --warn: #b8860b; --info: #3d5a80;
      --radius: 6px;
    }
    * { box-sizing: border-box; }
    .wizard-v6 { margin: 0; min-height: 100vh; background: var(--bg); font-family: 'IBM Plex Sans', system-ui, sans-serif; color: var(--ink); font-size: 14px; overflow: hidden; }
    .backdrop { position: fixed; inset: 0; background: var(--bg); background-image: radial-gradient(circle at 20% 10%, rgba(45,74,62,0.04) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(166,66,31,0.03) 0, transparent 40%); }
    .backdrop::before { content: ''; position: absolute; inset: 0; background: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); background-size: 40px 40px; opacity: 0.3; }
    .dim { position: fixed; inset: 0; background: rgba(18, 26, 23, 0.35); backdrop-filter: blur(2px); }
    
    .modal-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 10; }
    .modal { width: 720px; max-width: 100%; height: calc(100vh - 48px); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.04); display: grid; grid-template-columns: 200px 1fr; overflow: hidden; transition: width 0.4s cubic-bezier(.4,.0,.2,1); }
    .modal.expanded { width: 1180px; }

    /* RAIL */
    .rail { background: var(--rail); color: var(--rail-ink); padding: 24px 18px; display: flex; flex-direction: column; gap: 20px; position: relative; overflow: hidden; }
    .rail::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 20% 100%, rgba(74,124,89,0.15) 0, transparent 60%); pointer-events: none; }
    .rail-brand { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; position: relative; z-index: 1; }
    .rail-brand .eyebrow { display: block; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--rail-mute); margin-bottom: 4px; font-weight: 500; }
    .rail-progress { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--rail-mute); text-transform: uppercase; letter-spacing: 0.12em; display: flex; justify-content: space-between; position: relative; z-index: 1; }
    .rail-progress .time { color: var(--rail-ink); }
    .rail-bar { height: 2px; background: rgba(255,255,255,0.08); border-radius: 1px; overflow: hidden; position: relative; z-index: 1; margin-top: 6px; }
    .rail-bar-fill { height: 100%; background: linear-gradient(90deg, var(--pass), #7ab28a); transition: width 0.4s cubic-bezier(.4,.0,.2,1); }
    .rail-steps { display: flex; flex-direction: column; gap: 2px; position: relative; z-index: 1; }
    .rail-step { display: flex; align-items: flex-start; gap: 10px; padding: 10px 8px; border-radius: 6px; cursor: pointer; transition: background 0.15s ease; }
    .rail-step:hover { background: rgba(255,255,255,0.04); }
    .rail-step.locked { cursor: not-allowed; opacity: 0.5; }
    .rail-step.locked:hover { background: transparent; }
    .step-dot { width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,0.08); color: var(--rail-mute); display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; flex-shrink: 0; margin-top: 1px; transition: all 0.2s ease; }
    .rail-step.active .step-dot { background: var(--pass); color: #fff; box-shadow: 0 0 0 3px rgba(74,124,89,0.25); }
    .rail-step.done .step-dot { background: transparent; color: var(--pass); border: 1px solid var(--pass); }
    .step-text { min-width: 0; flex: 1; }
    .step-name { font-size: 12px; font-weight: 500; color: var(--rail-ink); }
    .rail-step.locked .step-name { color: var(--rail-mute); }
    .step-value { font-size: 11px; color: var(--rail-mute); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'JetBrains Mono', monospace; }
    .rail-step.done .step-value { color: #9fb5a7; }
    .rail-foot { margin-top: auto; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); position: relative; z-index: 1; }
    .rail-tip { font-size: 11px; color: var(--rail-mute); line-height: 1.5; }
    .rail-tip kbd { display: inline-block; padding: 1px 5px; background: rgba(255,255,255,0.1); border-radius: 3px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--rail-ink); }

    /* CONTENT */
    .content { display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
    .content-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 28px 14px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
    .content-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
    .content-title .eyebrow { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 4px; }
    .content-sub { color: var(--ink-mute); font-size: 13px; margin: 4px 0 0; }
    .close-btn { width: 32px; height: 32px; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); transition: all 0.15s ease; }
    .close-btn:hover { background: var(--bg); color: var(--ink); }
    .content-body { flex: 1; padding: 24px 28px; overflow-y: auto; position: relative; }
    .step-panel { display: none; animation: slideIn 0.3s cubic-bezier(.4,.0,.2,1); }
    .step-panel.active { display: block; }
    @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    /* FIELDS & STEP 1 */
    .field { margin-bottom: 18px; }
    .field-label { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 500; color: var(--ink-soft); margin-bottom: 6px; }
    .field-label .optional { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; }
    .field-label .check-valid { color: var(--pass); opacity: 0; transition: opacity 0.2s ease; }
    .field-label .check-valid.show { opacity: 1; }
    .input { width: 100%; height: 40px; padding: 0 14px; font-family: inherit; font-size: 14px; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 6px; transition: all 0.15s ease; }
    .input::placeholder { color: var(--ink-mute); }
    .input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.12); }
    .hint-chip { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); padding: 4px 8px; background: var(--surface-alt); border: 1px dashed var(--line-strong); border-radius: 4px; cursor: pointer; margin-top: 6px; transition: all 0.15s ease; }
    .hint-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .step1-grid { display: grid; grid-template-columns: 1fr 280px; gap: 28px; align-items: flex-start; }
    .preview-card { background: linear-gradient(135deg, #fafaf7 0%, #f0ede4 100%); border: 1px solid var(--line-strong); border-radius: 8px; padding: 18px; position: relative; overflow: hidden; }
    .preview-card::before { content: ''; position: absolute; top: 0; right: 0; width: 80px; height: 80px; background: radial-gradient(circle, rgba(45,74,62,0.08) 0, transparent 70%); border-radius: 50%; }
    .preview-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 8px; }
    .preview-name { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 10px; min-height: 26px; color: var(--ink); word-break: break-word; }
    .preview-name.empty { color: var(--ink-mute); font-style: italic; font-weight: 500; }
    .preview-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; min-height: 20px; }
    .preview-tag { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 8px; border-radius: 4px; background: rgba(61,90,128,0.1); color: var(--info); }
    .preview-tag.cycle { background: rgba(106,74,124,0.1); color: #6a4a7c; }
    .preview-meta { font-size: 11px; color: var(--ink-mute); line-height: 1.5; font-family: 'JetBrains Mono', monospace; }
    .preview-meta .line { margin-bottom: 3px; }

    /* ALL NEW STEP 2 / STEP 3 STYLES */
    .path-picker-intro { margin-bottom: 22px; }
    .path-picker-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--accent); font-weight: 600; margin-bottom: 10px; display: inline-flex; align-items: center; gap: 12px; }
    .path-picker-eyebrow::before { content: ''; width: 24px; height: 1px; background: var(--accent); }
    .path-picker-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.15; margin: 0 0 4px; }
    .path-picker-sub { font-size: 13px; color: var(--ink-soft); margin: 0; max-width: 520px; }
    .path-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .path-card { background: var(--surface); border: 1.5px solid var(--line); border-radius: 10px; padding: 18px 18px 16px; cursor: pointer; transition: all 0.18s cubic-bezier(.2,.6,.2,1); position: relative; overflow: hidden; display: flex; flex-direction: column; min-height: 220px; }
    .path-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 12px 28px rgba(45,74,62,0.1); }
    .path-card.recommended { border-color: rgba(45,74,62,0.45); background: linear-gradient(180deg, var(--surface) 0%, var(--accent-soft) 240%); }
    .path-card.selected { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .path-tag { position: absolute; top: 12px; right: 12px; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; background: var(--accent); color: #fff; padding: 3px 8px; border-radius: 999px; font-weight: 600; }
    .path-icon { width: 36px; height: 36px; background: var(--accent-soft); color: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
    .path-card.recommended .path-icon, .path-card.selected .path-icon { background: var(--accent); color: #fff; }
    .path-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 6px; line-height: 1.2; }
    .path-sub { font-size: 12.5px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 14px; flex: 1; }
    .path-mini-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .path-mini-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: var(--surface-alt); border-radius: 5px; font-size: 11.5px; color: var(--ink-soft); }
    .path-card.recommended .path-mini-item { background: rgba(255,255,255,0.7); }
    .path-mini-num { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: var(--ink-mute); font-weight: 600; flex-shrink: 0; }
    .path-mini-name { flex: 1; color: var(--ink); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .path-meta { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); font-weight: 600; display: flex; align-items: center; gap: 6px; padding-top: 12px; border-top: 1px solid var(--line); }
    .path-arrow { margin-left: auto; color: var(--accent); transition: transform 0.18s; }
    .path-card:hover .path-arrow { transform: translateX(3px); }

    .path-substate { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 18px 22px; }
    .path-substate-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
    .path-substate-title { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin: 0; display: flex; align-items: center; gap: 10px; }
    .path-substate-title-icon { width: 28px; height: 28px; background: var(--accent-soft); color: var(--accent); border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .path-substate-back { padding: 5px 10px; background: transparent; border: 1px solid var(--line); border-radius: 6px; color: var(--ink-soft); font-family: inherit; font-size: 11.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
    .path-substate-back:hover { background: var(--surface-alt); color: var(--ink); }

    .saved-picker-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
    .saved-card { background: var(--surface-alt); border: 1.5px solid var(--line); border-radius: 8px; padding: 12px 14px; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: flex-start; transition: all 0.15s; }
    .saved-card:hover { border-color: var(--accent); background: var(--surface); }
    .saved-card.selected { background: var(--accent-soft); border-color: var(--accent); }
    .saved-card-name { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 4px; }
    .saved-card-meta { display: flex; gap: 10px; font-size: 11px; color: var(--ink-mute); margin-bottom: 6px; }
    .saved-card-meta .stat { display: inline-flex; align-items: center; gap: 4px; }
    .saved-card-meta .stat svg { width: 10px; height: 10px; opacity: 0.6; }
    .saved-card-tags { display: flex; gap: 4px; flex-wrap: wrap; }
    .saved-card-tag { display: inline-flex; align-items: center; font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 2px 6px; background: rgba(255,255,255,0.6); border: 1px solid var(--line); border-radius: 3px; color: var(--ink-soft); font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; }
    .saved-card-radio { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--line-strong); flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--surface); }
    .saved-card.selected .saved-card-radio { background: var(--accent); border-color: var(--accent); color: #fff; }

    .dropzone { position: relative; border: 2px dashed var(--line-strong); border-radius: 10px; padding: 44px 24px; text-align: center; background: var(--surface-alt); transition: all 0.2s ease; overflow: hidden; }
    .dropzone.dragover { border-color: var(--accent); background: var(--accent-soft); }
    .dropzone.uploaded { border-style: solid; border-color: var(--pass); background: var(--surface); padding: 20px 24px; text-align: left; }
    .dz-icon { width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--accent); position: relative; }
    .dz-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .dz-sub { color: var(--ink-mute); font-size: 13px; margin-bottom: 14px; }
    .dz-hint { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 10px; }
    .file-info { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
    .file-icon { width: 40px; height: 40px; background: var(--accent-soft); color: var(--accent); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; flex-shrink: 0; }
    .file-name { font-weight: 500; color: var(--ink); margin-bottom: 2px; }
    .file-stat { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-mute); }
    .file-replace { margin-left: auto; font-size: 12px; color: var(--ink-mute); text-decoration: underline; cursor: pointer; }

    .manual-builder { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .manual-step { background: var(--surface-alt); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: flex-start; }
    .manual-step-num { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: var(--ink-mute); font-weight: 600; background: var(--surface); border: 1px solid var(--line); padding: 4px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 1px; }
    .manual-step-body { min-width: 0; }
    .manual-step-action { width: 100%; border: none; background: transparent; font-family: inherit; font-size: 13.5px; font-weight: 500; color: var(--ink); padding: 0; margin-bottom: 4px; }
    .manual-step-action:focus { outline: none; }
    .manual-step-expected { width: 100%; border: none; background: transparent; font-family: inherit; font-size: 12px; color: var(--ink-soft); padding: 0; resize: none; line-height: 1.5; }
    .manual-step-expected:focus { outline: none; }
    .manual-step-remove { width: 24px; height: 24px; background: transparent; border: none; border-radius: 5px; color: var(--ink-mute); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: -2px; }
    .manual-step-remove:hover { background: rgba(166,66,31,0.08); color: var(--fail); }
    .manual-add-step { width: 100%; height: 44px; border: 1.5px dashed var(--line-strong); background: transparent; color: var(--ink-mute); border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 12.5px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .manual-add-step:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .manual-bulk-paste { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; background: var(--accent-soft); color: var(--accent); border: 1px solid rgba(45,74,62,0.25); border-radius: 5px; font-family: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer; }
    .manual-bulk-paste:hover { background: var(--accent); color: #fff; }

    /* STEP 3 VARIANTS */
    .review-head { display: flex; justify-content: space-between; align-items: flex-start; background: var(--accent-soft); border: 1px solid rgba(45,74,62,0.2); border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; gap: 14px; }
    .review-head-left { display: flex; gap: 12px; align-items: center; min-width: 0; }
    .review-head-icon { width: 36px; height: 36px; background: var(--accent); color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .review-head-text { min-width: 0; }
    .review-head-title { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 2px; }
    .review-head-meta { font-size: 12px; color: var(--ink-soft); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .review-head-meta .stat { display: inline-flex; align-items: center; gap: 4px; }
    .review-toggle-edit { padding: 6px 12px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 6px; color: var(--ink-soft); font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
    .review-toggle-edit.editing { background: var(--accent); color: #fff; border-color: var(--accent); }
    .review-step-list { display: flex; flex-direction: column; gap: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px; max-height: 360px; overflow-y: auto; }
    .review-step { display: grid; grid-template-columns: 44px 1fr auto auto; gap: 12px; align-items: center; padding: 9px 12px; border-radius: 6px; transition: background 0.12s; }
    .review-step:hover { background: var(--surface-alt); }
    .review-step-num { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: var(--ink-mute); font-weight: 600; background: var(--surface-alt); padding: 3px 6px; border-radius: 4px; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; }
    .review-step-action { font-size: 13px; font-weight: 500; color: var(--ink); line-height: 1.4; min-width: 0; }
    .review-step-action small { display: block; font-size: 11.5px; color: var(--ink-mute); font-weight: 400; margin-top: 2px; }
    .review-step-priority { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 999px; font-weight: 600; }
    .review-step-priority.high { background: rgba(166,66,31,0.1); color: var(--fail); }
    .review-step-priority.medium { background: rgba(184,134,11,0.1); color: var(--warn); }
    .review-step-priority.low { background: rgba(61,90,128,0.1); color: var(--info); }
    .review-step-area { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-mute); background: var(--surface-alt); padding: 2px 7px; border-radius: 4px; font-weight: 600; }
    .review-foot { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--ink-mute); padding: 0 4px; }
    .review-foot strong { color: var(--ink); font-weight: 600; }
    .review-foot em { color: var(--accent); font-style: normal; font-weight: 600; }
    .review-foot-actions { display: flex; gap: 6px; }
    .review-foot-btn { padding: 5px 10px; background: transparent; border: 1px solid var(--line); border-radius: 5px; color: var(--ink-soft); font-family: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }

    .refine-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; }
    .refine-progress { background: var(--accent-soft); border: 1px solid rgba(45,74,62,0.2); border-radius: 10px; padding: 12px 16px; flex: 1; display: flex; align-items: center; gap: 12px; }
    .refine-progress-icon { width: 30px; height: 30px; background: var(--accent); color: #fff; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .refine-progress-text { font-size: 12.5px; color: var(--ink); line-height: 1.4; }
    .refine-progress-text strong { color: var(--accent-ink); font-weight: 600; }
    .refine-progress-text em { color: var(--accent); font-style: normal; font-weight: 600; }
    .refine-bulk-btn { padding: 7px 12px; background: var(--accent-soft); border: 1px solid rgba(45,74,62,0.25); border-radius: 7px; color: var(--accent); font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
    .refine-bulk-btn:hover { background: var(--accent); color: #fff; }

    /* BULK PASTE MODAL */
    .bulk-paste-modal { position: absolute; inset: 20px; z-index: 30; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.18); display: flex; flex-direction: column; overflow: hidden; }
    .bp-head { padding: 14px 18px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
    .bp-head-title { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
    .bp-head-sub { font-size: 11.5px; color: var(--ink-soft); margin-top: 1px; }
    .bp-close { width: 28px; height: 28px; border-radius: 6px; background: var(--surface-alt); border: 1px solid var(--line); color: var(--ink-mute); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .bp-body { flex: 1; display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; min-height: 0; }
    .bp-input-pane, .bp-preview-pane { display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
    .bp-input-pane { border-right: 1px solid var(--line); }
    .bp-pane-head { padding: 12px 16px 8px; border-bottom: 1px solid var(--line); }
    .bp-pane-label { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 600; }
    .bp-pane-hint { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; }
    .bp-textarea { flex: 1; border: none; background: var(--surface-alt); padding: 14px 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink); line-height: 1.6; resize: none; }
    .bp-textarea:focus { outline: none; }
    .bp-format-row { padding: 8px 16px; border-top: 1px solid var(--line); display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
    .bp-format-label { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); font-weight: 600; margin-right: 4px; }
    .bp-format-chip { padding: 3px 8px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 999px; font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: var(--ink-soft); cursor: pointer; font-weight: 600; }
    .bp-format-chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .bp-preview-list { flex: 1; overflow-y: auto; padding: 10px 16px; background: var(--bg); }
    .bp-preview-item { background: var(--surface); border: 1px solid var(--line); border-radius: 7px; padding: 8px 10px; margin-bottom: 5px; display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: flex-start; transition: opacity 0.2s; }
    .bp-preview-num { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--ink-mute); font-weight: 600; background: var(--surface-alt); padding: 2px 5px; border-radius: 3px; margin-top: 1px; }
    .bp-preview-action { font-size: 12px; font-weight: 500; color: var(--ink); line-height: 1.4; margin-bottom: 1px; }
    .bp-preview-expected { font-size: 11px; color: var(--ink-soft); line-height: 1.4; }
    .bp-preview-toggle { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--accent); display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .bp-preview-toggle.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .bp-foot { padding: 10px 16px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--surface-alt); }
    .bp-foot-summary { font-size: 11.5px; color: var(--ink-soft); }

    /* STEP 4 & 5 */
    .roster-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .add-tester-row { display: flex; gap: 8px; margin-bottom: 14px; }
    .add-tester-row .input { flex: 1; }
    .recent-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); margin-bottom: 8px; margin-top: 14px; }
    .recent-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .recent-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 999px; cursor: pointer; font-size: 12px; transition: all 0.15s ease; }
    .recent-chip:hover { border-color: var(--accent); background: var(--accent-soft); }
    .recent-chip .mini-avatar { width: 20px; height: 20px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
    .roster-panel { background: var(--surface-alt); border: 1px solid var(--line); border-radius: 8px; padding: 16px; min-height: 280px; display: flex; flex-direction: column; }
    .roster-head { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); margin-bottom: 12px; display: flex; justify-content: space-between; }
    .roster-list { display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .roster-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ink-mute); font-size: 13px; text-align: center; padding: 20px; border: 1px dashed var(--line-strong); border-radius: 6px; min-height: 180px; }
    .roster-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; animation: popIn 0.3s cubic-bezier(.4,0,.2,1); }
    .roster-avatar { width: 28px; height: 28px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; font-family: 'JetBrains Mono', monospace; }
    .roster-name { flex: 1; font-size: 13px; font-weight: 500; }
    .roster-remove { width: 24px; height: 24px; border: none; background: transparent; color: var(--ink-mute); cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .roster-remove:hover { background: var(--fail); color: #fff; }

    .launch-celebration { text-align: center; padding: 10px 20px; position: relative; overflow: visible; }
    .launch-icon-wrap { width: 80px; height: 80px; margin: 0 auto 20px; border-radius: 50%; background: var(--accent-soft); display: flex; align-items: center; justify-content: center; position: relative; animation: scaleIn 0.5s cubic-bezier(.4,0,.2,1); }
    .launch-icon-wrap::before, .launch-icon-wrap::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 1px solid var(--accent); opacity: 0; animation: ripple 1.5s ease-out infinite; }
    .launch-icon-wrap::after { animation-delay: 0.5s; }
    @keyframes ripple { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.4); opacity: 0; } }
    .launch-check { color: var(--accent); width: 36px; height: 36px; }
    .launch-title { font-family: 'Fraunces', serif; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 8px; }
    .launch-sub { color: var(--ink-mute); font-size: 14px; margin: 0 auto 24px; max-width: 380px; }
    .launch-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: left; }
    .launch-cell .lc-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); margin-bottom: 2px; }
    .launch-cell .lc-value { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; color: var(--ink); }
    .launch-actions { display: flex; gap: 10px; justify-content: center; padding-bottom: 24px; }
    @keyframes popIn { from { opacity: 0; transform: scale(0.95) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }

    /* FOOTER */
    .content-foot { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 32px; border-top: 1px solid var(--line); background: var(--surface-alt); flex-shrink: 0; }
    .foot-hint { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 8px; min-width: 0; }
    .foot-hint > span { white-space: nowrap; }
    .foot-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
    .foot-hint kbd { background: var(--surface); border: 1px solid var(--line-strong); padding: 2px 6px; border-radius: 3px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-soft); }
    .saved-indicator { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; display: inline-flex; align-items: center; gap: 5px; margin-right: 10px; }
    .saved-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--pass); }
    
    .btn { height: 40px; padding: 0 18px; font-family: inherit; font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer; transition: all 0.15s ease; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-ink); transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-ghost { background: transparent; color: var(--ink-soft); }
    .btn-ghost:hover { color: var(--ink); }
    .btn-secondary { background: var(--surface); border-color: var(--line-strong); color: var(--ink-soft); }
    .btn-secondary:hover { background: var(--surface-alt); color: var(--ink); }
  `}} />
));

// --- Step Info ---
const stepTitles: Record<number, { t: string; s: string }> = {
  1: { t: 'Project Parameters', s: 'Give your project a name and context. You can edit these later.' },
  2: { t: 'Add your Test Script', s: 'Pick how to add the script — saved library, CSV, or build it inline.' },
  4: { t: 'Assign Testers', s: 'Build your team. Skip to create an unassigned project for later.' },
  5: { t: 'All Set', s: 'Review what was just created.' }
};

const step3Titles = {
  csv: { t: 'Map Your Columns', s: 'Confirm how your CSV columns map to project fields.' },
  saved: { t: 'Review the Script', s: 'Look over the steps before you launch — edit inline if anything off.' },
  manual: { t: 'Refine your Script', s: 'Polish the steps you started, or paste in more from any source.' },
};

function getStepTitle(stepNum: number, path: ScriptPath | null) {
  if (stepNum !== 3) return stepTitles[stepNum];
  return step3Titles[path || 'csv'];
}

function getStep3Name(path: ScriptPath | null): string {
  if (path === 'csv') return 'Map Columns';
  if (path === 'saved') return 'Review';
  if (path === 'manual') return 'Refine';
  return 'Map Columns';
}

export default function CreateProjectWizard() {
  const router = useRouter();
  
  // State
  const [step, setStep] = useState(1);
  const maxStep = 5;

  const [name, setName] = useState('');
  const [env, setEnv] = useState('');
  const [cycle, setCycle] = useState('');

  // Step 2 + 3 Path State
  const [scriptPath, setScriptPath] = useState<ScriptPath | null>(null);
  const [savedScriptId, setSavedScriptId] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [manualSteps, setManualSteps] = useState<WizardScriptStep[]>([]);
  
  // Stored for step 3 review
  const [savedScriptSteps, setSavedScriptSteps] = useState<WizardScriptStep[]>([]);

  // Step 4
  const [testers, setTesters] = useState<{name: string, color: string}[]>([]);
  const [testerInput, setTesterInput] = useState('');
  const [isBulkPasteOpen, setIsBulkPasteOpen] = useState(false);

  // Derived state
  const isNameValid = name.trim().length > 0;
  
  const handlePathChange = (path: ScriptPath | null) => {
    // Optional: confirm loss of data if switching paths. Keeping it simple for v1.
    setScriptPath(path);
  };

  const handleSavedScriptSelect = (id: string) => {
    setSavedScriptId(id);
    const steps = MOCK_SCRIPT_STEPS[id] || MOCK_SCRIPT_STEPS['default'];
    setSavedScriptSteps(JSON.parse(JSON.stringify(steps))); // Deep copy for editing
  };

  const validateStep = (s: number) => {
    if (s === 1) return isNameValid;
    if (s === 2) {
      if (!scriptPath) return false;
      if (scriptPath === 'csv') return csvFile !== null;
      if (scriptPath === 'saved') return savedScriptId !== null;
      if (scriptPath === 'manual') return manualSteps.length >= 3;
    }
    if (s === 3) return true; // Assuming CSV mapping is valid or saved/manual is fine
    if (s === 4) return true; // Testers optional
    return true;
  };

  const goNext = () => {
    if (step < maxStep) {
      setStep(s => s + 1);
    } else {
      // Step 5 -> Finish
      handleLaunch();
    }
  };

  const goBack = () => {
    if (step > 1) setStep(s => s - 1);
  };

  const handleLaunch = async () => {
    try {
      // Determine final steps based on path
      let finalSteps: any[] = [];
      if (scriptPath === 'saved') {
        finalSteps = savedScriptSteps;
      } else if (scriptPath === 'manual') {
        finalSteps = manualSteps;
      } else {
        // Mock CSV parsing
        finalSteps = [{ id: crypto.randomUUID(), action: 'CSV Test', expectedResult: 'Done' }];
      }

      // Generate Run Docs per tester
      const baseRun: Omit<TestRunData, 'testerName' | 'id'> = {
        projectName: name,
        environment: env,
        testCycle: cycle,
        steps: finalSteps.map(s => ({
          id: s.id,
          action: s.action,
          expectedResult: s.expectedResult,
          priority: s.priority,
          area: s.area
        })),
        isCompleted: false,
      };

      if (testers.length > 0) {
        for (const t of testers) {
          await addDoc(collection(db, 'testRuns'), {
            ...baseRun,
            testerName: t.name,
            createdAt: serverTimestamp(),
          });
        }
      } else {
        // Unassigned run
        await addDoc(collection(db, 'testRuns'), {
          ...baseRun,
          testerName: 'Unassigned',
          createdAt: serverTimestamp(),
        });
      }

      router.push('/admin');
    } catch (e) {
      console.error('Launch failed', e);
      alert('Launch failed. Check console.');
    }
  };

  const addTester = (tName: string, color?: string) => {
    const n = tName.trim();
    if (!n) return;
    if (testers.some(t => t.name === n)) return;
    setTesters(prev => [...prev, { name: n, color: color || '#3d5a80' }]);
    setTesterInput('');
  };

  // Rail labels
  const getStep2Label = () => {
    if (!scriptPath) return 'Pick a path';
    if (scriptPath === 'csv') return csvFile ? `CSV · ${csvFile.name}` : 'Upload CSV';
    if (scriptPath === 'saved') {
      const s = MOCK_SAVED_SCRIPTS.find(x => x.id === savedScriptId);
      return s ? `${s.name} · ${s.stepCount} steps` : 'Pick saved script';
    }
    return manualSteps.length > 0 ? `Manual · ${manualSteps.length} steps` : 'Build manually';
  };

  const getStep3Label = () => {
    if (scriptPath === 'csv') return csvFile ? 'Columns mapped' : '—';
    if (scriptPath === 'saved') return 'Review & customise';
    if (scriptPath === 'manual') return manualSteps.length >= 3 ? 'Refine' : 'Need 3 steps min';
    return '—';
  };

  const currentTitle = getStepTitle(step, scriptPath);

  return (
    <div className="wizard-v6">
      <GlobalWizardStyles />
      <div className="backdrop"></div>

      <div className="modal-wrap">
        <div className={`modal ${step === 3 ? 'expanded' : ''}`}>
          
          {/* RAIL */}
          <aside className="rail">
            <div className="rail-brand">
              <span className="eyebrow">QA Triage</span>
              New Project
            </div>
            <div>
              <div className="rail-progress">
                <span>Step <span>{step}</span> / 5</span>
                <span className="time">{step === 5 ? 'Done' : `~${[45,30,25,15,0][step-1]}s left`}</span>
              </div>
              <div className="rail-bar">
                <div className="rail-bar-fill" style={{ width: `${(step / maxStep) * 100}%` }}></div>
              </div>
            </div>

            <nav className="rail-steps">
              <div className={`rail-step ${step === 1 ? 'active' : step > 1 ? 'done' : 'locked'}`} onClick={() => step > 1 && setStep(1)}>
                <div className="step-dot">{step > 1 ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : '1'}</div>
                <div className="step-text">
                  <div className="step-name">Details</div>
                  <div className="step-value">{name || '—'}</div>
                </div>
              </div>
              
              <div className={`rail-step ${step === 2 ? 'active' : step > 2 ? 'done' : 'locked'}`} onClick={() => step > 2 && setStep(2)}>
                <div className="step-dot">{step > 2 ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : '2'}</div>
                <div className="step-text">
                  <div className="step-name">Script</div>
                  <div className="step-value">{getStep2Label()}</div>
                </div>
              </div>

              <div className={`rail-step ${step === 3 ? 'active' : step > 3 ? 'done' : 'locked'}`} onClick={() => step > 3 && setStep(3)}>
                <div className="step-dot">{step > 3 ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : '3'}</div>
                <div className="step-text">
                  <div className="step-name">{getStep3Name(scriptPath)}</div>
                  <div className="step-value">{getStep3Label()}</div>
                </div>
              </div>

              <div className={`rail-step ${step === 4 ? 'active' : step > 4 ? 'done' : 'locked'}`} onClick={() => step > 4 && setStep(4)}>
                <div className="step-dot">{step > 4 ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : '4'}</div>
                <div className="step-text">
                  <div className="step-name">Assign</div>
                  <div className="step-value">{testers.length > 0 ? `${testers.length} testers` : 'Optional'}</div>
                </div>
              </div>

              <div className={`rail-step ${step === 5 ? 'active' : 'locked'}`}>
                <div className="step-dot">5</div>
                <div className="step-text">
                  <div className="step-name">Launch</div>
                  <div className="step-value">—</div>
                </div>
              </div>
            </nav>

            <div className="rail-foot">
              <div className="rail-tip">Press <kbd>Enter</kbd> to continue, <kbd>Esc</kbd> to close.</div>
            </div>
          </aside>

          {/* CONTENT */}
          <div className="content">
            <header className="content-head">
              <div>
                <h1 className="content-title">
                  <span className="eyebrow">Step {step} of 5</span>
                  {currentTitle.t}
                </h1>
                <p className="content-sub">{currentTitle.s}</p>
              </div>
              <button className="close-btn" onClick={() => router.push('/admin')} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </header>

            <main className="content-body">
              {/* STEP 1 */}
              <section className={`step-panel ${step === 1 ? 'active' : ''}`}>
                <div className="step1-grid">
                  <div>
                    <div className="field">
                      <div className="field-label">
                        <span>Project Name *</span>
                        <svg className={`check-valid ${isNameValid ? 'show' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Checkout v3 UAT" autoFocus />
                      {!isNameValid && (
                        <div className="hint-chip" onClick={() => setName('Checkout v3 UAT')}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                          <span>Suggested: <strong>Checkout v3 UAT</strong></span>
                        </div>
                      )}
                    </div>
                    <div className="field">
                      <div className="field-label"><span>Target Environment</span><span className="optional">Optional</span></div>
                      <input className="input" value={env} onChange={e => setEnv(e.target.value)} placeholder="Staging, Production, Dev..." />
                    </div>
                    <div className="field">
                      <div className="field-label"><span>Test Cycle</span><span className="optional">Optional</span></div>
                      <input className="input" value={cycle} onChange={e => setCycle(e.target.value)} placeholder="Sprint 42, Release 2.1..." />
                    </div>
                  </div>
                  <div>
                    <div className="preview-card">
                      <div className="preview-label">Live Preview</div>
                      <div className={`preview-name ${!name ? 'empty' : ''}`}>{name || 'Untitled project'}</div>
                      <div className="preview-tags">
                        {env && <span className="preview-tag">{env}</span>}
                        {cycle && <span className="preview-tag cycle">{cycle}</span>}
                      </div>
                      <div className="preview-meta">
                        <div className="line">Created · just now</div>
                        <div className="line">Owner · PM</div>
                        <div className="line">Tests · —</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* STEP 2 */}
              <section className={`step-panel ${step === 2 ? 'active' : ''}`}>
                <Step2Script 
                  scriptPath={scriptPath}
                  onPathChange={handlePathChange}
                  savedScripts={MOCK_SAVED_SCRIPTS}
                  selectedSavedScriptId={savedScriptId}
                  onSelectSavedScript={handleSavedScriptSelect}
                  csvFile={csvFile}
                  onCsvUpload={setCsvFile}
                  onCsvReset={() => setCsvFile(null)}
                  manualSteps={manualSteps}
                  onManualStepsChange={setManualSteps}
                  onOpenBulkPaste={() => setIsBulkPasteOpen(true)}
                />
              </section>

              {/* STEP 3 */}
              <section className={`step-panel ${step === 3 ? 'active' : ''}`}>
                {scriptPath && (
                  <Step3Script 
                    scriptPath={scriptPath}
                    csvFile={csvFile}
                    csvColumns={null} 
                    selectedSavedScript={MOCK_SAVED_SCRIPTS.find(s => s.id === savedScriptId) || null}
                    savedScriptSteps={savedScriptSteps}
                    onSavedScriptStepsChange={setSavedScriptSteps}
                    manualSteps={manualSteps}
                    onManualStepsChange={setManualSteps}
                  />
                )}
              </section>

              {/* STEP 4 */}
              <section className={`step-panel ${step === 4 ? 'active' : ''}`}>
                <div className="roster-grid">
                  <div>
                    <div className="field">
                      <div className="field-label"><span>Add Tester</span><span className="optional">Press Enter to add</span></div>
                      <div className="add-tester-row">
                        <input className="input" value={testerInput} onChange={e => setTesterInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTester(testerInput)} placeholder="Name or email..." />
                        <button className="btn btn-primary" onClick={() => addTester(testerInput)}>Add</button>
                      </div>
                    </div>
                    <div className="recent-testers">
                      <div className="recent-label">Recently on your team</div>
                      <div className="recent-chips">
                        <span className="recent-chip" onClick={() => addTester('Nick', '#3d5a80')}><span className="mini-avatar" style={{background:'#3d5a80'}}>N</span> Nick +</span>
                        <span className="recent-chip" onClick={() => addTester('Kate', '#a6421f')}><span className="mini-avatar" style={{background:'#a6421f'}}>K</span> Kate +</span>
                        <span className="recent-chip" onClick={() => addTester('Sarah', '#6a4a7c')}><span className="mini-avatar" style={{background:'#6a4a7c'}}>S</span> Sarah +</span>
                        <span className="recent-chip" onClick={() => addTester('Marcus', '#b8860b')}><span className="mini-avatar" style={{background:'#b8860b'}}>M</span> Marcus +</span>
                      </div>
                    </div>
                  </div>
                  <div className="roster-panel">
                    <div className="roster-head"><span>Team Roster</span><span>{testers.length} added</span></div>
                    <div className="roster-list">
                      {testers.length === 0 ? (
                        <div className="roster-empty">No testers yet — you can also skip this and assign later from the project page.</div>
                      ) : (
                        testers.map(t => (
                          <div key={t.name} className="roster-item">
                            <div className="roster-avatar" style={{background: t.color}}>{t.name[0]}</div>
                            <div className="roster-name">{t.name}</div>
                            <button className="roster-remove" onClick={() => setTesters(testers.filter(x => x.name !== t.name))}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* STEP 5 */}
              <section className={`step-panel ${step === 5 ? 'active' : ''}`}>
                <div className="launch-celebration">
                  <div className="launch-icon-wrap">
                    <svg className="launch-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h2 className="launch-title">Project Launched</h2>
                  <p className="launch-sub">Your cycle is ready. Testers will see it in their dashboard shortly.</p>
                  <div className="launch-summary">
                    <div className="launch-cell"><div className="lc-label">Project</div><div className="lc-value">{name}</div></div>
                    <div className="launch-cell"><div className="lc-label">Tests</div><div className="lc-value">{scriptPath === 'manual' ? manualSteps.length : scriptPath === 'saved' ? savedScriptSteps.length : '—'}</div></div>
                    <div className="launch-cell"><div className="lc-label">Testers</div><div className="lc-value">{testers.length}</div></div>
                    <div className="launch-cell"><div className="lc-label">Status</div><div className="lc-value" style={{color: 'var(--pass)'}}>Ready</div></div>
                  </div>
                </div>
              </section>
            </main>

            {step < 5 && (
              <footer className="content-foot">
                <div className="foot-hint">
                  <span className="saved-indicator"><span className="saved-dot"></span> Saved</span>
                  <span><kbd>Enter</kbd> continue</span>
                  <span><kbd>Esc</kbd> close</span>
                </div>
                <div className="foot-actions">
                  <button className="btn btn-ghost" onClick={goBack} style={{ visibility: step > 1 ? 'visible' : 'hidden' }}>← Back</button>
                  {step === 4 && <button className="btn btn-ghost" onClick={goNext}>Skip</button>}
                  <button className="btn btn-primary" onClick={goNext} disabled={!validateStep(step)}>
                    {step === 4 ? 'Launch Project' : 'Next Step →'}
                  </button>
                </div>
              </footer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}