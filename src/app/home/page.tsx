"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import Papa from 'papaparse';
import { db } from '@/lib/firebase';
import { TestRunData, TestStep, ScriptPath, WizardScriptStep, SavedScriptSummary } from '@/types';
import { useRouter } from 'next/navigation';

import { Step2Script } from './_components/Step2Script';
import { Step3Script } from './_components/Step3Script';

// ─── Sidebar is NOT imported here — it lives in layout.tsx ───

const MOCK_SAVED_SCRIPTS: SavedScriptSummary[] = [
  { id: 's1', name: 'Onboarding v3', stepCount: 23, estimatedMinutes: 22, tags: ['UAT', 'Onboarding'] },
  { id: 's2', name: 'Checkout regression suite', stepCount: 42, estimatedMinutes: 40, tags: ['Regression'] },
  { id: 's3', name: 'Mobile signup smoke test', stepCount: 8, estimatedMinutes: 6, tags: ['Smoke'] },
  { id: 's4', name: 'Search ranking edge cases', stepCount: 18, estimatedMinutes: 15, tags: ['UAT'] },
];

const FEED_EVENTS = [
  { avatar: 'N', color: '#3d5a80', name: 'Nick', action: 'passed step 02 on', project: 'annabels8', status: 'pass', time: 'just now' },
  { avatar: 'K', color: '#a6421f', name: 'Kate', action: 'started', project: 'annabels10', status: 'info', time: '1m' },
  { avatar: 'J', color: '#a6421f', name: 'James', action: 'completed', project: 'annabels8', status: 'pass', time: '2h' },
];

const MOCK_SCRIPT_STEPS: Record<string, WizardScriptStep[]> = {
  's1': [
    { id: 'mock-step-1', action: 'Open the app for the first time after install', expectedResult: 'Welcome screen appears with sign-in options visible within 2s', priority: 'High', area: 'Onboarding' },
    { id: 'mock-step-2', action: 'Tap "Continue with Google"', expectedResult: 'Google account picker appears within 2s', priority: 'High', area: 'Auth' },
    { id: 'mock-step-3', action: 'Complete the email verification step', expectedResult: 'User is redirected to the welcome dashboard', priority: 'Medium', area: 'Auth' },
  ],
  'default': [
    { id: 'mock-step-4', action: 'Generic test step 1', expectedResult: 'Works as expected', priority: 'Medium', area: 'Core' }
  ]
};

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

interface WizTester {
  name: string;
  color: string;
  platforms: string[]; // empty if project has no platforms
}

// Styles extracted so they render on both server and client — no flash
const HomeStyles = React.memo(() => (
  <style dangerouslySetInnerHTML={{__html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
    
    .qa-home-wrapper {
      --bg: #f4f3ef; --surface: #ffffff; --surface-alt: #fafaf7;
      --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f;
      --line: #e5e2db; --line-strong: #d4d0c7;
      --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329;
      --rail: #121a17; --rail-ink: #e5e2db; --rail-mute: #7a7a72;
      --pass: #4a7c59; --pass-soft: #e8f0eb;
      --fail: #a6421f; --fail-soft: #f7e8e2;
      --warn: #b8860b; --warn-soft: #f9f0da;
      --info: #3d5a80; --info-soft: #e5ecf2;
      --purple: #6a4a7c; --purple-soft: rgba(106,74,124,0.12);
      --radius: 6px;
      --m1: #3d5a80; --m2: #a6421f; --m3: #b8860b; --m4: #6a4a7c; --m5: #4a7c59;
      background: var(--bg);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      color: var(--ink);
      font-size: 14px;
      min-height: 100vh;
    }
    .qa-home-wrapper * { box-sizing: border-box; }

    /* HERO */
    .qa-hero { position: relative; padding: 40px 40px 32px; background: linear-gradient(180deg, #ebe8de 0%, #f0ede3 100%); border-bottom: 1px solid var(--line-strong); overflow: hidden; }
    .qa-hero::before { content: ''; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); pointer-events: none; opacity: 0.7; }
    .qa-hero::after { content: ''; position: absolute; top: -200px; right: -100px; width: 600px; height: 600px; background: radial-gradient(circle, rgba(45,74,62,0.08) 0%, transparent 60%); pointer-events: none; }
    .hero-head { position: relative; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 28px; gap: 20px; z-index: 1; }
    .hero-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-mute); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .hero-eyebrow .time-now { color: var(--accent); font-weight: 500; }
    .hero-title { font-family: 'Fraunces', serif; font-size: 44px; font-weight: 600; letter-spacing: -0.025em; margin: 0; line-height: 1.05; color: var(--ink); }
    .hero-title em { font-style: italic; font-weight: 500; color: var(--accent); }
    .hero-meta { display: flex; gap: 20px; align-items: center; }
    .hero-meta > div { display: flex; flex-direction: column; align-items: flex-end; }
    .hero-meta .hm-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); }
    .hero-meta .hm-value { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; color: var(--ink); line-height: 1; margin-top: 2px; }

    .btn { height: 38px; padding: 0 16px; font-family: inherit; font-size: 13px; font-weight: 500; border-radius: var(--radius); cursor: pointer; transition: all 0.15s ease; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-ink); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-ghost { background: transparent; border-color: var(--line-strong); color: var(--ink-soft); }
    .btn-ghost:hover:not(:disabled) { background: var(--surface); color: var(--ink); border-color: var(--ink-mute); }

    .currently { position: relative; z-index: 1; display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 14px; }
    .module { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; position: relative; overflow: hidden; transition: all 0.2s ease; }
    .module:hover { box-shadow: 0 6px 16px rgba(0,0,0,0.06); transform: translateY(-1px); }
    .module-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .module-label svg { color: var(--accent); }

    .resume-module { background: linear-gradient(135deg, #fafaf7 0%, #e8f0eb 120%); border-color: rgba(45,74,62,0.2); cursor: pointer; }
    .resume-module .module-label { color: var(--accent); }
    .resume-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 8px; color: var(--ink); }
    .resume-sub { font-size: 12px; color: var(--ink-soft); margin: 0 0 14px; line-height: 1.5; }
    .resume-sub b { color: var(--ink); font-weight: 500; }
    .resume-stats { display: flex; gap: 18px; margin-bottom: 14px; }
    .resume-stat .rs-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); }
    .resume-stat .rs-value { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; color: var(--ink); line-height: 1; margin-top: 2px; }
    .resume-action { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--accent); color: #fff; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; border: none; font-family: inherit; }
    .resume-action:hover { background: var(--accent-ink); }

    .feed-module { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
    .feed-module .module-label { padding: 16px 18px 8px; margin: 0; }
    .feed-module .module-label .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pass); animation: livePulse 1.6s ease-in-out infinite; }
    .feed-list { flex: 1; overflow: hidden; padding: 0 18px 16px; mask-image: linear-gradient(180deg, black 70%, transparent); }
    .feed-track { animation: feedScroll 20s linear infinite; }
    .feed-module:hover .feed-track { animation-play-state: paused; }
    @keyframes feedScroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
    .feed-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 12px; }
    .feed-item:last-child { border-bottom: none; }
    .feed-item .mini-avatar { width: 22px; height: 22px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; margin-top: 1px; }
    .feed-text { flex: 1; color: var(--ink-soft); line-height: 1.45; }
    .feed-text b { color: var(--ink); font-weight: 500; }
    .feed-text .project { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent); }
    .feed-text .status { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; padding: 1px 5px; border-radius: 3px; font-weight: 500; margin: 0 2px; }
    .status.pass { background: var(--pass-soft); color: var(--pass); }
    .status.fail { background: var(--fail-soft); color: var(--fail); }
    .status.info { background: var(--info-soft); color: var(--info); }
    .feed-time { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); white-space: nowrap; margin-top: 1px; }

    .attention-module { background: linear-gradient(135deg, #fafaf7 0%, #f9f0da 140%); border-color: rgba(184,134,11,0.3); cursor: pointer; }
    .attention-module .module-label { color: var(--warn); }
    .attention-module .module-label svg { color: var(--warn); }
    .attention-number { font-family: 'Fraunces', serif; font-size: 48px; font-weight: 600; color: var(--warn); line-height: 1; margin-bottom: 4px; letter-spacing: -0.02em; }
    .attention-label { font-size: 13px; color: var(--ink); font-weight: 500; margin-bottom: 10px; }
    .attention-breakdown { display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: var(--ink-soft); font-family: 'JetBrains Mono', monospace; }
    .attention-breakdown .ab-row { display: flex; justify-content: space-between; align-items: center; }
    .attention-breakdown .ab-row b { color: var(--warn); }

    /* LIST */
    .list-section { padding: 28px 40px 60px; }
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .search { position: relative; flex: 1; min-width: 240px; max-width: 440px; }
    .search input { width: 100%; height: 38px; padding: 0 12px 0 38px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); font-family: inherit; font-size: 13px; color: var(--ink); }
    .search input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-mute); }
    .chip-filter { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
    .filter-chip { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: 999px; cursor: pointer; }
    .filter-chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .filter-chip:hover:not(.active) { background: var(--surface-alt); }

    .section-heading { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin: 28px 0 12px; display: flex; align-items: center; gap: 10px; }
    .section-heading:first-child { margin-top: 0; }
    .section-heading::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .section-heading .count { background: var(--surface); border: 1px solid var(--line); padding: 2px 8px; border-radius: 999px; color: var(--ink-soft); font-weight: 500; }
    .section-group { display: flex; flex-direction: column; gap: 8px; }

    .project-row { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--line-strong); border-radius: 8px; padding: 16px 20px; display: grid; grid-template-columns: auto 1fr 240px 180px auto; gap: 20px; align-items: center; cursor: pointer; transition: all 0.15s ease; }
    .project-row:hover { box-shadow: 0 4px 10px rgba(0,0,0,0.05); border-color: var(--line-strong); }
    .project-row.status-need { border-left-color: var(--warn); }
    .project-row.status-active { border-left-color: var(--info); }
    .project-row.status-done { border-left-color: var(--pass); opacity: 0.85; }
    .row-number { width: 24px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-align: center; font-weight: 500; }
    .project-main { min-width: 0; }
    .project-name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
    .project-name { font-family: 'Fraunces', serif; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
    .tag { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 7px; border-radius: 3px; background: var(--info-soft); color: var(--info); }
    .tag.cycle { background: var(--purple-soft); color: var(--purple); }
    .tag.live { background: var(--pass-soft); color: var(--pass); display: inline-flex; align-items: center; gap: 4px; }
    .tag.live::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--pass); animation: livePulse 1.6s ease-in-out infinite; }
    .project-story { font-size: 12px; color: var(--ink-mute); line-height: 1.5; }
    .project-story b { color: var(--ink-soft); font-weight: 500; }
    .project-story .dot-sep { opacity: 0.4; margin: 0 4px; }

    .avatar-block { display: flex; flex-direction: column; gap: 6px; }
    .avatar-block-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); }
    .avatar-stack { display: flex; align-items: center; gap: 8px; }
    .avatars { display: flex; }
    .avatars .mini-avatar { width: 28px; height: 28px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; font-family: 'JetBrains Mono', monospace; border: 2px solid var(--surface); margin-left: -6px; position: relative; transition: transform 0.2s ease; }
    .avatars .mini-avatar:first-child { margin-left: 0; }
    .avatars .mini-avatar:hover { transform: translateY(-2px); z-index: 3; }
    .avatars .mini-avatar.live::after { content: ''; position: absolute; bottom: -1px; right: -1px; width: 10px; height: 10px; border-radius: 50%; background: var(--pass); border: 2px solid var(--surface); animation: livePulse 1.6s ease-in-out infinite; }
    .avatars .more { background: var(--line); color: var(--ink-soft); font-size: 9px; }
    .avatar-empty { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--warn); text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 8px; background: var(--warn-soft); border-radius: 4px; font-weight: 500; }
    .avatar-empty::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--warn); }

    .progress-block { display: flex; flex-direction: column; gap: 6px; }
    .progress-block-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); display: flex; justify-content: space-between; }
    .progress-block-label .val { color: var(--ink); font-weight: 500; }
    .progress-segmented { height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; display: flex; }
    .progress-segmented .seg { height: 100%; }
    .seg.pass { background: var(--pass); }

    .row-actions { display: flex; gap: 4px; align-items: center; }
    .icon-btn { width: 34px; height: 34px; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-mute); transition: all 0.15s ease; }
    .icon-btn:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }

    /* TOAST */
    .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); transition: transform 0.3s cubic-bezier(.4,0,.2,1); z-index: 100; }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast .check { color: var(--pass); }

    /* ANIMATIONS */
    @keyframes livePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
    @keyframes popIn { from { opacity: 0; transform: scale(0.95) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes modalIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fall { 0% { opacity: 0; transform: translateY(-20px) rotate(0); } 8% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; transform: translateY(420px) rotate(720deg); } }
    @keyframes ripple { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.4); opacity: 0; } }
    @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    /* WIZARD */
    .wiz-modal-overlay { position: fixed; inset: 0; background: rgba(18,26,23,0.6); backdrop-filter: blur(4px); z-index: 9998; animation: fadeIn 0.2s ease; }
    .wiz-modal-container { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; pointer-events: none; padding: 24px; }
    .wiz-modal { pointer-events: auto; width: 720px; max-width: 100%; max-height: calc(100vh - 48px); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 16px; box-shadow: 0 24px 60px rgba(0,0,0,0.3); display: grid; grid-template-columns: 200px 1fr; overflow: hidden; transition: width 0.4s cubic-bezier(.4,.0,.2,1); animation: modalIn 0.3s cubic-bezier(.4,0,.2,1); }
    .wiz-modal.expanded { width: 1180px; }

    .rail { background: var(--rail); color: var(--rail-ink); padding: 24px 18px; display: flex; flex-direction: column; gap: 20px; position: relative; overflow: hidden; }
    .rail::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 20% 100%, rgba(74,124,89,0.15) 0, transparent 60%); pointer-events: none; }
    .rail-brand { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; position: relative; z-index: 1; }
    .rail-brand .eyebrow { display: block; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--rail-mute); margin-bottom: 4px; font-weight: 500; }
    .rail-progress { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--rail-mute); text-transform: uppercase; letter-spacing: 0.12em; display: flex; justify-content: space-between; position: relative; z-index: 1; }
    .rail-bar { height: 2px; background: rgba(255,255,255,0.08); border-radius: 1px; overflow: hidden; position: relative; z-index: 1; }
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

    .wiz-content { display: flex; flex-direction: column; overflow: hidden; min-height: 0; width: 100%; color: var(--ink); font-size: 14px; }
    .content-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 28px 14px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
    .content-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
    .content-title .eyebrow { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 4px; }
    .content-sub { color: var(--ink-mute); font-size: 13px; margin: 4px 0 0; }
    .content-body { flex: 1; padding: 24px 28px; overflow-y: auto; position: relative; }
    .step-panel { animation: slideIn 0.3s cubic-bezier(.4,.0,.2,1); height: 100%; }
    .wiz-field { margin-bottom: 18px; }
    .wiz-field-label { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 500; color: var(--ink-soft); margin-bottom: 6px; }
    .wiz-field-label .optional { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; }
    .wiz-input { width: 100%; height: 40px; padding: 0 14px; font-family: inherit; font-size: 14px; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius); transition: all 0.15s ease; }
    .wiz-input::placeholder { color: var(--ink-mute); }
    .wiz-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.12); }

    /* Platform styles */
    .platform-chips-input { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); min-height: 40px; }
    .platform-chips-input:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.12); }
    .platform-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; background: var(--accent-soft); color: var(--accent); border-radius: 999px; font-size: 12px; font-weight: 500; }
    .platform-chip-remove { width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(45,74,62,0.15); color: var(--accent); cursor: pointer; font-size: 14px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
    .platform-chip-remove:hover { background: var(--accent); color: #fff; }
    .platform-chip-input { flex: 1; min-width: 200px; border: none; outline: none; background: transparent; font-family: inherit; font-size: 13px; color: var(--ink); padding: 4px 8px; }
    .field-helper { font-size: 11px; color: var(--ink-mute); margin-top: 6px; font-family: 'JetBrains Mono', monospace; }

    .platform-assign-grid { display: flex; flex-direction: column; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
    .pa-grid-head, .pa-grid-row { display: grid; grid-template-columns: 1fr repeat(var(--platform-count, 2), 60px); background: var(--surface); align-items: center; }
    .pa-grid-head { background: var(--surface-alt); font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); }
    .pa-grid-cell-label, .pa-grid-cell-platform { padding: 8px 12px; text-align: center; }
    .pa-grid-cell-label { text-align: left; }
    .pa-grid-cell-tester { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
    .pa-grid-cell-check { width: 36px; height: 36px; margin: 0 auto; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: transparent; transition: all 0.15s ease; }
    .pa-grid-cell-check:hover { border-color: var(--accent); }
    .pa-grid-cell-check.checked { background: var(--accent); border-color: var(--accent); color: #fff; }

    .step1-grid { display: grid; grid-template-columns: 1fr 280px; gap: 28px; align-items: flex-start; }
    .preview-card { background: linear-gradient(135deg, #fafaf7 0%, #f0ede4 100%); border: 1px solid var(--line-strong); border-radius: 8px; padding: 18px; position: relative; overflow: hidden; }
    .preview-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 8px; }
    .preview-name { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 10px; min-height: 26px; color: var(--ink); word-break: break-word; }
    .preview-name.empty { color: var(--ink-mute); font-style: italic; font-weight: 500; }
    .preview-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; min-height: 20px; }
    .preview-tag { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 8px; border-radius: 4px; background: rgba(61,90,128,0.1); color: var(--info); }
    .preview-tag.cycle { background: rgba(106,74,124,0.1); color: #6a4a7c; }
    .preview-meta { font-size: 11px; color: var(--ink-mute); line-height: 1.5; font-family: 'JetBrains Mono', monospace; }

    .close-btn { width: 32px; height: 32px; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); transition: all 0.15s; flex-shrink: 0; }
    .close-btn:hover { background: var(--surface-alt); color: var(--ink); }

    .content-foot { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 32px; border-top: 1px solid var(--line); background: var(--surface-alt); flex-shrink: 0; }
    .foot-hint { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 8px; }
    .foot-hint kbd { background: var(--surface); border: 1px solid var(--line-strong); padding: 2px 6px; border-radius: 3px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-soft); }
    .foot-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
    .saved-indicator { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; display: inline-flex; align-items: center; gap: 5px; margin-right: 10px; transition: opacity 0.2s; opacity: 0; }
    .saved-indicator.show { opacity: 1; }
    .saved-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--pass); }

    .roster-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .add-tester-row { display: flex; gap: 8px; margin-bottom: 14px; }
    .add-tester-row .wiz-input { flex: 1; }
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
    .launch-check { color: var(--accent); width: 36px; height: 36px; }
    .launch-title { font-family: 'Fraunces', serif; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 8px; }
    .launch-sub { color: var(--ink-mute); font-size: 14px; margin: 0 auto 24px; max-width: 380px; }
    .launch-summary { display: grid; gap: 10px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: left; }
    .launch-cell .lc-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); margin-bottom: 2px; }
    .launch-cell .lc-value { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; color: var(--ink); }

    .confetti { position: absolute; width: 8px; height: 14px; pointer-events: none; opacity: 0; border-radius: 1px; z-index: 2; }
    .confetti.fire { animation: fall 3.6s cubic-bezier(.2,.6,.4,1) forwards; }
  `}} />
));
HomeStyles.displayName = 'HomeStyles';

export default function PMHomeDashboard() {
  const router = useRouter();

  // Only gates browser-specific values — NOT the whole UI
  const [hydrated, setHydrated] = useState(false);
  const [greeting, setGreeting] = useState('Good morning'); // stable default matches server

  const [allRuns, setAllRuns] = useState<TestRunData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<'all' | 'need' | 'active' | 'done'>('all');
  const [toastMsg, setToastMsg] = useState('');

  const [wizOpen, setWizOpen] = useState(false);
  const [wizStep, setWizStep] = useState(1);
  const [wizSaved, setWizSaved] = useState(false);
  const [wizName, setWizName] = useState('');
  const [wizEnv, setWizEnv] = useState('');
  const [wizCycle, setWizCycle] = useState('');
  
  // Platform Setup State
  const [wizPlatforms, setWizPlatforms] = useState<string[]>([]);
  const [wizPlatformInput, setWizPlatformInput] = useState('');

  const [scriptPath, setScriptPath] = useState<ScriptPath | null>(null);
  const [savedScriptId, setSavedScriptId] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [wizHeaders, setWizHeaders] = useState<string[]>([]);
  const [wizRawData, setWizRawData] = useState<any[]>([]);
  const [wizMap, setWizMap] = useState<Record<string, string>>({ action: '', expectedResult: '', area: '', scenario: '', priority: '' });
  const [manualSteps, setManualSteps] = useState<WizardScriptStep[]>([]);
  const [savedScriptSteps, setSavedScriptSteps] = useState<WizardScriptStep[]>([]);
  const [wizTesterInput, setWizTesterInput] = useState('');
  
  // Adjusted for Platform Assignments
  const [wizTesters, setWizTesters] = useState<WizTester[]>([]);
  const [wizNewTesterPlatforms, setWizNewTesterPlatforms] = useState<string[]>([]);
  
  const [isLaunching, setIsLaunching] = useState(false);
  const confettiContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(true);
    // Update greeting after hydration — this is the only browser-dependent value
    const h = new Date().getHours();
    if (h >= 12 && h < 18) setGreeting('Good afternoon');
    else if (h >= 18) setGreeting('Good evening');

    // Stable Firestore deduplication
    const unsubscribe = onSnapshot(collection(db, 'testRuns'), (snapshot) => {
      const runsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as TestRunData[];
      
      setAllRuns(prev => {
        if (prev.length !== runsData.length) return runsData;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].id !== runsData[i].id) return runsData;
          if (JSON.stringify(prev[i]) !== JSON.stringify(runsData[i])) return runsData;
        }
        return prev;
      });
    });
    return () => unsubscribe();
  }, []);

  // Sync new tester platforms state with defined platforms
  useEffect(() => {
    setWizNewTesterPlatforms(wizPlatforms);
  }, [wizPlatforms]);

  // Safe timeout clearance for Wizard
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeWizard = () => {
    setWizOpen(false);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setWizStep(1); setWizName(''); setWizEnv(''); setWizCycle('');
      setWizPlatforms([]); setWizPlatformInput('');
      setScriptPath(null); setSavedScriptId(null); setCsvFile(null);
      setWizHeaders([]); setWizRawData([]);
      setManualSteps([]); setSavedScriptSteps([]); setWizTesters([]);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Clean up confetti timeout
  useEffect(() => {
    if (wizStep !== 5 || isLaunching) return;
    const timer = setTimeout(() => triggerConfetti(), 100);
    return () => clearTimeout(timer);
  }, [wizStep, isLaunching]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const projects = useMemo(() => {
    const grouped: Record<string, any> = {};
    allRuns.forEach(run => {
      if (!grouped[run.projectName]) {
        grouped[run.projectName] = {
          name: run.projectName, cycle: run.testCycle || 'N/A', environment: run.environment || 'N/A',
          runs: [], totalSteps: 0, completedSteps: 0,
          // Secured Date fallback
          createdAt: run.createdAt?.toDate ? run.createdAt.toDate() : new Date(0)
        };
      }
      grouped[run.projectName].runs.push(run);
      if (grouped[run.projectName].runs.length === 1) {
        grouped[run.projectName].totalSteps = run.steps?.length || 0;
      }
      if (run.testerName !== 'Unassigned') {
        grouped[run.projectName].completedSteps += Object.keys(run.results || {}).length;
      }
    });
    return Object.values(grouped).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [allRuns]);

  // Memoize derived arrays and stats to prevent constant re-renders
  const heroStats = useMemo(() => {
    const activeTestersCount = new Set(allRuns.map(r => r.testerName).filter(n => n !== 'Unassigned')).size;
    const liveNowCount = allRuns.filter(r => r.testerName !== 'Unassigned' && !r.isCompleted && Object.keys(r.results || {}).length > 0).length;
    let totalStepsOverall = 0, totalCompletedOverall = 0;
    projects.forEach(p => {
      const activeTesters = p.runs.filter((r: any) => r.testerName !== 'Unassigned').length;
      totalStepsOverall += (p.totalSteps * (activeTesters || 1));
      totalCompletedOverall += p.completedSteps;
    });
    const avgProgress = totalStepsOverall > 0 ? Math.round((totalCompletedOverall / totalStepsOverall) * 100) : 0;
    return { activeTestersCount, liveNowCount, avgProgress };
  }, [allRuns, projects]);

  const processedProjects = useMemo(() => projects.map(proj => {
    const activeTesters = proj.runs.filter((r: any) => r.testerName !== 'Unassigned');
    const testerCount = activeTesters.length;
    const totalPossibleSteps = proj.totalSteps * testerCount;
    const pct = totalPossibleSteps > 0 ? Math.round((proj.completedSteps / totalPossibleSteps) * 100) : 0;
    let status: 'need' | 'active' | 'done' = 'active';
    if (testerCount === 0) status = 'need';
    else if (pct === 100) status = 'done';
    return { ...proj, testerCount, pct, status, activeTesters };
  }), [projects]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return processedProjects.filter(p => {
      const isMatch = p.name.toLowerCase().includes(q) ||
        p.activeTesters.some((t: any) => t.testerName.toLowerCase().includes(q));
      return isMatch && (listFilter === 'all' || p.status === listFilter);
    });
  }, [processedProjects, searchQuery, listFilter]);

  const needsTesters = useMemo(() => filteredProjects.filter(p => p.status === 'need'), [filteredProjects]);
  const inProgress = useMemo(() => filteredProjects.filter(p => p.status === 'active'), [filteredProjects]);
  const complete = useMemo(() => filteredProjects.filter(p => p.status === 'done'), [filteredProjects]);

  const uniqueTestersList = useMemo(() => Array.from(new Set(allRuns.map(r => r.testerName).filter(n => n !== 'Unassigned'))), [allRuns]);

  const triggerSaved = () => { setWizSaved(true); setTimeout(() => setWizSaved(false), 1500); };

  const handleSavedScriptSelect = (id: string) => {
    setSavedScriptId(id);
    const steps = MOCK_SCRIPT_STEPS[id] || MOCK_SCRIPT_STEPS['default'];
    setSavedScriptSteps(JSON.parse(JSON.stringify(steps)));
    triggerSaved();
  };

  const handleCsvUpload = (file: File) => {
    setCsvFile(file);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setWizHeaders(headers);
        setWizRawData(results.data);
        const newMap = { action: '', expectedResult: '', area: '', scenario: '', priority: '' };
        headers.forEach(h => {
          const l = h.toLowerCase();
          if (l.includes('action') || l.includes('step')) newMap.action = h;
          if (l.includes('expect')) newMap.expectedResult = h;
          if (l.includes('module') || l.includes('area')) newMap.area = h;
          if (l.includes('scenario')) newMap.scenario = h;
          if (l.includes('prior') || l.includes('sever')) newMap.priority = h;
        });
        setWizMap(newMap);
        triggerSaved();
      }
    });
  };

  const handleAddPlatform = () => {
    const newPlatform = wizPlatformInput.trim();
    if (newPlatform && !wizPlatforms.includes(newPlatform)) {
      setWizPlatforms([...wizPlatforms, newPlatform]);
      setWizTesters(prev => prev.map(t => ({
        ...t,
        platforms: [...t.platforms, newPlatform]
      })));
      triggerSaved();
    }
    setWizPlatformInput('');
  };

  const removeTester = (name: string) => { 
    setWizTesters(prev => prev.filter(t => t.name !== name)); 
    triggerSaved(); 
  };

  const addTester = (nameOverride?: string) => {
    const name = (nameOverride || wizTesterInput).trim();
    if (!name) return;
    if (!wizTesters.some(t => t.name === name)) {
      const colors = ['#3d5a80', '#a6421f', '#6a4a7c', '#b8860b', '#4a7c59'];
      const color = colors[wizTesters.length % colors.length];
      setWizTesters([...wizTesters, { 
        name, 
        color,
        platforms: wizPlatforms.length > 0 ? [...wizNewTesterPlatforms] : []
      }]);
    }
    setWizTesterInput('');
    setWizNewTesterPlatforms([...wizPlatforms]); // reset checkboxes for next tester
    triggerSaved();
  };

  const canAdvance = () => {
    if (wizStep === 1) return !!wizName;
    if (wizStep === 2) {
      if (!scriptPath) return false;
      if (scriptPath === 'csv') return csvFile !== null;
      if (scriptPath === 'saved') return savedScriptId !== null;
      if (scriptPath === 'manual') return true; // FIXED: Always allow passing from Step 2 to Step 3 for manual scripts
    }
    if (wizStep === 3) {
      if (scriptPath === 'csv') return !!wizMap.action && !!wizMap.expectedResult;
      if (scriptPath === 'manual') return manualSteps.length >= 3; // FIXED: Require 3 steps here instead
      return true;
    }
    return true;
  };

  const launchProject = async () => {
    setIsLaunching(true);
    try {
      let finalSteps: TestStep[] = [];
      if (scriptPath === 'saved') {
        finalSteps = savedScriptSteps.map(s => ({ id: s.id, action: s.action, expectedResult: s.expectedResult, priority: s.priority, area: s.area }));
      } else if (scriptPath === 'manual') {
        finalSteps = manualSteps.map(s => ({ id: s.id, action: s.action, expectedResult: s.expectedResult, priority: s.priority, area: s.area }));
      } else {
        finalSteps = wizRawData.map((row: any, index: number) => ({
          id: `step_${index + 1}`,
          action: row[wizMap.action] || 'Missing Action',
          expectedResult: row[wizMap.expectedResult] || 'Missing Expected Result',
          area: wizMap.area ? row[wizMap.area] : '',
          scenario: wizMap.scenario ? row[wizMap.scenario] : '',
          priority: wizMap.priority ? row[wizMap.priority] : '',
        }));
      }
      
      if (wizPlatforms.length === 0) {
        // Legacy single-platform path
        const targetTesters = wizTesters.length > 0 ? wizTesters.map(t => t.name) : ['Unassigned'];
        for (const name of targetTesters) {
          await addDoc(collection(db, 'testRuns'), {
            projectName: wizName, 
            testerName: name, 
            environment: wizEnv,
            testCycle: wizCycle, 
            steps: finalSteps, 
            createdAt: serverTimestamp(), 
            results: {}
          });
        }
      } else {
        // Cross-platform — one run per (tester × platform) combo
        if (wizTesters.length === 0) {
          // No testers assigned yet — create one Unassigned run per platform
          for (const platform of wizPlatforms) {
            await addDoc(collection(db, 'testRuns'), {
              projectName: wizName,
              testerName: 'Unassigned',
              environment: wizEnv,
              testCycle: wizCycle,
              steps: finalSteps,
              createdAt: serverTimestamp(),
              results: {},
              platform,
              platforms: wizPlatforms,
            });
          }
        } else {
          for (const tester of wizTesters) {
            for (const platform of tester.platforms) {
              await addDoc(collection(db, 'testRuns'), {
                projectName: wizName,
                testerName: tester.name,
                environment: wizEnv,
                testCycle: wizCycle,
                steps: finalSteps,
                createdAt: serverTimestamp(),
                results: {},
                platform,
                platforms: wizPlatforms,
              });
            }
          }
        }
      }

      setWizStep(5);
    } catch (error) {
      alert('Failed to launch project.');
    } finally {
      setIsLaunching(false);
    }
  };

  const triggerConfetti = () => {
    if (!confettiContainerRef.current) return;
    const colors = ['#4a7c59', '#3d5a80', '#b8860b', '#a6421f', '#6a4a7c'];
    const waves = [{ c: 25, d: 100 }, { c: 18, d: 800 }, { c: 14, d: 1500 }];
    waves.forEach(w => {
      setTimeout(() => {
        for (let i = 0; i < w.c; i++) {
          const el = document.createElement('div');
          el.className = 'confetti fire';
          el.style.background = colors[Math.floor(Math.random() * colors.length)];
          el.style.left = 50 + (Math.random() - 0.5) * 90 + '%';
          el.style.top = '40px';
          el.style.width = 7 + Math.random() * 5 + 'px';
          el.style.height = 11 + Math.random() * 7 + 'px';
          el.style.animationDelay = Math.random() * 0.5 + 's';
          el.style.animationDuration = 3.5 + Math.random() * 2 + 's';
          confettiContainerRef.current?.appendChild(el);
          setTimeout(() => el.remove(), 6500);
        }
      }, w.d);
    });
  };

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

  const currentTitle = getStepTitle(wizStep, scriptPath);

  // Stable server/client render — no isMounted gate, no layout shift
  return (
    <div className="qa-home-wrapper" suppressHydrationWarning>
      <HomeStyles />

      {/* HERO */}
      <section className="qa-hero">
        <div className="hero-head">
          <div>
            <div className="hero-eyebrow">
              <span>Workspace · {projects.length} projects</span>
              <span style={{ opacity: 0.5 }}>—</span>
              {/* greeting updates after hydration but 'Good morning' is safe default */}
              <span className="time-now">{greeting}, John</span>
            </div>
            <h1 className="hero-title">Your <em>test cycles</em>,<br/>in one place.</h1>
          </div>
          <div className="hero-meta">
            <div>
              <span className="hm-label">Active Testers</span>
              <span className="hm-value">{heroStats.activeTestersCount}</span>
            </div>
            <div>
              <span className="hm-label">Live Now</span>
              <span className="hm-value" style={{ color: 'var(--pass)' }}>{heroStats.liveNowCount}</span>
            </div>
            <div>
              <span className="hm-label">Avg Progress</span>
              <span className="hm-value">{heroStats.avgProgress}%</span>
            </div>
            <div style={{ paddingLeft: '16px', borderLeft: '1px solid var(--line)' }}>
              <button className="btn btn-primary" onClick={() => setWizOpen(true)} style={{ height: '44px', padding: '0 20px', borderRadius: '8px', fontSize: '14px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: '6px' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Create New Project
              </button>
            </div>
          </div>
        </div>

        <div className="currently">
          <div className="module resume-module" onClick={() => projects[0] && router.push('/admin')}>
            <div className="module-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Pick up where you left off
            </div>
            <h2 className="resume-title">{projects[0]?.name || 'No projects'}</h2>
            <p className="resume-sub">Jump directly into your most recently active testing cycle.</p>
            <div className="resume-stats">
              <div className="resume-stat"><div className="rs-label">Steps</div><div className="rs-value">{projects[0]?.totalSteps || 0}</div></div>
              <div className="resume-stat"><div className="rs-label">Testers</div><div className="rs-value">{projects[0]?.runs?.filter((r:any) => r.testerName !== 'Unassigned').length || 0}</div></div>
              <div className="resume-stat"><div className="rs-label">Progress</div><div className="rs-value">{projects[0]?.pct || 0}%</div></div>
            </div>
            <button className="resume-action">
              Manage Project
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>

          <div className="module feed-module">
            <div className="module-label"><span className="live-dot"></span> Live activity</div>
            <div className="feed-list">
              <div className="feed-track">
                {[...FEED_EVENTS, ...FEED_EVENTS].map((e, i) => (
                  <div className="feed-item" key={i}>
                    <div className="mini-avatar" style={{ background: e.color }}>{e.avatar}</div>
                    <div className="feed-text">
                      <b>{e.name}</b> {e.action} <span className="project">{e.project}</span>
                      <div style={{ marginTop: '2px' }}>
                        <span className={`status ${e.status}`}>{e.status === 'pass' ? 'PASS' : e.status === 'fail' ? 'FAIL' : 'EVENT'}</span>
                      </div>
                    </div>
                    <div className="feed-time">{e.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="module attention-module" onClick={() => { setListFilter('need'); showToast('Filtered to projects needing attention'); }}>
            <div className="module-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 9v4M12 17h.01"/></svg>
              Needs attention
            </div>
            <div className="attention-number">{needsTesters.length}</div>
            <div className="attention-label">Projects waiting on you</div>
            <div className="attention-breakdown">
              <div className="ab-row"><span>No testers assigned</span><b>{needsTesters.length}</b></div>
            </div>
          </div>
        </div>
      </section>

      {/* LIST */}
      <section className="list-section">
        <div className="toolbar">
          <div className="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search projects, testers, scenarios..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="chip-filter">
            <button className={`filter-chip ${listFilter === 'all' ? 'active' : ''}`} onClick={() => setListFilter('all')}>All · {processedProjects.length}</button>
            <button className={`filter-chip ${listFilter === 'active' ? 'active' : ''}`} onClick={() => setListFilter('active')}>Active · {inProgress.length}</button>
            <button className={`filter-chip ${listFilter === 'need' ? 'active' : ''}`} onClick={() => setListFilter('need')}>Needs testers · {needsTesters.length}</button>
            <button className={`filter-chip ${listFilter === 'done' ? 'active' : ''}`} onClick={() => setListFilter('done')}>Complete · {complete.length}</button>
          </div>
        </div>

        {needsTesters.length > 0 && (
          <>
            <h3 className="section-heading">Needs Testers <span className="count">{needsTesters.length}</span></h3>
            <div className="section-group">
              {needsTesters.map((p, idx) => (
                <div className="project-row status-need" key={p.name} onClick={() => router.push('/admin')}>
                  <div className="row-number">{(idx + 1).toString().padStart(2, '0')}</div>
                  <div className="project-main">
                    <div className="project-name-row">
                      <span className="project-name">{p.name}</span>
                      {p.cycle && p.cycle !== 'N/A' && <span className="tag cycle">{p.cycle}</span>}
                      {p.environment && p.environment !== 'N/A' && <span className="tag">{p.environment}</span>}
                    </div>
                    <div className="project-story">
                      {/* Only render locale date on client to avoid hydration mismatch */}
                      Created <b>{hydrated ? p.createdAt.toLocaleDateString() : '—'}</b>
                      <span className="dot-sep">·</span> {p.totalSteps} test steps
                      <span className="dot-sep">·</span> Ready to provision
                    </div>
                  </div>
                  <div className="avatar-block">
                    <div className="avatar-block-label">Testers</div>
                    <div className="avatar-empty">No testers</div>
                  </div>
                  <div className="progress-block">
                    <div className="progress-block-label"><span>Progress</span><span className="val">0%</span></div>
                    <div className="progress-segmented"></div>
                  </div>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={e => { e.stopPropagation(); router.push('/admin'); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {inProgress.length > 0 && (
          <>
            <h3 className="section-heading" style={{ marginTop: needsTesters.length ? 28 : 0 }}>In Progress <span className="count">{inProgress.length}</span></h3>
            <div className="section-group">
              {inProgress.map((p, idx) => {
                const isLive = p.activeTesters.some((t: any) => !t.isCompleted && Object.keys(t.results || {}).length > 0);
                return (
                  <div className="project-row status-active" key={p.name} onClick={() => router.push('/admin')}>
                    <div className="row-number">{(needsTesters.length + idx + 1).toString().padStart(2, '0')}</div>
                    <div className="project-main">
                      <div className="project-name-row">
                        <span className="project-name">{p.name}</span>
                        {isLive && <span className="tag live">Live</span>}
                      </div>
                      <div className="project-story">In progress <span className="dot-sep">·</span> {p.totalSteps} steps</div>
                    </div>
                    <div className="avatar-block">
                      <div className="avatar-block-label">Testers {isLive ? '· Live' : ''}</div>
                      <div className="avatar-stack">
                        <div className="avatars">
                          {p.activeTesters.slice(0, 3).map((t: any, i: number) => {
                            const colors = ['#3d5a80', '#a6421f', '#6a4a7c', '#b8860b', '#4a7c59'];
                            const c = colors[t.testerName.length % colors.length];
                            const testerIsLive = !t.isCompleted && Object.keys(t.results || {}).length > 0;
                            return <div key={i} className={`mini-avatar${testerIsLive ? ' live' : ''}`} style={{ background: c }} title={t.testerName}>{t.testerName.charAt(0).toUpperCase()}</div>;
                          })}
                          {p.testerCount > 3 && <div className="mini-avatar more">+{p.testerCount - 3}</div>}
                        </div>
                      </div>
                    </div>
                    <div className="progress-block">
                      <div className="progress-block-label"><span>Progress</span><span className="val">{p.pct}%</span></div>
                      <div className="progress-segmented">
                        <div className="seg pass" style={{ flex: p.pct }}></div>
                        <div style={{ flex: 100 - p.pct }}></div>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={e => { e.stopPropagation(); router.push('/admin'); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {complete.length > 0 && (
          <>
            <h3 className="section-heading" style={{ marginTop: (needsTesters.length || inProgress.length) ? 28 : 0 }}>Complete <span className="count">{complete.length}</span></h3>
            <div className="section-group">
              {complete.map((p, idx) => (
                <div className="project-row status-done" key={p.name} onClick={() => router.push('/admin')}>
                  <div className="row-number">{(needsTesters.length + inProgress.length + idx + 1).toString().padStart(2, '0')}</div>
                  <div className="project-main">
                    <div className="project-name-row"><span className="project-name">{p.name}</span></div>
                    <div className="project-story">Completed <span className="dot-sep">·</span> 100% passed</div>
                  </div>
                  <div className="avatar-block">
                    <div className="avatar-block-label">Testers</div>
                    <div className="avatars">
                      {p.activeTesters.slice(0, 3).map((t: any, i: number) => {
                        const colors = ['#3d5a80', '#a6421f', '#6a4a7c', '#b8860b', '#4a7c59'];
                        return <div key={i} className="mini-avatar" style={{ background: colors[t.testerName.length % colors.length] }} title={t.testerName}>{t.testerName.charAt(0).toUpperCase()}</div>;
                      })}
                    </div>
                  </div>
                  <div className="progress-block">
                    <div className="progress-block-label"><span>Progress</span><span className="val">100%</span></div>
                    <div className="progress-segmented"><div className="seg pass" style={{ flex: 100 }}></div></div>
                  </div>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={e => { e.stopPropagation(); router.push('/admin'); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* TOAST */}
      <div className={`toast${toastMsg ? ' show' : ''}`}>
        <svg className="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>{toastMsg}</span>
      </div>

      {/* WIZARD */}
      {wizOpen && (
        <>
          <div className="wiz-modal-overlay" onClick={closeWizard} />
          <div className="wiz-modal-container">
            <div className={`wiz-modal${wizStep === 3 ? ' expanded' : ''}`}>
              <aside className="rail">
                <div className="rail-brand"><span className="eyebrow">QA Triage</span>New Project</div>
                <div>
                  <div className="rail-progress"><span>Step {wizStep} / 5</span><span>{wizStep === 5 ? 'Done' : `~${[45,30,25,15,0][wizStep-1]}s left`}</span></div>
                  <div className="rail-bar" style={{ marginTop: '6px' }}><div className="rail-bar-fill" style={{ width: (wizStep / 5) * 100 + '%' }} /></div>
                </div>
                <nav className="rail-steps">
                  {[
                    { n: 1, label: 'Details', value: wizName || '—' },
                    { n: 2, label: 'Script', value: getStep2Label() },
                    { n: 3, label: getStep3Name(scriptPath), value: getStep3Label() },
                    { n: 4, label: 'Assign', value: wizTesters.length ? `${wizTesters.length} added` : 'Optional' },
                    { n: 5, label: 'Launch', value: '—' },
                  ].map(({ n, label, value }) => (
                    <div key={n} className={`rail-step ${wizStep === n ? 'active' : wizStep > n ? 'done' : 'locked'}`} onClick={() => wizStep > n && setWizStep(n)}>
                      <div className="step-dot">
                        {wizStep > n
                          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          : n}
                      </div>
                      <div className="step-text">
                        <div className="step-name">{label}</div>
                        <div className="step-value">{value}</div>
                      </div>
                    </div>
                  ))}
                </nav>
                <div className="rail-foot"><div className="rail-tip">Press <kbd>Enter</kbd> to continue, <kbd>Esc</kbd> to close.</div></div>
              </aside>

              <div className="wiz-content">
                <header className="content-head">
                  <div>
                    <h1 className="content-title"><span className="eyebrow">Step {wizStep} of 5</span>{currentTitle.t}</h1>
                    <p className="content-sub">{currentTitle.s}</p>
                  </div>
                  <button className="close-btn" onClick={closeWizard} aria-label="Close">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </header>

                <div className="content-body">
                  {wizStep === 1 && (
                    <div className="step1-grid">
                      <div>
                        <div className="wiz-field">
                          <div className="wiz-field-label"><span>Project Name *</span></div>
                          <input className="wiz-input" type="text" value={wizName} onChange={e => { setWizName(e.target.value); triggerSaved(); }} placeholder="e.g. Checkout v3 UAT" autoFocus />
                        </div>
                        <div className="wiz-field">
                          <div className="wiz-field-label"><span>Target Environment</span><span className="optional">Optional</span></div>
                          <input className="wiz-input" type="text" value={wizEnv} onChange={e => { setWizEnv(e.target.value); triggerSaved(); }} placeholder="Staging, Production, Dev..." />
                        </div>
                        <div className="wiz-field">
                          <div className="wiz-field-label"><span>Test Cycle</span><span className="optional">Optional</span></div>
                          <input className="wiz-input" type="text" value={wizCycle} onChange={e => { setWizCycle(e.target.value); triggerSaved(); }} placeholder="Sprint 42, Release 2.1..." />
                        </div>
                        
                        <div className="wiz-field">
                          <div className="wiz-field-label">
                            <span>Platforms</span>
                            <span className="optional">Optional · for cross-platform projects</span>
                          </div>
                          <div className="platform-chips-input">
                            {wizPlatforms.map(p => (
                              <span key={p} className="platform-chip">
                                {p}
                                <button
                                  className="platform-chip-remove"
                                  onClick={() => {
                                    setWizPlatforms(prev => prev.filter(x => x !== p));
                                    setWizTesters(prev => prev.map(t => ({
                                      ...t,
                                      platforms: t.platforms.filter(x => x !== p)
                                    })));
                                    triggerSaved();
                                  }}
                                  aria-label={`Remove ${p}`}
                                >×</button>
                              </span>
                            ))}
                            <input
                              className="platform-chip-input"
                              type="text"
                              placeholder={wizPlatforms.length === 0 ? 'Type a platform and press enter (e.g. iOS, Android)' : 'Add another...'}
                              value={wizPlatformInput}
                              onChange={e => setWizPlatformInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleAddPlatform();
                              }}
                              onBlur={handleAddPlatform}
                            />
                          </div>
                          <div className="field-helper">
                            Leave blank for single-platform testing. Add platforms (e.g. iOS, Android, Chrome) if testers will cover multiple.
                          </div>
                        </div>

                      </div>
                      <div>
                        <div className="preview-card">
                          <div className="preview-label">Live Preview</div>
                          <div className={`preview-name${!wizName ? ' empty' : ''}`}>{wizName || 'Untitled project'}</div>
                          <div className="preview-tags">
                            {wizEnv && <span className="preview-tag">{wizEnv}</span>}
                            {wizCycle && <span className="preview-tag cycle">{wizCycle}</span>}
                          </div>
                          {wizPlatforms.length > 0 && (
                            <div className="preview-platforms" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                              <div className="preview-label" style={{ marginBottom: '6px' }}>Platforms</div>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {wizPlatforms.map(p => (
                                  <span key={p} className="preview-tag" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{p}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="preview-meta" style={{ marginTop: wizPlatforms.length > 0 ? '14px' : '0' }}>
                            <div>Created · just now</div>
                            <div>Owner · Admin</div>
                            <div>Tests · —</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {wizStep === 2 && (
                    <Step2Script
                      scriptPath={scriptPath}
                      onPathChange={setScriptPath}
                      savedScripts={MOCK_SAVED_SCRIPTS}
                      selectedSavedScriptId={savedScriptId}
                      onSelectSavedScript={handleSavedScriptSelect}
                      csvFile={csvFile}
                      csvHeaders={wizHeaders}
                      csvRawData={wizRawData}
                      onCsvUpload={f => { handleCsvUpload(f); }}
                      onCsvReset={() => { setCsvFile(null); setWizHeaders([]); setWizRawData([]); }}
                      manualSteps={manualSteps}
                      onManualStepsChange={s => { setManualSteps(s); triggerSaved(); }}
                      onOpenBulkPaste={() => {}}
                    />
                  )}

                  {wizStep === 3 && scriptPath && (
                    <Step3Script
                      scriptPath={scriptPath}
                      csvFile={csvFile}
                      csvHeaders={wizHeaders}
                      csvRawData={wizRawData}
                      csvMapping={wizMap}
                      onCsvMappingChange={(fieldId, colId) => { setWizMap({ ...wizMap, [fieldId]: colId }); triggerSaved(); }}
                      selectedSavedScript={MOCK_SAVED_SCRIPTS.find(s => s.id === savedScriptId) || null}
                      savedScriptSteps={savedScriptSteps}
                      onSavedScriptStepsChange={s => { setSavedScriptSteps(s); triggerSaved(); }}
                      manualSteps={manualSteps}
                      onManualStepsChange={s => { setManualSteps(s); triggerSaved(); }}
                    />
                  )}

                  {wizStep === 4 && (
                    <div className="roster-grid">
                      <div>
                        <div className="wiz-field">
                          <div className="wiz-field-label"><span>Add Tester</span><span className="optional">Press Enter</span></div>
                          <div className="add-tester-row">
                            <input className="wiz-input" type="text" placeholder="Name or email..." value={wizTesterInput} onChange={e => setWizTesterInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTester()} />
                            <button className="btn btn-primary" onClick={() => addTester()}>Add</button>
                          </div>
                          {wizPlatforms.length > 0 && (
                            <div style={{ marginTop: '8px', marginBottom: '16px' }}>
                              <div style={{ fontSize: '10px', color: 'var(--ink-mute)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assign to:</div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {wizPlatforms.map(p => {
                                  const isActive = wizNewTesterPlatforms.includes(p);
                                  return (
                                    <span 
                                      key={p} 
                                      onClick={() => {
                                        if (isActive) setWizNewTesterPlatforms(prev => prev.filter(x => x !== p));
                                        else setWizNewTesterPlatforms(prev => [...prev, p]);
                                      }}
                                      style={{
                                        padding: '4px 10px', fontSize: '11px', borderRadius: '999px', cursor: 'pointer',
                                        border: '1px solid',
                                        borderColor: isActive ? 'var(--accent)' : 'var(--line-strong)',
                                        background: isActive ? 'var(--accent-soft)' : 'var(--surface)',
                                        color: isActive ? 'var(--accent)' : 'var(--ink-soft)',
                                        fontFamily: '"JetBrains Mono", monospace'
                                      }}
                                    >
                                      {p} {isActive && '✓'}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        {uniqueTestersList.length > 0 && (
                          <div>
                            <div className="recent-label">Recently on your team</div>
                            <div className="recent-chips">
                              {uniqueTestersList.slice(0, 6).map((t, i) => {
                                const colors = ['#3d5a80', '#a6421f', '#6a4a7c', '#b8860b', '#4a7c59'];
                                return (
                                  <span key={t} className="recent-chip" onClick={() => addTester(t)}>
                                    <span className="mini-avatar" style={{ background: colors[i % colors.length] }}>{t.charAt(0)}</span>
                                    {t}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="roster-panel">
                        <div className="roster-head">
                          <span>Team Roster</span>
                          <span>{wizTesters.length} added {wizPlatforms.length > 0 ? `· ${wizTesters.reduce((sum, t) => sum + (t.platforms.length || 1), 0)} runs will be created` : ''}</span>
                        </div>

                        {wizPlatforms.length > 0 && wizTesters.length > 0 && (
                          <div className="platform-assign-grid" style={{ ['--platform-count' as any]: wizPlatforms.length }}>
                            <div className="pa-grid-head">
                              <div className="pa-grid-cell-label">Tester</div>
                              {wizPlatforms.map(p => (
                                <div key={p} className="pa-grid-cell-platform">{p}</div>
                              ))}
                            </div>
                            {wizTesters.map(t => (
                              <div key={t.name} className="pa-grid-row">
                                <div className="pa-grid-cell-tester">
                                  <div className="roster-avatar" style={{ background: t.color }}>
                                    {t.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="roster-name">{t.name}</span>
                                  <button className="roster-remove" onClick={() => removeTester(t.name)}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                  </button>
                                </div>
                                {wizPlatforms.map(p => {
                                  const isAssigned = t.platforms.includes(p);
                                  return (
                                    <button
                                      key={p}
                                      className={`pa-grid-cell-check${isAssigned ? ' checked' : ''}`}
                                      onClick={() => {
                                        setWizTesters(prev => prev.map(x =>
                                          x.name === t.name
                                            ? { ...x, platforms: isAssigned
                                                ? x.platforms.filter(y => y !== p)
                                                : [...x.platforms, p] }
                                            : x
                                        ));
                                        triggerSaved();
                                      }}
                                      aria-label={`${isAssigned ? 'Unassign' : 'Assign'} ${t.name} to ${p}`}
                                    >
                                      {isAssigned && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}

                        {wizPlatforms.length === 0 && wizTesters.length > 0 && (
                          <div className="roster-list">
                            {wizTesters.map(t => (
                              <div className="roster-item" key={t.name}>
                                <div className="roster-avatar" style={{ background: t.color }}>{t.name.charAt(0).toUpperCase()}</div>
                                <div className="roster-name">{t.name}</div>
                                <button className="roster-remove" onClick={() => removeTester(t.name)}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {wizTesters.length === 0 && (
                          <div className="roster-empty">
                            No testers yet — you can also skip this and assign later.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {wizStep === 5 && (
                    <div className="launch-celebration" ref={confettiContainerRef}>
                      <div className="launch-icon-wrap">
                        <svg className="launch-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <h2 className="launch-title">Project Launched</h2>
                      <p className="launch-sub">Your cycle is ready. Testers will see it in their dashboard shortly.</p>
                      <div className="launch-summary" style={{ gridTemplateColumns: wizPlatforms.length > 0 ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)' }}>
                        <div className="launch-cell"><div className="lc-label">Project</div><div className="lc-value">{wizName}</div></div>
                        <div className="launch-cell"><div className="lc-label">Tests</div><div className="lc-value">{scriptPath === 'manual' ? manualSteps.length : scriptPath === 'saved' ? savedScriptSteps.length : wizRawData.length}</div></div>
                        <div className="launch-cell">
                          <div className="lc-label">{wizPlatforms.length > 0 ? 'Runs' : 'Testers'}</div>
                          <div className="lc-value">
                            {wizPlatforms.length > 0
                              ? wizTesters.reduce((sum, t) => sum + t.platforms.length, 0) || '—'
                              : (wizTesters.length || '—')}
                          </div>
                        </div>
                        {wizPlatforms.length > 0 && (
                          <div className="launch-cell">
                            <div className="lc-label">Platforms</div>
                            <div className="lc-value">{wizPlatforms.length}</div>
                          </div>
                        )}
                        <div className="launch-cell"><div className="lc-label">Status</div><div className="lc-value" style={{ color: 'var(--pass)' }}>Ready</div></div>
                      </div>
                    </div>
                  )}
                </div>

                {wizStep < 5 ? (
                  <footer className="content-foot">
                    <div className="foot-hint">
                      <span className={`saved-indicator${wizSaved ? ' show' : ''}`}><span className="saved-dot" />Saved</span>
                      {wizStep !== 4 && <><span><kbd>Enter</kbd> continue</span><span><kbd>Esc</kbd> close</span></>}
                    </div>
                    <div className="foot-actions">
                      <button className="btn btn-ghost" onClick={() => setWizStep(p => p - 1)} style={{ visibility: wizStep > 1 ? 'visible' : 'hidden' }}>← Back</button>
                      {wizStep === 4 && <button className="btn btn-ghost" onClick={launchProject} disabled={isLaunching}>Skip</button>}
                      <button className="btn btn-primary" disabled={!canAdvance() || isLaunching} onClick={() => wizStep === 4 ? launchProject() : setWizStep(p => p + 1)}>
                        {isLaunching ? 'Creating...' : wizStep === 4 ? 'Launch Project' : 'Next Step →'}
                      </button>
                    </div>
                  </footer>
                ) : (
                  <footer className="content-foot" style={{ justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={closeWizard}>Back to Dashboard</button>
                  </footer>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}