"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, orderBy, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { TestResult, TestRunData, ProjectAggregate, AggregatedStep, TesterResultOnStep, TesterMessage, MessageThread, AIDraftedTicket, REFINEMENT_CHIPS, PendingTriageAction, PriorityPopoverState, JiraDraftingModalState, ContactModalState } from '@/types';
import { groupRunsByProject, aggregateProject, aggregateProjectByPlatform, colorForTester, initialsFor } from '@/lib/triageAggregation';
import { getProjectPlatforms, projectHasPlatforms } from '@/lib/platforms';
import { streamDrafts, refineDraft } from '@/lib/draft-client';
import { PageHead } from '@/components/PageHead';
import { QRCodeSVG } from 'qrcode.react';

type ExtendedTestResult = TestResult;

// --- MINIFIED CSS ---
const TRIAGE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
:root, .triage-v2 { --bg: #f4f3ef; --surface: #ffffff; --surface-alt: #fafaf7; --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f; --line: #e5e2db; --line-strong: #d4d0c7; --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329; --pass: #4a7c59; --pass-soft: #e8f0eb; --fail: #a6421f; --fail-soft: #f7e8e2; --warn: #b8860b; --warn-soft: #f9f0da; --info: #3d5a80; --info-soft: #e5ecf2; --amber: #b8860b; --amber-bright: #e8c888; --amber-deep: #947011; --amber-soft: #f9f0da; --jira: #0052cc; --jira-light: #2684ff; --ai: #7c4dff; --ai-soft: #ede5ff; --radius: 6px; }
.triage-v2 { font-family: 'IBM Plex Sans', system-ui, sans-serif; color: var(--ink); font-size: 14px; background: var(--bg); min-height: 100vh; } .triage-v2 * { box-sizing: border-box; } .app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
.main { padding: 32px 40px; max-width: 1400px; width: 100%; margin: 0 auto; overflow-x: hidden; }
.head-actions { display: flex; gap: 8px; } .btn { height: 38px; padding: 0 16px; font-family: inherit; font-size: 13px; font-weight: 500; border-radius: var(--radius); cursor: pointer; transition: all 0.15s ease; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; } .btn-ghost { background: transparent; border-color: var(--line-strong); color: var(--ink-soft); } .btn-ghost:hover:not(:disabled) { background: var(--surface); color: var(--ink); } .btn-primary { background: var(--accent); color: #fff; } .btn-primary:hover:not(:disabled) { background: var(--accent-ink); } .btn:disabled { opacity: 0.5; cursor: not-allowed; }
.stats-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 12px; margin-bottom: 24px; } .stat-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px; } .stat-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); margin-bottom: 10px; } .stat-big { display: flex; align-items: baseline; gap: 6px; } .stat-value { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 600; line-height: 1; letter-spacing: -0.02em; color: var(--ink); } .stat-unit { font-size: 12px; color: var(--ink-mute); }
.stat-results .segmented-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--line); margin-top: 14px; margin-bottom: 12px; } .segmented-bar > span { display: block; height: 100%; transition: width 0.5s ease; } .seg-pass { background: var(--pass); } .seg-fail { background: var(--fail); } .seg-pend { background: var(--line-strong); } .legend { display: flex; gap: 16px; font-size: 12px; } .legend-item { display: flex; align-items: center; gap: 6px; color: var(--ink-soft); } .legend-dot { width: 8px; height: 8px; border-radius: 50%; } .dot-pass { background: var(--pass); } .dot-fail { background: var(--fail); } .dot-pend { background: var(--line-strong); }
.stat-breakdown { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 14px; } .breakdown-item .bd-label { font-size: 11px; color: var(--ink-mute); margin-bottom: 2px; } .breakdown-item .bd-value { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink); }
.toolbar { display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 14px; margin-bottom: 20px; flex-wrap: wrap; } .toolbar-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); font-weight: 500; } .search { position: relative; flex: 1; min-width: 220px; } .search input { width: 100%; height: 34px; padding: 0 12px 0 34px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface-alt); font-family: inherit; font-size: 13px; color: var(--ink); } .search input:focus { outline: none; border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); } .search svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--ink-mute); } .select-compact { height: 34px; padding: 0 28px 0 12px; font-family: inherit; font-size: 13px; color: var(--ink-soft); background: var(--surface-alt); border: 1px solid var(--line); border-radius: var(--radius); cursor: pointer; appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2355524d' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 10px center; } .select-compact:focus { outline: none; border-color: var(--accent); }
.project-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; } .section-heading { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin: 0 0 12px; display: flex; align-items: center; gap: 10px; } .section-heading::after { content: ''; flex: 1; height: 1px; background: var(--line); } .section-heading .count { background: var(--surface); border: 1px solid var(--line); padding: 2px 8px; border-radius: 999px; color: var(--ink-soft); }
.project-row { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--line-strong); border-radius: var(--radius); padding: 16px 20px; display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: center; cursor: pointer; transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease; } .project-row:hover { border-color: var(--line-strong); box-shadow: 0 2px 6px rgba(0,0,0,0.04); } .project-row.status-fail { border-left-color: var(--fail); } .project-row.status-pass { border-left-color: var(--pass); } .project-row.status-pend { border-left-color: var(--warn); } .project-row.status-run { border-left-color: var(--info); } .project-row.status-pass-note { border-left-color: var(--pass); background: rgba(232,200,136,0.05); }
.project-name { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); } .project-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; } .project-meta { display: flex; gap: 14px; color: var(--ink-mute); font-size: 12px; flex-wrap: wrap; } .project-meta strong { font-weight: 500; color: var(--ink-soft); } .tag { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 8px; border-radius: 4px; background: var(--info-soft); color: var(--info); } .tag.muted { background: var(--line); color: var(--ink-mute); } .tag.platforms-tag { background: var(--accent-soft); color: var(--accent); }
.note-indicator { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; margin-left: 4px; background: rgba(232,200,136,0.2); border: 1px solid rgba(232,200,136,0.45); border-radius: 10px; color: var(--amber-deep); font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; } .note-indicator svg { width: 10px; height: 10px; } .note-indicator .count { background: rgba(232,200,136,0.4); padding: 0 5px; border-radius: 6px; font-size: 10px; }
.reply-indicator { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 4px; background: rgba(138,174,216,0.18); border: 1px solid rgba(61,90,128,0.3); border-radius: 10px; color: var(--info); font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; } .reply-indicator-dot { width: 14px; height: 14px; background: var(--info); color: #fff; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; } .reply-indicator-dot svg { width: 8px; height: 8px; } .reply-indicator .count { background: rgba(61,90,128,0.35); padding: 0 5px; border-radius: 6px; color: #fff; font-size: 10px; } .reply-indicator.has-new::after { content: ''; width: 5px; height: 5px; background: var(--info); border-radius: 50%; margin-left: 2px; animation: newPulse 2s ease-in-out infinite; }
@keyframes newPulse { 0% { transform: scale(0.8); opacity: 0.8; } 50% { transform: scale(1.5); opacity: 0; } 100% { transform: scale(0.8); opacity: 0; } }
.project-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 180px; } .status-badge { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 999px; } .status-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; } .status-badge.pass { background: var(--pass-soft); color: var(--pass); } .status-badge.fail { background: var(--fail-soft); color: var(--fail); } .status-badge.pend { background: var(--warn-soft); color: var(--warn); } .status-badge.run { background: var(--info-soft); color: var(--info); }
.progress-row { display: flex; align-items: center; gap: 10px; width: 220px; } .progress-track { flex: 1; height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; display: flex; } .progress-fill { height: 100%; display: flex; } .progress-fill .bar-pass { background: var(--pass); } .progress-fill .bar-fail { background: var(--fail); } .progress-fill .bar-info { background: var(--info); } .progress-label { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.panel-overlay { position: fixed; inset: 0; background: rgba(20, 20, 20, 0.4); opacity: 0; pointer-events: none; transition: opacity 0.2s ease; z-index: 1200; } .panel-overlay.open { opacity: 1; pointer-events: auto; } .side-panel { position: fixed; top: 0; right: 0; height: 100vh; width: 50vw; min-width: 600px; max-width: 1000px; background: var(--surface); border-left: 1px solid var(--line-strong); box-shadow: -12px 0 40px rgba(0,0,0,0.08); transform: translateX(100%); transition: transform 0.25s cubic-bezier(.4,.0,.2,1); display: flex; flex-direction: column; z-index: 1300; } .side-panel.open { transform: translateX(0); }
.panel-head { padding: 20px 24px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-shrink: 0; } .panel-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; color: var(--ink); } .panel-sub { color: var(--ink-mute); font-size: 12px; margin: 0; display: flex; gap: 10px; flex-wrap: wrap; } .close-btn { width: 32px; height: 32px; border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); transition: all 0.15s; } .close-btn:hover { background: var(--surface-alt); color: var(--ink); }
.tester-strip { padding: 14px 24px; border-bottom: 1px solid var(--line); background: var(--surface-alt); display: flex; align-items: center; gap: 14px; overflow-x: auto; flex-shrink: 0; } .tester-strip-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 500; flex-shrink: 0; } .tester-pills { display: flex; gap: 6px; flex: 1; flex-wrap: wrap; } .tester-pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px 4px 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; cursor: pointer; transition: all 0.15s; font-size: 12px; font-family: inherit; color: var(--ink); } .tester-pill:hover { border-color: var(--line-strong); background: #fff; } .tester-pill.active { background: var(--ink); border-color: var(--ink); color: #fff; } .tester-pill.has-issues { border-color: rgba(166,66,31,0.35); } .tester-pill.has-notes { border-color: rgba(232,200,136,0.5); } .tester-avatar { width: 22px; height: 22px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; letter-spacing: -0.02em; flex-shrink: 0; } .tester-pill.active .tester-avatar { background: rgba(255,255,255,0.15) !important; } .tester-pill-name { font-weight: 500; white-space: nowrap; } .tester-pill-counts { display: inline-flex; align-items: center; gap: 4px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); } .tester-pill.active .tester-pill-counts { color: rgba(255,255,255,0.7); } .tester-pill-counts .fail-count { color: var(--fail); font-weight: 600; } .tester-pill-counts .note-count { color: var(--amber-deep); font-weight: 600; } .tester-pill.active .tester-pill-counts .fail-count, .tester-pill.active .tester-pill-counts .note-count { color: #fff; }
.panel-summary { padding: 14px 24px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; border-bottom: 1px solid var(--line); background: var(--surface-alt); flex-shrink: 0; } .sc-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); margin-bottom: 2px; } .sc-value { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink); } .sc-value.pass { color: var(--pass); } .sc-value.fail { color: var(--fail); } .sc-value.notes { color: var(--amber-deep); } .sc-value.consensus { color: var(--accent); } .sc-value.pend { color: var(--warn); }
.panel-toolbar { padding: 12px 24px; display: flex; gap: 10px; align-items: center; border-bottom: 1px solid var(--line); flex-wrap: wrap; flex-shrink: 0; } .filter-chip { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 5px 10px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); border-radius: 999px; cursor: pointer; transition: all 0.15s; } .filter-chip:hover:not(.active) { background: var(--bg); } .filter-chip.active { background: var(--ink); color: #fff; border-color: var(--ink); } .filter-chip.notes-active { background: var(--amber); color: var(--amber-deep); border-color: var(--amber); } .platform-chip.active { background: var(--accent); border-color: var(--accent); }
.panel-body { flex: 1; overflow-y: auto; padding: 8px 0; } .step-row { border-bottom: 1px solid var(--line); transition: background 0.15s; } .step-row:hover { background: var(--surface-alt); } .step-row.expanded { background: var(--surface-alt); } .step-row.consensus-fail { background: rgba(166,66,31,0.025); } .step-row.consensus-fail.expanded { background: rgba(166,66,31,0.04); }
.step-row-head { padding: 16px 24px; display: grid; grid-template-columns: 70px 1fr 140px 130px; gap: 18px; align-items: center; cursor: pointer; } .step-num { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; color: var(--ink); letter-spacing: 0.06em; text-transform: uppercase; } .step-num-sub { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--ink-mute); letter-spacing: 0.08em; font-weight: 500; margin-top: 1px; } .step-platform-tag { display: inline-block; margin-top: 4px; padding: 2px 6px; background: var(--accent-soft); color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; border-radius: 3px; } .legacy-suffix { opacity: 0.6; font-style: italic; text-transform: none; }
.step-action { font-size: 14px; font-weight: 500; color: var(--ink); margin-bottom: 2px; } .step-expected { font-size: 12px; color: var(--ink-mute); display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.dot-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; max-width: 140px; position: relative; } .dot-grid-large { grid-template-columns: repeat(10, 1fr); max-width: 280px; gap: 3px; } .result-dot { width: 14px; height: 14px; border-radius: 4px; background: var(--line); position: relative; cursor: pointer; transition: transform 0.1s; } .result-dot:hover { transform: scale(1.25); z-index: 2; } .result-dot.pass { background: var(--pass); } .result-dot.fail { background: var(--fail); } .result-dot.pass-note { background: var(--amber); } .result-dot.pending { background: var(--line); border: 1px dashed var(--line-strong); } .result-dot[data-tooltip]:hover::after { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; padding: 5px 8px; border-radius: 4px; white-space: nowrap; pointer-events: none; z-index: 10; font-weight: 500; }
.step-row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 130px; } .consensus-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; border-radius: 999px; } .consensus-pill.fail { background: var(--fail-soft); color: var(--fail); border: 1px solid rgba(166,66,31,0.25); } .consensus-pill.pass { background: var(--pass-soft); color: var(--pass); } .consensus-pill.mixed, .consensus-pill.notes { background: var(--warn-soft); color: var(--warn); } .consensus-pill.pending { background: var(--surface); color: var(--ink-mute); border: 1px solid var(--line-strong); } .expand-chevron { width: 20px; height: 20px; color: var(--ink-mute); transition: transform 0.2s; } .step-row.expanded .expand-chevron { transform: rotate(180deg); }
.step-drill { padding: 0 24px 18px; display: flex; flex-direction: column; gap: 10px; animation: drillIn 0.25s cubic-bezier(.2,.6,.2,1); } @keyframes drillIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } } .drill-intro { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; font-size: 12.5px; color: var(--ink-soft); } .drill-intro strong { color: var(--ink); }
.tester-result { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; padding: 14px; background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--line-strong); border-radius: 6px; align-items: flex-start; } .tester-result.pass { border-left-color: var(--pass); } .tester-result.fail { border-left-color: var(--fail); } .tester-result.pass-note { border-left-color: var(--pass); background: rgba(232,200,136,0.04); }
.tr-avatar { width: 32px; height: 32px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; letter-spacing: -0.02em; flex-shrink: 0; } .tr-body { min-width: 0; } .tr-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; } .tr-name { font-size: 13px; font-weight: 500; color: var(--ink); } .tr-meta { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); letter-spacing: 0.06em; text-transform: uppercase; }
.tr-note { margin-top: 8px; padding: 8px 10px; border-radius: 5px; font-size: 12.5px; line-height: 1.5; color: var(--ink-soft); } .tr-note.fail-note { background: var(--fail-soft); border-left: 2px solid var(--fail); } .tr-note.amber-note { background: rgba(232,200,136,0.2); border-left: 2px solid var(--amber); } .tr-note-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; } .tr-note-chip { font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 1px 6px; background: rgba(255,255,255,0.7); border-radius: 3px; border: 1px solid rgba(166,66,31,0.25); color: var(--fail); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; } .tr-note-chip.amber { color: var(--amber-deep); border-color: rgba(232,200,136,0.4); } .tr-note-text { color: var(--ink-soft); } .tr-note-text.italic { font-family: 'Fraunces', serif; font-style: italic; color: var(--ink); }
.tr-evidence { display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap; } .ev-thumb { width: 48px; height: 36px; border-radius: 4px; background: var(--line); border: 1px solid var(--line-strong); overflow: hidden; cursor: zoom-in; } .ev-thumb img { width: 100%; height: 100%; object-fit: cover; }
.tr-actions { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; flex-shrink: 0; } .tr-status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; border-radius: 999px; } .tr-status-pill.pass { background: var(--pass-soft); color: var(--pass); } .tr-status-pill.fail { background: var(--fail-soft); color: var(--fail); } .tr-status-pill.pass-note { background: rgba(232,200,136,0.3); color: var(--amber-deep); }
.tr-contact-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; background: var(--surface); border: 1px solid var(--line); border-radius: 5px; color: var(--ink-soft); font-family: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer; transition: all 0.15s; } .tr-contact-btn:hover { border-color: var(--accent); color: var(--accent); } .tr-contact-btn svg { width: 11px; height: 11px; } .tr-contact-btn.has-unread { background: rgba(138,174,216,0.18); border-color: var(--info); color: var(--info); padding: 4px 9px 4px 5px; font-weight: 600; position: relative; } .tr-contact-btn.has-unread .unread-badge { background: var(--info); color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 1px 5px; border-radius: 4px; margin-right: 4px; letter-spacing: 0.04em; } .tr-contact-btn.has-unread::before { content: ''; position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; background: var(--info); border-radius: 50%; border: 1.5px solid var(--surface); animation: newPulse 2s ease-in-out infinite; } .tr-contact-btn.has-read { background: var(--info-soft); border-color: rgba(61,90,128,0.3); color: var(--info); }
.triage-col { min-width: 120px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; position: relative; } .triage-btn { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 14px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 6px; color: var(--ink); font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; white-space: nowrap; } .triage-btn:hover { background: var(--ink); color: #fff; border-color: var(--ink); } .triage-btn svg { width: 11px; height: 11px; transition: transform 0.2s; } .triage-btn.open { background: var(--ink); color: #fff; border-color: var(--ink); } .triage-btn.open svg { transform: rotate(180deg); }
.triage-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; min-width: 240px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04); padding: 6px; display: flex; flex-direction: column; gap: 2px; animation: menuIn 0.15s cubic-bezier(.2,.6,.2,1); } @keyframes menuIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.menu-item { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 8px 10px; background: transparent; border: none; border-radius: 5px; cursor: pointer; text-align: left; transition: background 0.1s; font-family: inherit; font-size: 13px; color: var(--ink); } .menu-item:hover { background: var(--surface-alt); } .menu-item .menu-icon { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; border-radius: 4px; } .menu-item.ticket .menu-icon { background: var(--pass-soft); color: var(--pass); } .menu-item.snooze .menu-icon { background: var(--info-soft); color: var(--info); } .menu-item.reviewed .menu-icon { background: var(--surface-alt); color: var(--ink-soft); border: 1px solid var(--line); } .menu-item.dismiss .menu-icon { background: var(--fail-soft); color: var(--fail); } .menu-icon svg { width: 13px; height: 13px; } .menu-label { font-size: 13px; font-weight: 500; color: var(--ink); } .menu-desc { font-size: 11.5px; color: var(--ink-mute); margin-top: 1px; } .menu-divider { height: 1px; background: var(--line); margin: 4px 4px; }
.priority-popover { position: absolute; top: calc(100% + 6px); right: 0; z-index: 60; min-width: 260px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; box-shadow: 0 12px 32px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.05); padding: 14px 14px 12px; animation: menuIn 0.2s cubic-bezier(.2,.6,.2,1); } .pp-title { font-size: 13px; font-weight: 500; color: var(--ink); margin: 0 0 2px; } .pp-sub { font-size: 11px; color: var(--ink-mute); margin: 0 0 10px; } .pp-options { display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; } .pp-option { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: transparent; border: 1px solid transparent; border-radius: 5px; cursor: pointer; text-align: left; transition: all 0.1s; font-family: inherit; font-size: 13px; color: var(--ink); } .pp-option:hover { background: var(--surface-alt); border-color: var(--line); } .pp-option.selected { background: var(--accent-soft); border-color: var(--accent); } .pp-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; } .pp-option-label { font-weight: 500; flex: 1; } .pp-option-tag { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); } .pp-actions { display: flex; gap: 8px; padding-top: 10px; border-top: 1px solid var(--line); } .pp-btn { flex: 1; padding: 8px 12px; border-radius: 5px; font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; } .pp-btn.cancel { background: transparent; border-color: var(--line-strong); color: var(--ink-soft); } .pp-btn.cancel:hover { background: var(--surface-alt); color: var(--ink); } .pp-btn.confirm { background: var(--accent); color: #fff; } .pp-btn.confirm:hover { background: var(--accent-ink); }
.triaged-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 999px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; } .triaged-chip.ticketed { color: var(--pass); background: var(--pass-soft); border-color: rgba(74,124,89,0.3); } .triaged-chip.snoozed { color: var(--info); background: var(--info-soft); border-color: rgba(61,90,128,0.3); } .triaged-chip.reviewed { color: var(--ink-soft); } .triaged-chip.dismissed { color: var(--fail); background: var(--fail-soft); border-color: rgba(166,66,31,0.3); } .triaged-chip .pri-dot { width: 6px; height: 6px; border-radius: 50%; } .undo-link { font-size: 11px; color: var(--ink-mute); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; margin-top: 2px; } .undo-link:hover { color: var(--accent); }
.step-triage-bar { margin-top: 8px; padding: 12px 14px; background: var(--ink); color: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; gap: 14px; position: relative; } .stb-text { font-size: 12.5px; color: rgba(255,255,255,0.75); min-width: 0; display: flex; flex-direction: column; gap: 2px; } .stb-text strong { color: #fff; font-weight: 500; } .stb-sub { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.5); } .stb-actions { display: flex; gap: 6px; } .stb-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-family: inherit; font-size: 12px; font-weight: 500; border-radius: 5px; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; white-space: nowrap; } .stb-btn.primary { background: var(--amber); color: #3a2e0a; } .stb-btn.primary:hover { background: #f0d499; } .stb-btn.ghost { background: transparent; border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.85); } .stb-btn.ghost:hover { border-color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.05); }
.jira-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px 6px 8px; background: rgba(0,82,204,0.08); border: 1px solid rgba(0,82,204,0.3); border-radius: 8px; color: var(--jira); font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; text-decoration: none; cursor: pointer; transition: all 0.15s; } .jira-pill:hover { background: rgba(0,82,204,0.14); transform: translateY(-1px); } .jira-pill-icon { width: 18px; height: 18px; background: linear-gradient(135deg, var(--jira) 0%, var(--jira-light) 100%); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 700; } .jira-pill-arrow { opacity: 0.6; transition: transform 0.15s; } .jira-pill:hover .jira-pill-arrow { transform: translateX(2px); opacity: 1; } .jira-pill.resolved { background: rgba(74,124,89,0.08); border-color: rgba(74,124,89,0.3); color: var(--pass); } .jira-pill.resolved .jira-pill-icon { background: var(--pass); }
.panel-foot { padding: 14px 24px; border-top: 1px solid var(--line); background: var(--surface-alt); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; } .bulk-label { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-mute); }
.tester-profile-overlay { position: fixed; inset: 0; background: rgba(20, 20, 20, 0.4); z-index: 1400; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; } .tester-profile-overlay.open { opacity: 1; pointer-events: auto; } .tester-profile { position: fixed; top: 0; right: 0; height: 100vh; width: 380px; background: var(--surface); box-shadow: -12px 0 40px rgba(0,0,0,0.12); z-index: 1500; display: flex; flex-direction: column; overflow-y: auto; transform: translateX(100%); transition: transform 0.25s cubic-bezier(.4,0,.2,1); } .tester-profile.open { transform: translateX(0); } .profile-head { padding: 20px; background: var(--accent); color: #fff; display: flex; align-items: center; gap: 14px; } .profile-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; letter-spacing: -0.02em; flex-shrink: 0; } .profile-name { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; } .profile-meta { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin-top: 3px; } .profile-close { background: rgba(255,255,255,0.15); border: none; color: #fff; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; } .profile-close:hover { background: rgba(255,255,255,0.25); }
.profile-stats { padding: 14px 20px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: var(--surface-alt); border-bottom: 1px solid var(--line); } .ps-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 2px; } .ps-value { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; color: var(--ink); } .ps-value.fail { color: var(--fail); } .ps-value.note { color: var(--amber-deep); }
.profile-actions { padding: 14px 20px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--line); } .pa-heading { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 500; margin-bottom: 4px; } .pa-btn { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 6px; color: var(--ink); font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; text-align: left; } .pa-btn:hover { background: #fff; border-color: var(--line-strong); } .pa-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--accent-soft); color: var(--accent); } .pa-btn.in-app .pa-icon { background: var(--info-soft); color: var(--info); } .pa-label { font-size: 13px; font-weight: 500; color: var(--ink); } .pa-sub { font-size: 11.5px; color: var(--ink-mute); margin-top: 1px; }
.profile-issues { padding: 14px 20px; } .pi-heading { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 500; margin-bottom: 10px; } .pi-item { padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; gap: 10px; cursor: pointer; } .pi-item:hover .pi-action { color: var(--accent); } .pi-item:last-child { border-bottom: none; } .pi-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; } .pi-dot.fail { background: var(--fail); } .pi-dot.pass-note { background: var(--amber); } .pi-content { min-width: 0; flex: 1; } .pi-step { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; } .pi-action { font-size: 12.5px; color: var(--ink); font-weight: 500; transition: color 0.15s; }
.cm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 28px; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; } .cm-overlay.open { opacity: 1; pointer-events: auto; } .contact-modal { max-width: 540px; width: 100%; margin: 0 auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.08); max-height: 720px; display: flex; flex-direction: column; transform: scale(0.95); transition: transform 0.2s cubic-bezier(.2,.6,.2,1); } .cm-overlay.open .contact-modal { transform: scale(1); } .cm-head { padding: 18px 22px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-shrink: 0; } .cm-head-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; margin: 0 0 2px; } .cm-head-sub { font-size: 12px; color: var(--ink-mute); margin: 0; } .cm-head-sub strong { color: var(--ink-soft); font-weight: 500; } .cm-close { width: 28px; height: 28px; border: 1px solid var(--line); background: var(--surface); border-radius: 5px; color: var(--ink-mute); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; } .cm-close:hover { color: var(--ink); background: var(--surface-alt); } .cm-context-bar { padding: 10px 22px; background: var(--surface-alt); border-bottom: 1px solid var(--line); font-size: 11.5px; color: var(--ink-soft); display: flex; align-items: center; gap: 8px; } .cm-context-bar svg { color: var(--amber); flex-shrink: 0; } .cm-context-bar strong { color: var(--ink); font-weight: 500; }
.cm-thread { flex: 1; overflow-y: auto; padding: 18px 22px; display: flex; flex-direction: column; gap: 12px; } .msg-bubble { max-width: 82%; padding: 10px 13px; border-radius: 10px; font-size: 13px; line-height: 1.5; position: relative; } .msg-bubble-meta { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px; opacity: 0.8; display: flex; align-items: center; gap: 6px; } .msg-bubble-body { white-space: pre-wrap; word-break: break-word; } .msg-bubble.from-pm { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 3px; } .msg-bubble.from-pm .msg-bubble-meta { color: rgba(255,255,255,0.75); } .msg-bubble.from-tester { align-self: flex-start; background: var(--surface-alt); border: 1px solid var(--line); color: var(--ink); border-bottom-left-radius: 3px; } .msg-bubble.from-tester .msg-bubble-meta { color: var(--ink-mute); } .msg-bubble.from-tester.unread { border-color: var(--info); background: rgba(138,174,216,0.1); box-shadow: 0 0 0 1px var(--info-soft); } .msg-bubble.from-tester.unread .unread-dot { width: 6px; height: 6px; background: var(--info); border-radius: 50%; display: inline-block; }
.original-note { align-self: stretch; padding: 10px 12px; background: rgba(232,200,136,0.1); border-left: 3px solid var(--amber); border-radius: 4px; font-size: 12px; color: var(--ink-soft); margin-bottom: 4px; } .original-note-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--amber-deep); font-weight: 500; margin-bottom: 4px; } .original-note-body { font-family: 'Fraunces', serif; font-style: italic; line-height: 1.5; color: var(--ink); } .original-note-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; } .original-note-chip { font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 1px 6px; background: rgba(255,255,255,0.7); border: 1px solid rgba(232,200,136,0.4); color: var(--amber-deep); border-radius: 3px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
.cm-reply-area { padding: 14px 22px; border-top: 1px solid var(--line); background: var(--surface-alt); flex-shrink: 0; } .cm-reply-textarea { width: 100%; min-height: 64px; padding: 10px 12px; font-family: inherit; font-size: 13px; line-height: 1.5; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); resize: vertical; margin-bottom: 10px; } .cm-reply-textarea:focus { outline: none; border-color: var(--accent); } .cm-reply-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; } .cm-reply-note { font-size: 11px; color: var(--ink-mute); } .cm-reply-btn { padding: 7px 14px; background: var(--accent); color: #fff; border: none; border-radius: 6px; font-family: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; } .cm-reply-btn:hover:not(:disabled) { background: var(--accent-ink); }
.contact-modal.compose-mode .cm-thread { padding: 0; } .compose-body { padding: 18px 22px; } .cm-compose-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 500; margin-bottom: 6px; } .cm-compose-textarea { width: 100%; min-height: 96px; padding: 10px 12px; font-family: inherit; font-size: 13px; line-height: 1.5; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); resize: vertical; margin-bottom: 14px; }
.cm-channel-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 4px; } .cm-channel { padding: 12px; background: var(--surface); border: 1.5px solid var(--line); border-radius: 8px; cursor: pointer; transition: all 0.15s; text-align: left; font-family: inherit; } .cm-channel:hover { border-color: var(--line-strong); background: var(--surface-alt); } .cm-channel.selected { background: var(--accent-soft); border-color: var(--accent); } .cm-channel-icon { width: 28px; height: 28px; border-radius: 6px; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; margin-bottom: 8px; } .cm-channel.mailto .cm-channel-icon { background: var(--accent-soft); color: var(--accent); } .cm-channel-name { font-size: 13px; font-weight: 500; color: var(--ink); margin-bottom: 2px; } .cm-channel-desc { font-size: 11.5px; color: var(--ink-mute); }
.ai-modal { width: 100%; height: 82vh; min-height: 600px; max-height: 900px; background: var(--surface-alt); display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; } .ai-modal-head { padding: 18px 24px; background: var(--surface); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 20px; } .head-left { display: flex; align-items: center; gap: 14px; } .ai-mark { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, var(--ai) 0%, #5a32d9 100%); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(124,77,255,0.25); position: relative; overflow: hidden; } .ai-mark::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.3) 50%, transparent 60%); animation: aiShine 3s ease-in-out infinite; } @keyframes aiShine { 0%, 100% { transform: translateX(-120%); } 50% { transform: translateX(120%); } } .head-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; letter-spacing: -0.015em; margin: 0 0 2px; } .head-title em { font-style: italic; color: var(--ai); font-weight: 500; } .head-sub { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 500; } .head-stat { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); padding: 4px 10px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 999px; } .head-stat strong { color: var(--ink); font-weight: 600; }
.ai-modal-body { display: grid; grid-template-columns: 320px 1fr; overflow: hidden; min-height: 0; } .ai-modal-body.with-sources { grid-template-columns: 260px 1fr 360px; }
.list-panel { background: var(--surface); border-right: 1px solid var(--line); overflow-y: auto; display: flex; flex-direction: column; } .list-head { padding: 14px 18px 10px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; } .list-label { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 600; } .list-progress { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--accent); font-weight: 600; background: var(--accent-soft); padding: 2px 8px; border-radius: 999px; } .list-items { flex: 1; padding: 6px; } .list-item { padding: 12px; border-radius: 7px; cursor: pointer; margin-bottom: 2px; transition: background 0.15s; border: 1px solid transparent; position: relative; } .list-item:hover { background: var(--surface-alt); } .list-item.active { background: var(--accent-soft); border-color: rgba(45,74,62,0.2); } .list-item.approved { background: rgba(74,124,89,0.05); }
.li-status-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; } .li-status { display: inline-flex; align-items: center; gap: 4px; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; padding: 2px 6px; border-radius: 3px; } .li-status.drafting { background: var(--ai-soft); color: var(--ai); } .li-status.drafting::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--ai); animation: livePulse 1.2s ease-in-out infinite; } .li-status.queued { background: var(--line); color: var(--ink-mute); opacity: 0.7; } .li-status.ready { background: var(--info-soft); color: var(--info); } .li-status.refining { background: var(--warn-soft); color: var(--warn); } .li-status.approved { background: var(--pass-soft); color: var(--pass); } .li-status.approved::before { content: '✓'; font-family: 'IBM Plex Sans', sans-serif; font-size: 10px; font-weight: 700; } .li-step-num { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; margin-left: auto; } .li-platform { color: var(--accent); font-weight: 600; } .li-title { font-size: 13px; font-weight: 500; color: var(--ink); margin-bottom: 4px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } .list-item.active .li-title { color: var(--accent-ink); font-weight: 600; } .li-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 11px; color: var(--ink-mute); } .li-priority-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; } .li-priority-dot.high { background: var(--fail); } .li-priority-dot.medium { background: var(--warn); } .li-priority-dot.low { background: var(--info); } .li-priority-text { font-weight: 500; color: var(--ink-soft); }
.li-shimmer { height: 12px; border-radius: 3px; background: linear-gradient(90deg, var(--line) 0%, var(--line-strong) 50%, var(--line) 100%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; margin-top: 6px; } .li-shimmer.short { width: 60%; } @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } } @keyframes livePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
.loading-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 40px; height: 100%; background: var(--surface-alt); } .loading-mark { width: 80px; height: 80px; border-radius: 20px; background: linear-gradient(135deg, var(--ai) 0%, #5a32d9 100%); color: #fff; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; box-shadow: 0 16px 40px rgba(124,77,255,0.3); position: relative; overflow: hidden; animation: loadingPulse 2s ease-in-out infinite; } @keyframes loadingPulse { 0%, 100% { transform: scale(1); box-shadow: 0 16px 40px rgba(124,77,255,0.3); } 50% { transform: scale(1.04); box-shadow: 0 20px 48px rgba(124,77,255,0.5); } } .loading-mark::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%); animation: aiShine 2.5s ease-in-out infinite; } .loading-title { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 500; letter-spacing: -0.02em; margin: 0 0 8px; } .loading-title em { font-style: italic; color: var(--ai); font-weight: 500; } .loading-sub { font-size: 14px; color: var(--ink-soft); margin: 0 0 28px; max-width: 420px; } .loading-progress { display: flex; flex-direction: column; gap: 8px; max-width: 360px; width: 100%; text-align: left; } .lp-step { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 7px; font-size: 12.5px; color: var(--ink-soft); transition: all 0.3s; } .lp-step.done { background: var(--pass-soft); border-color: rgba(74,124,89,0.3); color: var(--pass); } .lp-step.active { background: var(--ai-soft); border-color: rgba(124,77,255,0.3); color: var(--ai); } .lp-step-icon { width: 18px; height: 18px; border-radius: 50%; background: var(--line); display: flex; align-items: center; justify-content: center; flex-shrink: 0; } .lp-step.done .lp-step-icon { background: var(--pass); color: #fff; } .lp-step.active .lp-step-icon { background: var(--ai); color: #fff; animation: livePulse 1.2s ease-in-out infinite; } .lp-step-icon svg { width: 10px; height: 10px; }
.draft-column { background: var(--surface-alt); overflow-y: auto; padding: 28px 32px; min-height: 0; position: relative; } .detail-meta-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; } .detail-tag { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; padding: 2px 8px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; } .detail-tag.bug { background: var(--fail-soft); color: var(--fail); } .detail-tag.step { background: var(--surface); color: var(--ink-mute); border: 1px solid var(--line); } .detail-tag.testers { background: var(--info-soft); color: var(--info); } .detail-tag.priority { display: inline-flex; align-items: center; gap: 5px; } .detail-tag.priority::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--priority-dot-color, var(--fail)); } .detail-tag.ai-drafted { background: var(--ai-soft); color: var(--ai); display: inline-flex; align-items: center; gap: 5px; } .detail-tag.ai-drafted::before { content: '✦'; font-size: 10px; } .detail-title { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; line-height: 1.2; letter-spacing: -0.02em; color: var(--ink); margin: 0 0 24px; } .section-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-mute); font-weight: 600; margin: 24px 0 8px; display: flex; align-items: center; gap: 8px; } .section-label:first-child { margin-top: 0; } .section-label::before { content: ''; width: 14px; height: 1px; background: var(--ink-mute); } .section-label.ai { color: var(--ai); } .section-label.ai::before { background: var(--ai); } .detail-tag-platform { background: var(--accent-soft); color: var(--accent); }
.content-block { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; font-size: 14px; line-height: 1.6; color: var(--ink); margin-bottom: 12px; transition: border-color 0.15s; white-space: pre-wrap; } .content-block:hover { border-color: var(--line-strong); } .content-block ul, .content-block ol { margin: 0; padding-left: 20px; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; } .meta-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; } .meta-card-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 600; margin-bottom: 6px; } .meta-card-content { font-size: 13px; color: var(--ink); line-height: 1.5; white-space: pre-wrap; }
.severity-row { display: flex; gap: 6px; flex-wrap: wrap; } .severity-chip { padding: 4px 10px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 999px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; color: var(--ink-soft); font-weight: 500; transition: all 0.15s; display: inline-flex; align-items: center; gap: 5px; } .severity-chip:hover { background: var(--surface-alt); color: var(--ink); } .severity-chip.selected { background: var(--ink); color: #fff; border-color: var(--ink); } .severity-chip-dot { width: 6px; height: 6px; border-radius: 50%; } .severity-chip.selected .severity-chip-dot { box-shadow: 0 0 0 1.5px rgba(255,255,255,0.4); } .ai-suggestion { margin-top: 8px; padding: 10px 12px; background: var(--ai-soft); border: 1px solid rgba(124,77,255,0.2); border-radius: 7px; font-size: 12px; color: var(--ai); display: flex; align-items: flex-start; gap: 8px; } .ai-suggestion::before { content: '✦'; font-size: 13px; line-height: 1.5; flex-shrink: 0; }
.synth { border-bottom: 1px dotted var(--ai); cursor: pointer; background: rgba(124,77,255,0.03); padding: 0 2px; transition: all 0.15s; position: relative; } .synth:hover, .synth.active { background: rgba(124,77,255,0.12); border-bottom-style: solid; } .synth.active { box-shadow: 0 0 0 1px rgba(124,77,255,0.3); border-radius: 3px; } .synth-count { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 9px; background: var(--ai); color: #fff; padding: 0 4px; border-radius: 3px; margin-left: 3px; font-weight: 600; vertical-align: super; line-height: 1.4; }
.citation-hint { position: absolute; top: 24px; right: 24px; background: var(--ai-soft); border: 1px solid rgba(124,77,255,0.3); color: var(--ai); padding: 6px 10px 6px 8px; border-radius: 999px; font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; z-index: 4; } .citation-hint::before { content: '✦'; font-size: 11px; }
.sources-column { background: var(--surface); border-left: 1px solid var(--line); overflow-y: auto; padding: 0; min-height: 0; position: relative; } .sources-head { padding: 16px 20px 12px; border-bottom: 1px solid var(--line); background: var(--surface-alt); position: sticky; top: 0; z-index: 2; } .sources-head-title { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-mute); font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; } .sources-head-title::before { content: ''; width: 14px; height: 1px; background: var(--ink-mute); } .sources-list { padding: 14px 16px 24px; display: flex; flex-direction: column; gap: 10px; } .source-card { background: var(--surface-alt); border: 1px solid var(--line); border-left: 3px solid var(--line-strong); border-radius: 8px; padding: 12px 14px; transition: all 0.2s cubic-bezier(.2,.6,.2,1); position: relative; cursor: pointer; } .source-card.fail { border-left-color: var(--fail); } .source-card.pass-note { border-left-color: var(--amber); background: rgba(232,200,136,0.04); } .source-card.pass { border-left-color: var(--pass); opacity: 0.6; } .source-card.connected { border-color: var(--ai); background: rgba(124,77,255,0.04); transform: translateX(-2px); box-shadow: -4px 0 0 var(--ai), 0 4px 12px rgba(124,77,255,0.12); } .source-card.dimmed { opacity: 0.32; filter: saturate(0.5); }
.sc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; } .sc-avatar { width: 26px; height: 26px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; letter-spacing: -0.02em; flex-shrink: 0; } .sc-name { font-size: 12.5px; font-weight: 600; color: var(--ink); } .sc-status { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 2px 7px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; } .sc-status.fail { background: var(--fail-soft); color: var(--fail); } .sc-status.note { background: var(--amber-soft); color: var(--amber-deep); } .sc-device { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); letter-spacing: 0.04em; margin-bottom: 8px; } .sc-quote { font-family: 'Fraunces', serif; font-style: italic; font-size: 12.5px; line-height: 1.5; color: var(--ink); }
.connector-svg { position: absolute; inset: 0; pointer-events: none; z-index: 5; overflow: visible; } .connector-path { fill: none; stroke: var(--ai); stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.7; animation: dashFlow 1.4s linear infinite; } @keyframes dashFlow { from { stroke-dashoffset: 14; } to { stroke-dashoffset: 0; } } .connector-dot { fill: var(--ai); r: 3; }
.refine-bar { background: var(--surface); border-top: 1px solid var(--line); padding: 14px 36px 16px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; } .refine-label { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ai); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; } .refine-label::before { content: '✦'; } .refine-chips { display: flex; gap: 6px; flex-wrap: wrap; } .refine-chip { padding: 5px 10px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 999px; font-size: 11.5px; color: var(--ink-soft); cursor: pointer; font-family: inherit; transition: all 0.15s; } .refine-chip:hover { background: var(--ai-soft); color: var(--ai); border-color: rgba(124,77,255,0.3); } .refine-input-row { display: flex; gap: 8px; } .refine-input { flex: 1; height: 38px; padding: 0 12px 0 36px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); font-family: inherit; font-size: 13px; color: var(--ink); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='%237c4dff'%3E%3Cpath d='M12 0l2.5 7L22 8.5l-5.5 5.3L18 22l-6-3.5L6 22l1.5-8.2L2 8.5 9.5 7z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: 12px center; } .refine-input:focus { outline: none; border-color: var(--ai); box-shadow: 0 0 0 3px rgba(124,77,255,0.1); } .refine-send { height: 38px; padding: 0 14px; background: var(--ai); color: #fff; border: none; border-radius: 8px; font-family: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.ai-modal-foot { padding: 16px 24px; background: var(--surface); border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; } .foot-status { display: flex; align-items: center; gap: 14px; } .foot-counter { font-size: 13px; color: var(--ink-soft); } .foot-counter strong { color: var(--ink); font-weight: 600; } .approve-mini { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--pass-soft); color: var(--pass); border: 1px solid rgba(74,124,89,0.25); border-radius: 7px; font-family: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; } .foot-actions { display: flex; gap: 8px; } .foot-btn { padding: 0 18px; height: 42px; border-radius: 8px; font-family: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border: 1px solid transparent; } .foot-btn.ghost { background: transparent; border-color: var(--line-strong); color: var(--ink-soft); } .foot-btn.ghost:hover { background: var(--surface-alt); color: var(--ink); } .foot-btn.primary { background: var(--jira); color: #fff; } .foot-btn.primary[disabled] { opacity: 0.4; cursor: not-allowed; } .foot-btn .jira-mark { width: 16px; height: 16px; background: linear-gradient(135deg, #fff 0%, #e0ecff 100%); color: var(--jira); border-radius: 3px; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; }
.toast-success { position: fixed; top: 24px; right: 24px; background: var(--ink); color: #fff; padding: 14px 18px; border-radius: 10px; display: flex; align-items: center; gap: 12px; box-shadow: 0 16px 40px rgba(0,0,0,0.2); animation: toastIn 0.4s cubic-bezier(.2,.6,.2,1); max-width: 380px; z-index: 2000; } @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } } .toast-icon { width: 36px; height: 36px; background: var(--pass); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; } .toast-content { flex: 1; min-width: 0; } .toast-title { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 600; margin-bottom: 2px; } .toast-title em { font-style: italic; color: var(--amber-bright); font-weight: 500; } .toast-sub { font-size: 11.5px; color: rgba(255,255,255,0.7); }
.sc-evidence-row { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; } .sc-evidence { width: 36px; height: 28px; border-radius: 4px; background: var(--surface); border: 1px solid var(--line-strong); display: flex; align-items: center; justify-content: center; color: var(--ink-soft); cursor: zoom-in; transition: all 0.15s; } .sc-evidence:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); } .sc-evidence svg { width: 14px; height: 14px; }
`;

// Inject the CSS once, outside the component, into <head>.
// Doing this here means it's parsed exactly once for the lifetime of the app.
if (typeof document !== 'undefined' && !document.getElementById('triage-v2-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'triage-v2-styles';
  styleEl.textContent = TRIAGE_CSS;
  document.head.appendChild(styleEl);
}

// Helper interface to split steps by platform natively in UI
interface SplitStepRow {
  step: AggregatedStep;
  platform?: string; // absent for non-platformed projects
  key: string; // `${stepId}::${platform || 'all'}`
}

// 7g: Tester Platform Option
interface TesterPlatformOption {
  id: string; // runId
  testerId: string;
  testerName: string;
  platform?: string;
  initials: string;
  color: string;
  failCount: number;
  passNoteCount: number;
}

const getMediaType = (url: string) => {
  if (!url) return 'image';
  return url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i) ? 'video' : 'image';
};

export default function PMTriageDashboard() {
  const router = useRouter();
  
  const [hydrated, setHydrated] = useState(false);
  const [currentYear, setCurrentYear] = useState('');

  const [testRuns, setTestRuns] = useState<TestRunData[]>([]);
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);

  const [allMessages, setAllMessages] = useState<TesterMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState<string>('All projects');
  const [filterCycle, setFilterCycle] = useState<string>('All cycles');
  const [filterTester, setFilterTester] = useState<string>('All testers');
  
  const [activeProjectKey, setActiveProjectKey] = useState<string | null>(null);
  const [displayKey, setDisplayKey] = useState<string | null>(null);
  
  // 7b: Add platform filter state
  const [panelPlatformFilter, setPanelPlatformFilter] = useState<string | 'all'>('all');
  const [panelFilter, setPanelFilter] = useState<'all' | 'fail' | 'mixed' | 'notes' | 'passed'>('all');
  
  const [selectedTesterId, setSelectedTesterId] = useState<string | 'everyone'>('everyone');
  const [showTesterProfile, setShowTesterProfile] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const [pendingTriage, setPendingTriage] = useState<Record<string, PendingTriageAction>>({});
  const [savedTriage, setSavedTriage] = useState<Record<string, PendingTriageAction>>({});

  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
  const [priorityPopover, setPriorityPopover] = useState<PriorityPopoverState | null>(null);
  const [stepPriorityPopover, setStepPriorityPopover] = useState<PriorityPopoverState | null>(null);
  const [selectedBugs, setSelectedBugs] = useState<string[]>([]);
  
  const [draftingModal, setDraftingModal] = useState<JiraDraftingModalState>({ open: false, tickets: [], activeTicketId: null, refining: false, pushing: false });
  const [refineInput, setRefineInput] = useState('');
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [successToast, setSuccessToast] = useState<{show: boolean, keys: string[]}>({show: false, keys: []});

  const [contactModal, setContactModal] = useState<ContactModalState | null>(null);
  const [contactMessage, setContactMessage] = useState('');
  const [contactChannel, setContactChannel] = useState<'in-app' | 'mailto'>('in-app');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [uploadToken, setUploadToken] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [qrTarget, setQrTarget] = useState<{runId: string, stepId: string, currentResult: ExtendedTestResult | undefined} | null>(null);

  useEffect(() => { 
    setHydrated(true); 
    setCurrentYear(new Date().getFullYear().toString());
  }, []);

  useEffect(() => {
    if (activeProjectKey) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [activeProjectKey]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'testRuns'), (snapshot) => {
      const runsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as TestRunData[];
      runsData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });
      setTestRuns(prev => {
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

  useEffect(() => {
    const q = query(collection(db, 'testerMessages'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as TesterMessage[];
      
      setAllMessages(prev => {
        if (prev.length !== next.length) return next;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].id !== next[i].id) return next;
          if (JSON.stringify(prev[i]) !== JSON.stringify(next[i])) return next;
        }
        return prev;
      });

      setMessagesLoaded(true);
    }, (error) => {
      console.error('Messages subscription error:', error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (contactModal) {
      setContactMessage('');
      setContactChannel(contactModal.initialChannel || 'in-app');
    }
  }, [contactModal]);

  useEffect(() => {
    if (!openDropdownKey && !priorityPopover && !stepPriorityPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.triage-col') && !target.closest('.step-triage-bar')) {
        setOpenDropdownKey(null);
        setPriorityPopover(null);
        setStepPriorityPopover(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdownKey(null);
        setPriorityPopover(null);
        setStepPriorityPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openDropdownKey, priorityPopover, stepPriorityPopover]);

  const activeProject = useMemo<ProjectAggregate | null>(() => {
    if (!displayKey) return null;
    const grouped = groupRunsByProject(testRuns);
    const projectRuns = grouped.get(displayKey) || [];
    if (projectRuns.length === 0) return null;
    return aggregateProject(projectRuns);
  }, [displayKey, testRuns]);

  // 7a: Platform-aware activeProject derivation
  const activeProjectPlatforms = useMemo<string[]>(() => {
    if (!displayKey) return [];
    const grouped = groupRunsByProject(testRuns);
    const projectRuns = grouped.get(displayKey) || [];
    return getProjectPlatforms(projectRuns);
  }, [displayKey, testRuns]);

  const activeProjectIsPlatformed = activeProjectPlatforms.length > 0;

  const closeProject = () => {
    setActiveProjectKey(null);
    setTimeout(() => {
      setDisplayKey(null);
    }, 250); 
  };

  const threadsByRunId = useMemo<Record<string, MessageThread[]>>(() => {
    const byRun: Record<string, TesterMessage[]> = {};
    allMessages.forEach(msg => {
      if (!byRun[msg.runId]) byRun[msg.runId] = [];
      byRun[msg.runId].push(msg);
    });
  
    const result: Record<string, MessageThread[]> = {};
    Object.entries(byRun).forEach(([runId, msgs]) => {
      const rootMessages = msgs.filter(m => m.direction === 'pm_to_tester');
      result[runId] = rootMessages.map(root => {
        const replies = msgs
          .filter(m => m.direction === 'tester_to_pm' && m.parentMessageId === root.id)
          .sort((a, b) => a.createdAt - b.createdAt);
        const hasUnreadReplies = replies.some(r => !r.readByPm);
        return { root, replies, isRead: !hasUnreadReplies, hasReply: replies.length > 0 };
      });
    });
    return result;
  }, [allMessages]);

  const unreadRepliesByProject = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    Object.values(threadsByRunId).flat().forEach(thread => {
      if (!thread.isRead && thread.hasReply) {
        const projectKey = `${thread.root.projectName}::${thread.root.testCycle || ''}`;
        counts[projectKey] = (counts[projectKey] || 0) + 1;
      }
    });
    return counts;
  }, [threadsByRunId]);

  const getTesterThreads = (runId: string): MessageThread[] => {
    return threadsByRunId[runId] || [];
  };

  const getUnreadReplyCount = (runId: string): number => {
    const threads = threadsByRunId[runId] || [];
    return threads.reduce((sum, t) => {
      if (t.isRead) return sum;
      return sum + t.replies.filter(r => !r.readByPm).length;
    }, 0);
  };

  const markThreadReplyRead = async (thread: MessageThread) => {
    const unreadReplies = thread.replies.filter(r => !r.readByPm);
    if (unreadReplies.length === 0) return;
  
    setAllMessages(prev => prev.map(m => {
      if (unreadReplies.some(r => r.id === m.id)) return { ...m, readByPm: true };
      return m;
    }));
  
    try {
      await Promise.all(unreadReplies.map(r =>
        updateDoc(doc(db, 'testerMessages', r.id), { readByPm: true })
      ));
    } catch (err) {
      setAllMessages(prev => prev.map(m => {
        if (unreadReplies.some(r => r.id === m.id)) return { ...m, readByPm: false };
        return m;
      }));
    }
  };

  const getDefaultPriority = (isFailure: boolean): 'Medium' | 'Low' => isFailure ? 'Medium' : 'Low';

  const openProject = (projectName: string, testCycle?: string) => {
    const key = `${projectName}::${testCycle || ''}`;
    const grouped = groupRunsByProject(testRuns);
    if ((grouped.get(key) || []).length === 0) return;
    setPanelPlatformFilter('all'); // Reset platform filter
    setPanelFilter('all');
    setSelectedTesterId('everyone');
    setShowTesterProfile(false);
    setExpandedStepId(null);
    setPendingTriage({});
    setSavedTriage({}); 
    setSelectedBugs([]);
    
    setActiveProjectKey(key);
    setDisplayKey(key);
  };

  const openTriageDropdown = (reviewKey: string) => {
    setPriorityPopover(null);
    setOpenDropdownKey(prev => prev === reviewKey ? null : reviewKey);
  };

  const handleTriageAction = (reviewKey: string, action: 'Ticketed' | 'Snoozed' | 'Reviewed' | 'Dismissed', isFailure: boolean) => {
    setOpenDropdownKey(null);
    if (action === 'Ticketed') {
      setPriorityPopover({ reviewKey, tempPriority: getDefaultPriority(isFailure) });
      return;
    }
    setPendingTriage(prev => ({ ...prev, [reviewKey]: { action } }));
  };

  const confirmPriorityAndTicket = () => {
    if (!priorityPopover?.reviewKey) return;
    setPendingTriage(prev => ({
      ...prev,
      [priorityPopover.reviewKey!]: { action: 'Ticketed', priority: priorityPopover.tempPriority as any },
    }));
    setPriorityPopover(null);
  };
  
  const cancelPriority = () => {
    setPriorityPopover(null);
  };

  const undoTriageAction = (reviewKey: string) => {
    setPendingTriage(prev => {
      const next = { ...prev };
      delete next[reviewKey];
      return next;
    });
  };

  const toggleSelection = (key: string) => {
    setSelectedBugs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const bulkSnooze = () => {
    const next = { ...pendingTriage };
    selectedBugs.forEach(key => { next[key] = { action: 'Snoozed' }; });
    setPendingTriage(next);
    setSelectedBugs([]);
  };

  const bulkTicket = () => {
    if (!activeProject) return;
    const next = { ...pendingTriage };
    selectedBugs.forEach(key => {
      const firstUnderscore = key.indexOf('_');
      const stepId = key.slice(firstUnderscore + 1);
      const step = activeProject.steps.find(s => s.stepId === stepId);
      const res = step?.results.find(r => r.reviewKey === key)?.result;
      const isFail = res?.status === 'Failed';
      next[key] = { action: 'Ticketed', priority: getDefaultPriority(isFail) };
    });
    setPendingTriage(next);
    setSelectedBugs([]);
  };

  const commitNonJiraTriage = async () => {
    setDraftingModal(prev => ({ ...prev, pushing: true }));
    try {
      const toSave = { ...pendingTriage };
      setSavedTriage(prev => ({ ...prev, ...toSave }));
      setPendingTriage({});
      setSelectedBugs([]);

      await Promise.all(
        Object.entries(toSave).map(([key, pending]) => {
          const firstUnderscore = key.indexOf('_');
          const runId = key.slice(0, firstUnderscore);
          const stepId = key.slice(firstUnderscore + 1);
          return updateDoc(doc(db, 'testRuns', runId), {
            [`results.${stepId}.isTriaged`]: true,
            [`results.${stepId}.triageAction`]: pending.action,
            [`results.${stepId}.triagedAt`]: Date.now(),
          });
        })
      );
    } catch (error) {
      alert('Save failed — please try again.');
    } finally {
      setDraftingModal(prev => ({ ...prev, pushing: false }));
    }
  };

  // 8a: Update Jira open drafting modal
  const openDraftingModal = async () => {
    const ticketed = Object.entries(pendingTriage).filter(([_, p]) => p.action === 'Ticketed');
    if (ticketed.length === 0) return;

    const tickets = ticketed.map(([reviewKey, action]) => {
      const firstUnderscore = reviewKey.indexOf('_');
      const runId = reviewKey.slice(0, firstUnderscore);
      const stepId = reviewKey.slice(firstUnderscore + 1);
      const isStepTicket = !!action.linkedStepTicket;

      const run = testRuns.find(r => r.id === runId);
      const step = run?.steps.find(s => s.id === stepId);
      if (!run || !step) return null;

      const platform = run.platform; // Differentiate platform

      let projectRuns = [run];
      if (isStepTicket) {
        projectRuns = testRuns.filter(r => 
          r.projectName === run.projectName && 
          r.testCycle === run.testCycle &&
          r.platform === platform // Ensure we only link runs from the same platform!
        );
      }

      const sources = projectRuns
        .map(r => ({ run: r, result: r.results?.[stepId] }))
        .filter(({ result }) => result && (result.status === 'Failed' || (result.status === 'Passed' && (result.notes?.trim() || result.noteChips?.length))))
        .map(({ run: r, result }) => ({
          testerId: r.id!,
          testerName: r.testerName,
          deviceInfo: r.deviceInfo!,
          status: result!.status as 'Passed' | 'Failed',
          notes: result!.notes || '',
          noteChips: result!.noteChips || [],
          evidenceUrls: result!.evidenceUrls || [],
        }));

      return {
        id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        runIds: projectRuns.map(r => r.id!),
        stepId: step.id,
        stepIndex: run.steps.indexOf(step),
        stepAction: step.action,
        expectedResult: step.expectedResult,
        sources,
        priority: action.priority || getDefaultPriority(true),
        platform, // Include the platform for Jira Title generation
      };
    }).filter(Boolean) as any[];

    // Ensure we don't merge iOS and Android tickets into the same single Jira ticket
    const uniqueTickets = Array.from(new Map(tickets.map(t => [`${t.stepId}::${t.platform || ''}`, t])).values());

    const initialTickets: AIDraftedTicket[] = uniqueTickets.map(t => ({
      id: t.id, runIds: t.runIds, stepId: t.stepId, stepIndex: t.stepIndex, platform: t.platform, sources: t.sources, status: 'queued', approved: false, pushed: false,
      title: '', description: '', stepsToReproduce: [], expectedBehavior: '', actualBehavior: '', severity: t.priority, severityReasoning: '', environment: [], evidenceUrls: [], citations: [],
    }));

    setDraftingModal({ open: true, tickets: initialTickets, activeTicketId: initialTickets[0]?.id || null, refining: false, pushing: false });

    // 8c: Ensure platform metadata goes through for stream payload (inherent in the type object sent)
    await streamDrafts(uniqueTickets, {
      onTicketStarted: (id) => setDraftingModal(prev => ({ ...prev, tickets: prev.tickets.map(t => t.id === id ? { ...t, status: 'drafting' } : t) })),
      onTicketReady: (id, draft) => setDraftingModal(prev => ({ ...prev, tickets: prev.tickets.map(t => t.id === id ? { ...t, ...draft, status: 'ready' } : t) })),
      onTicketError: (id, error) => {
        console.warn(`Draft failed for ${id}:`, error); // Suppress Next.js red screen overlay
        alert("AI Drafting Paused: Anthropic API returned an error (likely out of credits).");
        setDraftingModal(prev => ({ ...prev, tickets: prev.tickets.map(t => t.id === id ? { ...t, status: 'queued' } : t) }));
      },
      onDone: () => {},
    });
  };

  const handleRefine = async (instruction: string) => {
    if (!draftingModal.activeTicketId) return;
    const activeTicket = draftingModal.tickets.find(t => t.id === draftingModal.activeTicketId);
    if (!activeTicket || activeTicket.status === 'drafting') return;

    setDraftingModal(prev => ({
      ...prev,
      refining: true,
      tickets: prev.tickets.map(t => t.id === activeTicket.id ? { ...t, status: 'refining' } : t),
    }));

    try {
      const refined = await refineDraft(activeTicket, instruction);
      setDraftingModal(prev => ({
        ...prev,
        refining: false,
        tickets: prev.tickets.map(t => t.id === activeTicket.id ? { ...t, ...refined, status: 'ready', approved: false } : t),
      }));
    } catch (err) {
      setDraftingModal(prev => ({ ...prev, refining: false }));
      alert('Refinement failed. Please try again.');
    }
  };

  const approveTicket = (id: string) => {
    setDraftingModal(prev => ({
      ...prev,
      tickets: prev.tickets.map(t => t.id === id ? { ...t, approved: true, status: 'approved' } : t),
    }));
  };

  const handleFinalPush = async () => {
    const approvedTickets = draftingModal.tickets.filter(t => t.approved);
    if (approvedTickets.length === 0) return;
  
    setDraftingModal(prev => ({ ...prev, pushing: true }));
  
    try {
      const res = await fetch('/api/push-to-jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickets: approvedTickets }),
      });
      const data = await res.json();
  
      const successKeys = data.results.filter((r: any) => r.success).map((r: any) => r.jiraKey);
      setSuccessToast({ show: true, keys: successKeys });
      setTimeout(() => setSuccessToast({ show: false, keys: [] }), 6000);
  
      const toSave = { ...pendingTriage };
      setSavedTriage(prev => ({ ...prev, ...toSave }));
      setPendingTriage({});
      setSelectedBugs([]);
      setDraftingModal({ open: false, tickets: [], activeTicketId: null, refining: false, pushing: false });

      await Promise.all(
        Object.entries(toSave).map(([key, pending]) => {
          const firstUnderscore = key.indexOf('_');
          const runId = key.slice(0, firstUnderscore);
          const stepId = key.slice(firstUnderscore + 1);
          return updateDoc(doc(db, 'testRuns', runId), {
            [`results.${stepId}.isTriaged`]: true,
            [`results.${stepId}.triageAction`]: pending.action,
            [`results.${stepId}.triagePriority`]: pending.priority || null,
            [`results.${stepId}.triagedAt`]: Date.now(),
          });
        })
      );
    } catch (err) {
      alert('Push failed. Some tickets may have been created. Check Jira and Firestore.');
      setDraftingModal(prev => ({ ...prev, pushing: false }));
    }
  };

  useEffect(() => {
    if (!draftingModal.open || !draftingModal.activeTicketId) return;

    const drawConnections = (claim: Element) => {
      const svg = document.getElementById('connectorSvg');
      const modalBody = document.getElementById('modalBody');
      if (!svg || !modalBody) return;

      const claims = document.querySelectorAll('.synth');
      const sources = document.querySelectorAll('.source-card');

      svg.innerHTML = '';
      sources.forEach(s => s.classList.remove('connected', 'dimmed'));
      claims.forEach(c => c.classList.remove('active'));

      claim.classList.add('active');
      const sourceIds = ((claim as HTMLElement).dataset.sources || '').split(',').filter(Boolean);

      const bodyRect = modalBody.getBoundingClientRect();
      const claimRect = claim.getBoundingClientRect();

      const startX = claimRect.right - bodyRect.left + 4;
      const startY = claimRect.top - bodyRect.top + claimRect.height / 2;

      sources.forEach(card => {
        if (sourceIds.includes((card as HTMLElement).dataset.tester!)) {
          card.classList.add('connected');
        } else {
          card.classList.add('dimmed');
        }
      });

      const ns = 'http://www.w3.org/2000/svg';
      svg.setAttribute('viewBox', `0 0 ${bodyRect.width} ${bodyRect.height}`);
      svg.setAttribute('preserveAspectRatio', 'none');

      const startDot = document.createElementNS(ns, 'circle');
      startDot.setAttribute('class', 'connector-dot');
      startDot.setAttribute('cx', startX.toString());
      startDot.setAttribute('cy', startY.toString());
      startDot.setAttribute('r', '3');
      svg.appendChild(startDot);

      sourceIds.forEach(id => {
        const card = document.getElementById('source-' + id);
        if (!card) return;
        const cardRect = card.getBoundingClientRect();
        const endX = cardRect.left - bodyRect.left;
        const endY = cardRect.top - bodyRect.top + cardRect.height / 2;

        const cp1X = startX + (endX - startX) * 0.5;
        const cp1Y = startY;
        const cp2X = startX + (endX - startX) * 0.5;
        const cp2Y = endY;
        const d = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('class', 'connector-path');
        path.setAttribute('d', d);
        svg.appendChild(path);

        const endDot = document.createElementNS(ns, 'circle');
        endDot.setAttribute('class', 'connector-dot');
        endDot.setAttribute('cx', endX.toString());
        endDot.setAttribute('cy', endY.toString());
        endDot.setAttribute('r', '3');
        svg.appendChild(endDot);
      });
    };

    const clearLines = () => {
      const svg = document.getElementById('connectorSvg');
      if (svg) svg.innerHTML = '';
      document.querySelectorAll('.source-card').forEach(s => s.classList.remove('connected', 'dimmed'));
      document.querySelectorAll('.synth').forEach(c => c.classList.remove('active'));
    };

    const claims = document.querySelectorAll('.synth');
    claims.forEach(claim => {
      claim.addEventListener('mouseenter', () => drawConnections(claim));
      claim.addEventListener('focus', () => drawConnections(claim));
    });

    const modalBody = document.getElementById('modalBody');
    if (modalBody) modalBody.addEventListener('mouseleave', clearLines);

    setTimeout(() => {
      if (claims[0]) drawConnections(claims[0]);
    }, 800);

    return () => {
      claims.forEach(claim => {
        claim.removeEventListener('mouseenter', () => drawConnections(claim));
        claim.removeEventListener('focus', () => drawConnections(claim));
      });
      if (modalBody) modalBody.removeEventListener('mouseleave', clearLines);
    };
  }, [draftingModal.open, draftingModal.activeTicketId, draftingModal.tickets]);

  const renderDescriptionWithCitations = (description: string, citations: any[]) => {
    if (!description) return null;
    const parts = description.split(/(\[c\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[c(\d+)\]$/);
      if (match) {
        const id = `c${match[1]}`;
        const cite = citations.find(c => c.id === id);
        if (cite) {
          return (
            <span key={i} className="synth" data-sources={cite.sourceTesterIds.join(',')} data-claim-id={id}>
              {cite.claim}
              <span className="synth-count">{cite.sourceTesterIds.length}</span>
            </span>
          );
        }
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  useEffect(() => {
    if (!draftingModal.open) {
      setLoadingStepIdx(0);
      return;
    }
    const allReady = draftingModal.tickets.every(t => t.status === 'ready' || t.status === 'approved');
    if (allReady) return;
  
    const interval = setInterval(() => {
      setLoadingStepIdx(idx => Math.min(idx + 1, 3));
    }, 4000);
    return () => clearInterval(interval);
  }, [draftingModal.open, draftingModal.tickets]);

  const handlePMFileUpload = async (runId: string, stepId: string, currentResult: ExtendedTestResult | undefined, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingStep(`${runId}_${stepId}`);
    try {
      const storageRef = ref(storage, `pm_evidence/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'testRuns', runId), { [`results.${stepId}.evidenceUrls`]: [...(currentResult?.evidenceUrls || []), downloadURL] });
    } catch (error) { alert("Failed to attach file."); } finally { setUploadingStep(null); }
  };

  const openPMQrScanner = (runId: string, stepId: string, currentResult: ExtendedTestResult | undefined) => {
    const token = Math.random().toString(36).substring(2, 15);
    setUploadToken(token); setQrTarget({ runId, stepId, currentResult });
    setUploadUrl(`${window.location.origin}/mobile-upload/${token}`); setQrModalOpen(true);
  };

  const openViewer = (urls: string[], index: number) => {
    window.open(urls[index], '_blank');
  };

  useEffect(() => {
    if (!qrModalOpen || !uploadToken || !qrTarget) return;
    const docRef = doc(db, 'mobileUploads', uploadToken);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists() && docSnap.data().url) {
        try { await updateDoc(doc(db, 'testRuns', qrTarget.runId), { [`results.${qrTarget.stepId}.evidenceUrls`]: [...(qrTarget.currentResult?.evidenceUrls || []), docSnap.data().url] }); } catch (err) {}
        deleteDoc(docRef).catch(console.error); setQrModalOpen(false); setQrTarget(null);
      }
    });
    return () => unsubscribe();
  }, [qrModalOpen, uploadToken, qrTarget]);

  const openContact = (tester: TesterResultOnStep, step: AggregatedStep) => {
    const threads = getTesterThreads(tester.runId);
    const matchingThread = threads.find(t => t.root.stepId === step.stepId) || null;
  
    setContactModal({
      tester: { id: tester.testerId, runId: tester.runId, name: tester.testerName, email: tester.testerEmail, initials: initialsFor(tester.testerName), color: colorForTester(tester.testerName) },
      runId: tester.runId,
      stepId: step.stepId,
      stepIndex: step.stepIndex,
      stepAction: step.action,
      originalResult: tester.result,
      activeThread: matchingThread,
    });
  
    if (matchingThread) markThreadReplyRead(matchingThread);
  };

  const openContactGeneral = (
    tester: {id: string; runId: string; name: string; email?: string; initials: string; color: string},
    preferredChannel: 'in-app' | 'mailto'
  ) => {
    const threads = getTesterThreads(tester.id);
    const activeThread = threads.find(t => !t.isRead) || null;

    setContactModal({
      tester, 
      runId: tester.runId,
      stepId: null, stepIndex: null, stepAction: null, originalResult: null, initialChannel: preferredChannel,
      activeThread,
    });

    if (activeThread) markThreadReplyRead(activeThread);
  };

  const handleSendMessage = async () => {
    if (!contactModal || !contactMessage.trim()) return;
    setIsSendingMessage(true);
  
    try {
      if (contactChannel === 'mailto') {
        const subject = contactModal.stepAction
          ? `Proofdeck: follow-up on "${contactModal.stepAction}"`
          : `Proofdeck: follow-up on ${activeProject?.projectName}`;
        const body = [
          `Hi ${contactModal.tester.name.split(' ')[0]},`,
          '',
          contactMessage,
          '',
          contactModal.stepAction ? `(Context — Step ${(contactModal.stepIndex ?? 0) + 1}: ${contactModal.stepAction})` : '',
          contactModal.originalResult?.notes ? `Your original note: "${contactModal.originalResult.notes}"` : '',
          '',
          '— sent from Proofdeck',
        ].filter(Boolean).join('\n');
  
        const mailtoUrl = `mailto:${contactModal.tester.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
      } else {
        await addDoc(collection(db, 'testerMessages'), {
          runId: contactModal.runId, 
          projectName: activeProject?.projectName || '',
          testCycle: activeProject?.testCycle || null,
          testerId: contactModal.tester.id,
          testerName: contactModal.tester.name,
          pmName: 'PM', 
          direction: 'pm_to_tester',
          body: contactMessage.trim(),
          createdAt: Date.now(),
          stepId: contactModal.stepId,
          stepIndex: contactModal.stepIndex,
          stepAction: contactModal.stepAction,
          contextNote: contactModal.originalResult?.notes || null,
          contextStatus: contactModal.originalResult?.status || null,
          contextChips: contactModal.originalResult?.noteChips || [],
          parentMessageId: null,
          readByTester: false,
          readByPm: true,
          hasReply: false,
        });
      }
      setContactModal(null);
    } catch (error) {
      alert('Failed to send. Please try again.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSendReplyFromThread = async () => {
    if (!contactModal || !contactModal.activeThread || !contactMessage.trim()) return;
    setIsSendingMessage(true);
  
    try {
      const parentMessage = contactModal.activeThread.root;
  
      await addDoc(collection(db, 'testerMessages'), {
        runId: parentMessage.runId,
        projectName: parentMessage.projectName,
        testCycle: parentMessage.testCycle || null,
        testerId: parentMessage.testerId,
        testerName: parentMessage.testerName,
        pmName: parentMessage.pmName,
        direction: 'pm_to_tester',
        body: contactMessage.trim(),
        createdAt: Date.now(),
        stepId: parentMessage.stepId,
        stepIndex: parentMessage.stepIndex,
        stepAction: parentMessage.stepAction,
        contextNote: parentMessage.contextNote || null,
        contextStatus: parentMessage.contextStatus || null,
        contextChips: parentMessage.contextChips || [],
        parentMessageId: parentMessage.id,
        readByTester: false,
        readByPm: true,
        hasReply: false,
      });
  
      setContactMessage('');
      setContactModal(null);
    } catch (err) {
      console.error('Send reply failed:', err);
      alert('Failed to send reply. Please try again.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const uniqueProjects = useMemo(() => ['All projects', ...Array.from(new Set(testRuns.map(r => r.projectName)))], [testRuns]);
  const uniqueCycles = useMemo(() => ['All cycles', ...Array.from(new Set(testRuns.map(r => r.testCycle).filter(Boolean)))], [testRuns]);
  const uniqueTesters = useMemo(() => ['All testers', ...Array.from(new Set(testRuns.map(r => r.testerName)))], [testRuns]);

  const filteredRuns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return testRuns.filter(run => {
      if (filterProject !== 'All projects' && run.projectName !== filterProject) return false;
      if (filterCycle !== 'All cycles' && run.testCycle !== filterCycle) return false;
      if (filterTester !== 'All testers' && run.testerName !== filterTester) return false;
      if (q) {
        const haystack = `${run.projectName} ${run.testerName} ${run.testCycle || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [testRuns, filterProject, filterCycle, filterTester, searchQuery]);

  const stats = useMemo(() => {
    let projectsCount = new Set(filteredRuns.map(r => r.projectName)).size;
    let inProgressProjects = new Set(filteredRuns.filter(r => !r.isCompleted).map(r => r.projectName)).size;
    let completeProjects = new Set(filteredRuns.filter(r => r.isCompleted).map(r => r.projectName)).size;
    
    let totalSteps = 0, completedSteps = 0, passed = 0, failed = 0, pendingTriage = 0;
    filteredRuns.forEach(run => {
      totalSteps += (run.steps?.length || 0);
      run.steps?.forEach(step => {
        const result = run.results?.[step.id] as ExtendedTestResult;
        if (result) {
          completedSteps++;
          if (result.status === 'Passed') passed++;
          if (result.status === 'Failed') { failed++; }
          
          const hasPassNote = result.status === 'Passed' && (result.notes?.trim() || (result.noteChips && result.noteChips.length > 0));
          if ((result.status === 'Failed' || hasPassNote) && !result.isTriaged) {
            pendingTriage++;
          }
        }
      });
    });

    const completionPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const passedPct = totalSteps > 0 ? (passed / totalSteps) * 100 : 0;
    const failedPct = totalSteps > 0 ? (failed / totalSteps) * 100 : 0;
    const pendingPct = totalSteps > 0 ? ((totalSteps - completedSteps) / totalSteps) * 100 : 0;

    return { 
      projectsCount, inProgressProjects, completeProjects, 
      totalSteps, completedSteps, remainingSteps: totalSteps - completedSteps, 
      passed, failed, pendingTriage, completionPct, passedPct, failedPct, pendingPct 
    };
  }, [filteredRuns]);

  const runsNeedsAttention = useMemo(() => filteredRuns.filter(run => run.steps.some(s => {
    const result = run.results?.[s.id] as ExtendedTestResult;
    const isFail = result?.status === 'Failed';
    const hasPassNote = result?.status === 'Passed' && (result.notes?.trim() || (result.noteChips && result.noteChips.length > 0));
    return (isFail || hasPassNote) && !result?.isTriaged;
  })), [filteredRuns]);
  
  const runsInProgress = useMemo(
    () => filteredRuns.filter(run => !run.isCompleted && !runsNeedsAttention.includes(run)),
    [filteredRuns, runsNeedsAttention]
  );
  
  const runsCompleted = useMemo(
    () => filteredRuns.filter(run => run.isCompleted && !runsNeedsAttention.includes(run)),
    [filteredRuns, runsNeedsAttention]
  );

  // 7c: Split Step Rows memoization (Compute per-platform aggregates if required)
  const splitStepRows = useMemo<SplitStepRow[]>(() => {
    if (!activeProject) return [];
    if (!activeProjectIsPlatformed) {
      return activeProject.steps.map(step => ({ step, key: step.stepId }));
    }

    const rows: SplitStepRow[] = [];
    const grouped = groupRunsByProject(testRuns);
    const projectRuns = grouped.get(displayKey || '') || [];

    for (const platform of activeProjectPlatforms) {
      const platformAggregate = aggregateProjectByPlatform(projectRuns, platform);
      for (const step of platformAggregate.steps) {
        rows.push({
          step,
          platform,
          key: `${step.stepId}::${platform}`,
        });
      }
    }

    rows.sort((a, b) => {
      if (a.step.stepIndex !== b.step.stepIndex) return a.step.stepIndex - b.step.stepIndex;
      const aIdx = activeProjectPlatforms.indexOf(a.platform || '');
      const bIdx = activeProjectPlatforms.indexOf(b.platform || '');
      return aIdx - bIdx;
    });

    return rows;
  }, [activeProject, activeProjectIsPlatformed, activeProjectPlatforms, testRuns, displayKey]);

  // 7d: Derive visible step rows after applying filters
  const visibleStepRows = useMemo<SplitStepRow[]>(() => {
    let filtered = splitStepRows;

    if (panelPlatformFilter !== 'all') {
      filtered = filtered.filter(r => r.platform === panelPlatformFilter);
    }

    if (selectedTesterId !== 'everyone') {
      filtered = filtered.filter(r =>
        r.step.results.some(res =>
          res.testerId === selectedTesterId &&
          (res.result?.status === 'Failed' ||
           (res.result?.status === 'Passed' && (res.result.notes?.trim() || res.result.noteChips?.length)))
        )
      );
    }

    if (panelFilter === 'fail') filtered = filtered.filter(r => r.step.consensus === 'fail');
    else if (panelFilter === 'mixed') filtered = filtered.filter(r => r.step.consensus === 'mixed');
    else if (panelFilter === 'notes') filtered = filtered.filter(r => r.step.consensus === 'notes');
    else if (panelFilter === 'passed') filtered = filtered.filter(r => r.step.consensus === 'pass');

    return filtered;
  }, [splitStepRows, panelPlatformFilter, selectedTesterId, panelFilter]);

  // 7g: Tester Platform Option
  const testerPlatformOptions = useMemo<TesterPlatformOption[]>(() => {
    if (!activeProject) return [];
    
    const grouped = groupRunsByProject(testRuns);
    const projectRuns = grouped.get(displayKey || '') || [];

    const baseOptions = activeProject.testers.map(t => {
      const run = projectRuns.find(r => r.id === t.runId);
      return {
        id: t.id,
        testerId: t.id,
        testerName: t.name,
        platform: run?.platform,
        initials: t.initials,
        color: t.color,
        failCount: t.failCount,
        passNoteCount: t.passNoteCount
      };
    });

    if (!activeProjectIsPlatformed || panelPlatformFilter === 'all') {
      return baseOptions;
    }

    return baseOptions.filter(t => t.platform === panelPlatformFilter);
  }, [activeProject, activeProjectIsPlatformed, panelPlatformFilter, testRuns, displayKey]);

  // 7h: Per-platform consensus stats
  const consensusStats = useMemo(() => {
    if (!activeProject) return null;

    let stepsToCount: AggregatedStep[];
    if (activeProjectIsPlatformed && panelPlatformFilter !== 'all') {
      const grouped = groupRunsByProject(testRuns);
      const projectRuns = grouped.get(displayKey || '') || [];
      stepsToCount = aggregateProjectByPlatform(projectRuns, panelPlatformFilter).steps;
    } else if (activeProjectIsPlatformed && panelPlatformFilter === 'all') {
      stepsToCount = splitStepRows.map(r => r.step);
    } else {
      stepsToCount = activeProject.steps;
    }

    return {
      total: stepsToCount.length,
      consensusPass: stepsToCount.filter(s => s.consensus === 'pass').length,
      consensusFail: stepsToCount.filter(s => s.consensus === 'fail').length,
      mixed: stepsToCount.filter(s => s.consensus === 'mixed').length,
      notes: stepsToCount.filter(s => s.consensus === 'notes').length,
      pendingTriage: stepsToCount.filter(s => {
        return s.results.some(r => {
          const isUntriaged = !(r.result as ExtendedTestResult)?.isTriaged && !pendingTriage[r.reviewKey] && !savedTriage[r.reviewKey];
          const hasIssue = r.result?.status === 'Failed' ||
                           (r.result?.status === 'Passed' && (r.result.notes?.trim() || r.result.noteChips?.length));
          return isUntriaged && hasIssue;
        });
      }).length,
    };
  }, [activeProject, activeProjectIsPlatformed, panelPlatformFilter, splitStepRows, testRuns, displayKey, pendingTriage, savedTriage]);

  const renderDotGrid = (step: AggregatedStep) => {
    const gridClass = step.results.length > 10 ? 'dot-grid dot-grid-large' : 'dot-grid';
    
    const summaryTooltip = (step: AggregatedStep): string => {
      const parts = [];
      if (step.failedCount) parts.push(`${step.failedCount} failed`);
      if (step.passNoteCount) parts.push(`${step.passNoteCount} noted`);
      if (step.passedCount) parts.push(`${step.passedCount} passed`);
      if (step.pendingCount) parts.push(`${step.pendingCount} pending`);
      return parts.join(', ');
    };

    const dotTooltip = (r: TestResult | null): string => {
      if (!r) return 'Not reached';
      if (r.status === 'Failed') return 'Failed';
      if (r.notes?.trim() || r.noteChips?.length) return 'Passed with note';
      return 'Passed';
    };

    return (
      <div className={gridClass} data-tooltip={summaryTooltip(step)}>
        {step.results.map(r => {
          let cls = 'pending';
          if (r.result?.status === 'Passed') {
            cls = (r.result.notes?.trim() || r.result.noteChips?.length) ? 'pass-note' : 'pass';
          } else if (r.result?.status === 'Failed') {
            cls = 'fail';
          }
          return (
            <div
              key={r.testerId}
              className={`result-dot ${cls}`}
              data-tooltip={`${r.testerName} · ${dotTooltip(r.result)}`}
            />
          );
        })}
      </div>
    );
  };

  const consensusLabel = (step: AggregatedStep): string => {
    if (step.consensus === 'pass') return `All ${step.total} passed`;
    if (step.consensus === 'fail') return `${step.failedCount} of ${step.total} failed`;
    if (step.consensus === 'notes') return `${step.passNoteCount} note${step.passNoteCount > 1 ? 's' : ''}`;
    if (step.consensus === 'pending') return 'Pending';
    const parts = [];
    if (step.failedCount) parts.push(`${step.failedCount} fail`);
    if (step.passNoteCount) parts.push(`${step.passNoteCount} note${step.passNoteCount > 1 ? 's' : ''}`);
    return parts.join(' · ');
  };

  const priorityColor = (level: string) => {
    switch (level) {
      case 'Critical': return '#8b2e1a';
      case 'High': return 'var(--fail)';
      case 'Medium': return 'var(--warn)';
      default: return 'var(--info)';
    }
  };
  const priorityTag = (level: string) => level.toLowerCase();

  const renderStepTriageBar = (step: AggregatedStep) => {
    const isPopoverOpen = stepPriorityPopover?.stepId === step.stepId;
    const currentPriority = stepPriorityPopover?.tempPriority || step.suggestedPriority;
  
    const openStepPopover = () => {
      setStepPriorityPopover({stepId: step.stepId, tempPriority: step.suggestedPriority});
    };
  
    const confirmStepTicket = () => {
      const newPending = {...pendingTriage};
      step.results.forEach(r => {
        const isFailed = r.result?.status === 'Failed';
        const hasPassNote = r.result?.status === 'Passed' && (r.result.notes?.trim() || r.result.noteChips?.length);
        if (isFailed || hasPassNote) {
          newPending[r.reviewKey] = {
            action: 'Ticketed',
            priority: currentPriority as any,
            linkedStepTicket: step.stepId,
          };
        }
      });
      setPendingTriage(newPending);
      setStepPriorityPopover(null);
    };
  
    const bulkStepAction = (action: 'Snoozed' | 'Dismissed') => {
      const newPending = {...pendingTriage};
      step.results.forEach(r => {
        const isFailed = r.result?.status === 'Failed';
        const hasPassNote = r.result?.status === 'Passed' && (r.result.notes?.trim() || r.result.noteChips?.length);
        if (isFailed || hasPassNote) {
          newPending[r.reviewKey] = {action};
        }
      });
      setPendingTriage(newPending);
    };
  
    const reportCount = step.failedCount + step.passNoteCount;
    if (reportCount === 0) return null;
  
    return (
      <div className="step-triage-bar">
        <div className="stb-text">
          <strong>Triage this step for all {reportCount} report{reportCount > 1 ? 's' : ''} in one ticket.</strong>
          <span className="stb-sub">
            {step.consensus === 'fail' ? 'Consensus fail' : 'Mixed signal'}
            {' · suggests '}
            <strong style={{color: 'var(--amber)'}}>{step.suggestedPriority}</strong>
            {' priority'}
          </span>
        </div>
        <div className="stb-actions">
          <span className="stb-btn ghost" onClick={() => bulkStepAction('Snoozed')}>Snooze</span>
          <span className="stb-btn ghost" onClick={() => bulkStepAction('Dismissed')}>Dismiss</span>
          <span className="stb-btn primary" onClick={openStepPopover}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9l-6-6H5a2 2 0 00-2 2z"/><polyline points="14 3 14 9 20 9"/></svg>
            Ticket as one issue
          </span>
        </div>
  
        {isPopoverOpen && (
          <div className="stb-popover" onClick={e => e.stopPropagation()}>
            <p className="stb-pop-title">One ticket · pick priority</p>
            <p className="stb-pop-sub">
              {reportCount} tester{reportCount > 1 ? 's' : ''} flagged this — suggested {step.suggestedPriority}.
            </p>
            <div className="stb-pop-options">
              {(['Critical', 'High', 'Medium', 'Low', 'Enhancement'] as const).map(level => (
                <span
                  key={level}
                  className={`stb-pop-option ${currentPriority === level ? 'selected' : ''}`}
                  onClick={() => setStepPriorityPopover(prev => prev ? {...prev, tempPriority: level} : null)}
                >
                  <span className="pp-dot" style={{background: priorityColor(level)}}></span>
                  <span className="stb-pop-label">{level}</span>
                  <span className="stb-pop-tag">
                    {level === step.suggestedPriority ? 'suggested' : priorityTag(level)}
                  </span>
                </span>
              ))}
            </div>
            <div className="stb-pop-actions">
              <span className="stb-pop-btn cancel" onClick={() => setStepPriorityPopover(null)}>Cancel</span>
              <span className="stb-pop-btn confirm" onClick={confirmStepTicket}>
                Ticket at {currentPriority}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStepDrill = (step: AggregatedStep) => {
    const issueResults = step.results.filter(r =>
      r.result?.status === 'Failed' ||
      (r.result?.status === 'Passed' && (r.result.notes?.trim() || r.result.noteChips?.length))
    );
  
    const drillIntroText = (step: AggregatedStep): React.ReactNode => {
      if (step.consensus === 'fail') {
        return <><strong>Clear consensus failure.</strong> {step.failedCount} of {step.total} testers reported this. Recommended priority: High.</>;
      }
      if (step.consensus === 'mixed') {
        const chips: Record<string, number> = {};
        step.results.forEach(r => r.result?.noteChips?.forEach(c => { chips[c] = (chips[c] || 0) + 1; }));
        const sorted = Object.entries(chips).sort((a, b) => b[1] - a[1]);
        const summary = sorted.slice(0, 2).map(([chip]) => chip.toLowerCase()).join(' and ') || 'varied';
        return <><strong>Mixed signal.</strong> {step.passedCount} testers passed, {step.failedCount} failed, {step.passNoteCount} flagged a minor issue. Common theme in notes: {summary}.</>;
      }
      if (step.consensus === 'notes') {
        return <><strong>All passed,</strong> but {step.passNoteCount} tester{step.passNoteCount > 1 ? 's' : ''} flagged observations.</>;
      }
      return null;
    };

    if (step.total === step.pendingCount) {
      return <div style={{padding: '16px 24px', color: 'var(--ink-mute)', fontStyle: 'italic'}}>No results yet — testers haven&apos;t reached this step.</div>;
    }
  
    return (
      <>
        {issueResults.length > 0 && (
          <div className="drill-intro">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>{drillIntroText(step)}</span>
          </div>
        )}
  
        {issueResults.map(r => {
          const isFailed = r.result?.status === 'Failed';
          const hasPassNote = r.result?.status === 'Passed' && (r.result.notes?.trim() || r.result.noteChips?.length);
          const avatarColor = colorForTester(r.testerName);
          const reviewKey = r.reviewKey;
          
          const pending = pendingTriage[reviewKey];
          const saved = savedTriage[reviewKey];
          const dbResult = r.result as ExtendedTestResult | undefined;
          
          const isUntriaged = !dbResult?.isTriaged && !pending && !saved;
          const finalAction = pending?.action || saved?.action || dbResult?.triageAction;
          const finalPriority = pending?.priority || saved?.priority || dbResult?.triagePriority;

          const dropdownOpen = openDropdownKey === reviewKey;
          const popoverOpen = priorityPopover?.reviewKey === reviewKey;
          const isUploading = uploadingStep === reviewKey;
          
          const testerThreads = getTesterThreads(r.runId);
          const unreadCount = testerThreads.reduce((sum, t) => {
            if (t.isRead) return sum;
            return sum + t.replies.filter(reply => !reply.readByPm).length;
          }, 0);
          const totalReplies = testerThreads.reduce((sum, t) => sum + t.replies.length, 0);
          const hasUnread = unreadCount > 0;
          const hasAnyThread = totalReplies > 0;

          const linkedJiraKey = dbResult?.linkedJiraTicket;
          const linkedJiraUrl = dbResult?.linkedJiraUrl;

          return (
            <div key={r.testerId} className={`tester-result ${isFailed ? 'fail' : 'pass-note'}`}>
              <div className="tr-avatar" style={{background: avatarColor}}>{initialsFor(r.testerName)}</div>
              <div className="tr-body">
                <div className="tr-head">
                  <span className="tr-name">{r.testerName}</span>
                  {r.deviceInfo && (
                    <span className="tr-meta">{r.deviceInfo.device} · {r.deviceInfo.os} · {r.deviceInfo.browser}</span>
                  )}
                </div>
  
                {r.result && (r.result.notes || r.result.noteChips?.length) && (
                  <div className={`tr-note ${isFailed ? 'fail-note' : 'amber-note'}`}>
                    {r.result.noteChips && r.result.noteChips.length > 0 && (
                      <div className="tr-note-chips">
                        {r.result.noteChips.map(c => (
                          <span key={c} className={`tr-note-chip ${hasPassNote ? 'amber' : ''}`}>{c}</span>
                        ))}
                      </div>
                    )}
                    {r.result.notes && (
                      <div className={`tr-note-text ${hasPassNote ? 'italic' : ''}`}>
                        {hasPassNote ? `"${r.result.notes}"` : r.result.notes}
                      </div>
                    )}
                  </div>
                )}
  
                <div className="tr-evidence">
                  {r.result?.evidenceUrls && r.result.evidenceUrls.length > 0 && r.result.evidenceUrls.map((url, i) => (
                    <div key={i} className="ev-thumb" onClick={() => openViewer(r.result!.evidenceUrls!, i)}>
                      <img src={url} alt="" />
                    </div>
                  ))}
                  {r.result && !dbResult?.isTriaged && !pending && !saved && (
                    <>
                      <label className="evidence-add" style={{marginTop: 10, display: 'inline-block', cursor: 'pointer', fontSize: '11px', color: 'var(--ink-mute)', border: '1px dashed var(--line-strong)', padding: '4px 8px', borderRadius: '4px'}}>
                        {isUploading ? 'Uploading...' : '+ Desktop'}
                        <input type="file" hidden onChange={(e) => handlePMFileUpload(r.runId, step.stepId, r.result as ExtendedTestResult, e)} />
                      </label>
                      <span className="evidence-add" style={{marginTop: 10, display: 'inline-block', marginLeft: 10, cursor: 'pointer', fontSize: '11px', color: 'var(--ink-mute)', border: '1px dashed var(--line-strong)', padding: '4px 8px', borderRadius: '4px'}} onClick={() => openPMQrScanner(r.runId, step.stepId, r.result as ExtendedTestResult)}>+ Phone</span>
                    </>
                  )}
                </div>

              </div>
  
              <div className="tr-actions">
                <span className={`tr-status-pill ${isFailed ? 'fail' : 'pass-note'}`}>
                  {isFailed ? 'Failed' : 'Passed · noted'}
                </span>
                <span 
                  className={`tr-contact-btn ${hasUnread ? 'has-unread' : hasAnyThread ? 'has-read' : ''}`} 
                  onClick={(e) => { e.stopPropagation(); openContact(r, step); }}
                >
                  {hasUnread && <span className="unread-badge">{unreadCount}</span>}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                  {hasUnread ? 'New reply' : hasAnyThread ? `Thread · ${totalReplies} message${totalReplies > 1 ? 's' : ''}` : 'Contact'}
                </span>

                <div className="triage-col" style={{marginTop: 12}}>
                  {linkedJiraKey ? (
                    <a href={linkedJiraUrl || '#'} target="_blank" rel="noreferrer" className="jira-pill">
                      <span className="jira-pill-icon">J</span>
                      {linkedJiraKey}
                      <svg className="jira-pill-arrow" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                      </svg>
                    </a>
                  ) : pending ? (
                    <>
                      <span className={`triaged-chip ${pending.action.toLowerCase()}`}>
                        {pending.action === 'Ticketed' && pending.priority && (
                          <span className="pri-dot" style={{background: priorityColor(pending.priority)}}></span>
                        )}
                        {pending.action === 'Ticketed' ? `Ticketed · ${pending.priority}` : pending.action}
                      </span>
                      <span className="undo-link" onClick={() => undoTriageAction(reviewKey)}>Undo</span>
                    </>
                  ) : dbResult?.isTriaged || saved ? (
                    <span className={`triaged-chip ${(finalAction || 'reviewed').toLowerCase()}`}>
                      {finalAction === 'Ticketed' && finalPriority && (
                        <span className="pri-dot" style={{background: priorityColor(finalPriority)}}></span>
                      )}
                      {finalAction === 'Ticketed' && finalPriority 
                        ? `Ticketed · ${finalPriority}` 
                        : finalAction || 'Triaged'}
                    </span>
                  ) : isUntriaged ? (
                    <>
                      <span className={`triage-btn ${dropdownOpen ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); openTriageDropdown(reviewKey); }}>
                        Triage this
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </span>

                      {dropdownOpen && (
                        <div className="triage-menu" onClick={(e) => e.stopPropagation()}>
                          <span className="menu-item ticket" onClick={() => handleTriageAction(reviewKey, 'Ticketed', isFailed)}>
                            <span className="menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9l-6-6H5a2 2 0 00-2 2z"/><polyline points="14 3 14 9 20 9"/></svg></span>
                            <span style={{display: 'block'}}>
                              <span className="menu-label" style={{display: 'block'}}>Ticket it</span>
                              <span className="menu-desc" style={{display: 'block'}}>Create a Jira ticket — pick priority next</span>
                            </span>
                          </span>
                          <span className="menu-item snooze" onClick={() => handleTriageAction(reviewKey, 'Snoozed', isFailed)}>
                            <span className="menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="10"/></svg></span>
                            <span style={{display: 'block'}}>
                              <span className="menu-label" style={{display: 'block'}}>Snooze</span>
                              <span className="menu-desc" style={{display: 'block'}}>Decide later — hides from the triage queue</span>
                            </span>
                          </span>
                          <span className="menu-item reviewed" onClick={() => handleTriageAction(reviewKey, 'Reviewed', isFailed)}>
                            <span className="menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                            <span style={{display: 'block'}}>
                              <span className="menu-label" style={{display: 'block'}}>Mark reviewed</span>
                              <span className="menu-desc" style={{display: 'block'}}>Seen, no action right now</span>
                            </span>
                          </span>
                          <div className="menu-divider"></div>
                          <span className="menu-item dismiss" onClick={() => handleTriageAction(reviewKey, 'Dismissed', isFailed)}>
                            <span className="menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span>
                            <span style={{display: 'block'}}>
                              <span className="menu-label" style={{display: 'block'}}>Dismiss</span>
                              <span className="menu-desc" style={{display: 'block'}}>Not a real bug — close without a ticket</span>
                            </span>
                          </span>
                        </div>
                      )}

                      {popoverOpen && priorityPopover && (
                        <div className="priority-popover" onClick={(e) => e.stopPropagation()}>
                          <p className="pp-title">Ticket it — pick a priority</p>
                          <p className="pp-sub">How urgent is this for the dev team?</p>
                          <div className="pp-options">
                            {(['Critical', 'High', 'Medium', 'Low', 'Enhancement'] as const).map(level => (
                              <span
                                key={level}
                                className={`pp-option ${priorityPopover.tempPriority === level ? 'selected' : ''}`}
                                onClick={() => setPriorityPopover(prev => prev ? {...prev, tempPriority: level} : null)}
                              >
                                <span className="pp-dot" style={{background: priorityColor(level)}}></span>
                                <span className="pp-option-label">{level}</span>
                                <span className="pp-option-tag">
                                  {level === step.suggestedPriority ? 'suggested' : priorityTag(level)}
                                </span>
                              </span>
                            ))}
                          </div>
                          <div className="pp-actions">
                            <span className="pp-btn cancel" onClick={cancelPriority}>Cancel</span>
                            <span className="pp-btn confirm" onClick={confirmPriorityAndTicket}>
                              Ticket at {priorityPopover.tempPriority}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>

              </div>
            </div>
          );
        })}
  
        {renderStepTriageBar(step)}
      </>
    );
  };

  const renderDashboardRow = (run: TestRunData, statusClass: string, statusLabel: string) => {
    const comp = Object.keys(run.results || {}).length;
    const tot = run.steps?.length || 0;
    const pct = tot > 0 ? (comp / tot) * 100 : 0;
    const failedCount = run.steps.filter(s => run.results?.[s.id]?.status === 'Failed' && !(run.results?.[s.id] as ExtendedTestResult)?.isTriaged).length;
    
    const passNoteCount = run.steps.filter(s => {
      const res = run.results?.[s.id];
      return res?.status === 'Passed' && (res.notes?.trim() || (res.noteChips && res.noteChips.length > 0)) && !(res as ExtendedTestResult).isTriaged;
    }).length;
    const hasPassNotes = passNoteCount > 0;

    const projectKey = `${run.projectName}::${run.testCycle || ''}`;
    const unreadReplyCount = unreadRepliesByProject[projectKey] || 0;

    const rowStatusClass = hasPassNotes && statusClass === 'status-pass' ? 'status-pass-note' : statusClass;

    return (
      <div key={run.id} className={`project-row ${rowStatusClass}`} onClick={() => openProject(run.projectName, run.testCycle)}>
        <div className="project-left">
          <div className="project-head">
            <span className="project-name">{run.projectName}</span>
            {run.testCycle && <span className="tag">{run.testCycle}</span>}
            {!run.deviceInfo && <span className="tag muted">Device pending</span>}
            
            {/* 7i: Project row Platforms Badge */}
            {run.platforms && run.platforms.length > 0 && (
              <span className="tag platforms-tag">
                {run.platforms.join(' · ')}
              </span>
            )}
            
            {hasPassNotes && (
              <span className="note-indicator">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                {passNoteCount} <span className="count">{passNoteCount === 1 ? 'Note' : 'Notes'}</span>
              </span>
            )}

            {unreadReplyCount > 0 && (
              <span className="reply-indicator has-new">
                <span className="reply-indicator-dot">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                </span>
                <span className="count">{unreadReplyCount}</span>
                new {unreadReplyCount === 1 ? 'reply' : 'replies'}
              </span>
            )}
          </div>
          <div className="project-meta">
            <span><strong>{run.testerName}</strong></span>
            {run.deviceInfo ? <span>{run.deviceInfo.device} · {run.deviceInfo.os} · {run.deviceInfo.browser}</span> : <span>Device specs pending</span>}
            {failedCount > 0 && <span>{failedCount} failure{failedCount > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className="project-right">
          <span className={`status-badge ${rowStatusClass.replace('status-', '')}`}><span className="pulse"></span> {statusLabel}</span>
          <div className="progress-row">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: '100%' }}>
                <div className={rowStatusClass === 'status-fail' ? 'bar-fail' : rowStatusClass === 'status-pass' ? 'bar-pass' : 'bar-info'} style={{ flex: pct }}></div>
                <div style={{ flex: 100 - pct, background: 'transparent' }}></div>
              </div>
            </div>
            <span className="progress-label">{comp} / {tot}</span>
          </div>
        </div>
      </div>
    );
  };

  const pendingTicketsCount = useMemo(
    () => Object.values(pendingTriage).filter(p => p.action === 'Ticketed').length,
    [pendingTriage]
  );
  
  const totalPendingCount = useMemo(() => Object.keys(pendingTriage).length, [pendingTriage]);
  
  const allDraftsApproved = useMemo(
    () => draftingModal.tickets.length > 0 && draftingModal.tickets.every(t => t.approved),
    [draftingModal.tickets]
  );
  
  const approvedDraftsCount = useMemo(
    () => draftingModal.tickets.filter(t => t.approved).length,
    [draftingModal.tickets]
  );
  
  const activeDraft = useMemo(
    () => draftingModal.tickets.find(t => t.id === draftingModal.activeTicketId),
    [draftingModal.tickets, draftingModal.activeTicketId]
  );
  
  const showLoading = useMemo(() => {
    if (!draftingModal.open) return false;
    const isReadyCount = draftingModal.tickets.filter(
      t => t.status === 'ready' || t.status === 'approved' || t.status === 'refining'
    ).length;
    return isReadyCount === 0 || activeDraft?.status === 'drafting';
  }, [draftingModal.open, draftingModal.tickets, activeDraft]);

  if (!hydrated) return null;

  return (
    <div className="triage-v2">
      <main className="main">
          <PageHead
            eyebrow={['Workspace', currentYear]}
            title={<>Triage <em>dashboard</em></>}
            sub="Real-time overview of your testing operations."
            actions={
              <div className="head-actions">
                <button 
                  className="btn btn-ghost" 
                  disabled={totalPendingCount === 0 || draftingModal.pushing} 
                  onClick={pendingTicketsCount > 0 ? openDraftingModal : commitNonJiraTriage}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  {draftingModal.pushing ? 'Saving...' : pendingTicketsCount > 0 ? `Review & Push Jira (${pendingTicketsCount})` : `Save Decisions (${totalPendingCount})`}
                </button>
                <button className="btn btn-primary" onClick={() => router.push('/home')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Create Project
                </button>
              </div>
            }
          />

          {successToast.show && (
            <div className="toast-success">
              <div className="toast-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div className="toast-content">
                <div className="toast-title">Pushed <em>{successToast.keys.length} ticket{successToast.keys.length !== 1 ? 's' : ''}</em> to Jira</div>
                <div className="toast-sub">{successToast.keys.join(', ')} · webhook listener active</div>
              </div>
            </div>
          )}

          <div className="stats-row">
            <div className="stat-card stat-results">
              <div className="stat-label">Test Results · {stats.totalSteps} Total</div>
              <div className="segmented-bar">
                <span className="seg-pass" style={{ width: stats.passedPct + '%' }}></span>
                <span className="seg-fail" style={{ width: stats.failedPct + '%' }}></span>
                <span className="seg-pend" style={{ width: stats.pendingPct + '%' }}></span>
              </div>
              <div className="legend">
                <div className="legend-item"><span className="legend-dot dot-pass"></span> Passed <b>{stats.passed}</b></div>
                <div className="legend-item"><span className="legend-dot dot-fail"></span> Failed <b>{stats.failed}</b></div>
                <div className="legend-item"><span className="legend-dot dot-pend"></span> Pending <b>{stats.remainingSteps}</b></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active Projects</div>
              <div className="stat-big"><span className="stat-value">{stats.projectsCount}</span><span className="stat-unit">projects</span></div>
              <div className="stat-breakdown" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="breakdown-item"><div className="bd-label">In progress</div><div className="bd-value">{stats.inProgressProjects}</div></div>
                <div className="breakdown-item"><div className="bd-label">Complete</div><div className="bd-value">{stats.completeProjects}</div></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Completion</div>
              <div className="stat-big"><span className="stat-value">{stats.completionPct}%</span></div>
              <div className="stat-breakdown" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="breakdown-item"><div className="bd-label">Completed</div><div className="bd-value">{stats.completedSteps}</div></div>
                <div className="breakdown-item"><div className="bd-label">Remaining</div><div className="bd-value">{stats.remainingSteps}</div></div>
              </div>
            </div>
          </div>

          <div className="toolbar">
            <span className="toolbar-label">Filter</span>
            <div className="search">
              <input type="text" placeholder="Search operations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <select className="select-compact" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="select-compact" value={filterCycle} onChange={e => setFilterCycle(e.target.value)}>
              {uniqueCycles.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select-compact" value={filterTester} onChange={e => setFilterTester(e.target.value)}>
              {uniqueTesters.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="project-list">
            {runsNeedsAttention.length > 0 && (
              <>
                <h3 className="section-heading">Needs Attention <span className="count">{runsNeedsAttention.length}</span></h3>
                {runsNeedsAttention.map(run => {
                  const failedAndNotesCount = run.steps.filter(s => {
                    const result = run.results?.[s.id] as ExtendedTestResult;
                    const isFail = result?.status === 'Failed';
                    const hasPassNote = result?.status === 'Passed' && (result.notes?.trim() || (result.noteChips && result.noteChips.length > 0));
                    return (isFail || hasPassNote) && !result?.isTriaged;
                  }).length;
                  return renderDashboardRow(run, 'status-fail', `${failedAndNotesCount} Issues`);
                })}
              </>
            )}
            
            {runsInProgress.length > 0 && (
              <>
                <h3 className="section-heading" style={{ marginTop: runsNeedsAttention.length ? 20 : 0 }}>In Progress <span className="count">{runsInProgress.length}</span></h3>
                {runsInProgress.map(run => renderDashboardRow(run, 'status-run', 'In Progress'))}
              </>
            )}

            {runsCompleted.length > 0 && (
              <>
                <h3 className="section-heading" style={{ marginTop: (runsNeedsAttention.length || runsInProgress.length) ? 20 : 0 }}>Completed <span className="count">{runsCompleted.length}</span></h3>
                {runsCompleted.map(run => renderDashboardRow(run, 'status-pass', 'Complete'))}
              </>
            )}
          </div>
        </main>

      {/* --- SIDE PANEL MULTI-TESTER TRIAGE --- */}
      <div className={`panel-overlay ${activeProjectKey ? 'open' : ''}`} onClick={closeProject}></div>
      <aside className={`side-panel ${activeProjectKey ? 'open' : ''}`}>
        {activeProject && (() => {
          return (
            <>
              <header className="panel-head">
                <div>
                  <h2 className="panel-title">{activeProject.projectName}</h2>
                  <p className="panel-sub">
                    <span>{activeProject.testers.length} testers</span>
                    <span>·</span><span>{activeProject.steps.length} steps each · {activeProject.steps.length * activeProject.testers.length} results total</span>
                    <span>·</span><span>{activeProject.runs.every(r => r.isCompleted) ? 'Run complete' : 'In progress'}</span>
                  </p>
                </div>
                <button className="close-btn" onClick={closeProject} aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </header>

              {/* TESTER STRIP */}
              <div className="tester-strip">
                <span className="tester-strip-label">Testers</span>
                <div className="tester-pills">
                  <button
                    className={`tester-pill ${selectedTesterId === 'everyone' ? 'active' : ''}`}
                    onClick={() => { setSelectedTesterId('everyone'); setShowTesterProfile(false); }}
                  >
                    <span className="tester-avatar" style={{background: 'rgba(255,255,255,0.15)'}}>All</span>
                    <span className="tester-pill-name">Everyone</span>
                  </button>

                  {/* 7g: Tester Platform Option logic mapped for Tester Strip */}
                  {testerPlatformOptions.map(tester => {
                    const hasIssues = tester.failCount > 0;
                    const hasNotes = tester.passNoteCount > 0;
                    const showPlatformSuffix = tester.platform && panelPlatformFilter === 'all';
                    // Check if they are legacy mapped inside a project with platforms
                    const isLegacy = tester.platform && activeProjectPlatforms.length > 0 && !activeProjectPlatforms.includes(tester.platform);

                    return (
                      <button
                        key={tester.id}
                        className={[
                          'tester-pill',
                          selectedTesterId === tester.id ? 'active' : '',
                          hasIssues ? 'has-issues' : '',
                          hasNotes ? 'has-notes' : '',
                        ].join(' ')}
                        onClick={() => {
                          setSelectedTesterId(tester.id);
                          setShowTesterProfile(true);
                        }}
                      >
                        <span className="tester-avatar" style={{background: tester.color}}>
                          {tester.initials}
                        </span>
                        <span className="tester-pill-name">
                          {tester.testerName}
                          {showPlatformSuffix ? ` (${tester.platform})` : ''}
                          {isLegacy ? <span className="legacy-suffix"> (legacy)</span> : ''}
                        </span>
                        {(hasIssues || hasNotes) && (
                          <span className="tester-pill-counts">
                            {hasIssues && <span className="fail-count">{tester.failCount}</span>}
                            {hasIssues && hasNotes && '·'}
                            {hasNotes && <span className="note-count">{tester.passNoteCount}</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SUMMARY BAR */}
              <div className="panel-summary">
                <div><div className="sc-label">Steps</div><div className="sc-value">{consensusStats?.total || 0}</div></div>
                <div><div className="sc-label">Consensus pass</div><div className="sc-value consensus">{consensusStats?.consensusPass || 0}</div></div>
                <div><div className="sc-label">Consensus fail</div><div className="sc-value fail">{consensusStats?.consensusFail || 0}</div></div>
                <div><div className="sc-label">Mixed results</div><div className="sc-value notes">{consensusStats?.mixed || 0}</div></div>
                <div><div className="sc-label">With notes</div><div className="sc-value notes">{consensusStats?.notes || 0}</div></div>
                <div><div className="sc-label">Pending triage</div><div className="sc-value fail">{consensusStats?.pendingTriage || 0}</div></div>
              </div>

              {/* FILTER CHIPS */}
              <div className="panel-toolbar">
                {/* 7f: Platform Filters */}
                {activeProjectIsPlatformed && (
                  <>
                    <button
                      className={`filter-chip platform-chip${panelPlatformFilter === 'all' ? ' active' : ''}`}
                      onClick={() => setPanelPlatformFilter('all')}
                    >
                      All platforms · {splitStepRows.length}
                    </button>
                    {activeProjectPlatforms.map(p => {
                      const count = splitStepRows.filter(r => r.platform === p).length;
                      return (
                        <button
                          key={p}
                          className={`filter-chip platform-chip${panelPlatformFilter === p ? ' active' : ''}`}
                          onClick={() => setPanelPlatformFilter(p)}
                        >
                          {p} · {count}
                        </button>
                      );
                    })}
                    <span style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 4px' }} />
                  </>
                )}

                <button className={`filter-chip ${panelFilter === 'all' ? 'active' : ''}`} onClick={() => setPanelFilter('all')}>
                  All statuses
                </button>
                <button className={`filter-chip ${panelFilter === 'fail' ? 'active' : ''}`} onClick={() => setPanelFilter('fail')}>
                  Consensus fail · {consensusStats?.consensusFail || 0}
                </button>
                <button className={`filter-chip ${panelFilter === 'mixed' ? 'active' : ''}`} onClick={() => setPanelFilter('mixed')}>
                  Mixed · {consensusStats?.mixed || 0}
                </button>
                <button className={`filter-chip ${panelFilter === 'notes' ? 'active' : ''}`} onClick={() => setPanelFilter('notes')}>
                  Notes · {consensusStats?.notes || 0}
                </button>
                <button className={`filter-chip ${panelFilter === 'passed' ? 'active' : ''}`} onClick={() => setPanelFilter('passed')}>
                  Clean passes · {consensusStats?.consensusPass || 0}
                </button>
              </div>

              {/* PANEL BODY (Step rows) */}
              <div className="panel-body">
                {visibleStepRows.map(row => {
                  const step = row.step;
                  const rowKey = row.key;
                  const isExpanded = expandedStepId === rowKey;
                  const isConsensusFail = step.consensus === 'fail';

                  return (
                    <div key={rowKey} className={`step-row ${isExpanded ? 'expanded' : ''} ${isConsensusFail ? 'consensus-fail' : ''}`}>
                      <div className="step-row-head" onClick={() => setExpandedStepId(prev => prev === rowKey ? null : rowKey)}>
                        <div>
                          <div className="step-num">Step {String(step.stepIndex + 1).padStart(2, '0')}</div>
                          {/* 7e/7j: Platform + Legacy tags */}
                          {row.platform && (
                            <div className="step-platform-tag">
                              {row.platform}
                              {!activeProjectPlatforms.includes(row.platform) && (
                                <span className="legacy-suffix"> (legacy)</span>
                              )}
                            </div>
                          )}
                          {step.area && <div className="step-num-sub">{step.area}</div>}
                        </div>
                        <div>
                          <div className="step-action">{step.action}</div>
                          <div className="step-expected">{step.expectedResult}</div>
                        </div>
                        {renderDotGrid(step)}
                        <div className="step-row-right">
                          <span className={`consensus-pill ${step.consensus}`}>
                            {consensusLabel(step)}
                          </span>
                          <svg className="expand-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="step-drill">
                          {renderStepDrill(step)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* FOOTER */}
              <footer className="panel-foot">
                {selectedBugs.length > 0 ? (
                  <>
                    <span className="bulk-label">{selectedBugs.length} test{selectedBugs.length > 1 ? 's' : ''} selected</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-ghost" onClick={bulkSnooze}>Snooze selected</button>
                      <button className="btn btn-primary" onClick={bulkTicket}>Ticket selected ({selectedBugs.length}) →</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="bulk-label">Select tests to bulk-triage</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn btn-primary" 
                        onClick={pendingTicketsCount > 0 ? openDraftingModal : commitNonJiraTriage} 
                        disabled={totalPendingCount === 0 || draftingModal.pushing}
                      >
                        {draftingModal.pushing ? 'Saving...' : pendingTicketsCount > 0 ? `Push to Jira (${pendingTicketsCount})` : `Save decisions (${totalPendingCount})`}
                      </button>
                    </div>
                  </>
                )}
              </footer>
            </>
          );
        })()}
      </aside>

      {/* --- TESTER PROFILE SLIDE-OUT --- */}
      {showTesterProfile && selectedTesterId !== 'everyone' && activeProject && (() => {
        // testerPlatformOptions maps 1:1 with runIds, and selectedTesterId tracks the runId
        const tester = testerPlatformOptions.find(t => t.id === selectedTesterId);
        if (!tester) return null;

        // Ensure we fetch from the correct run
        const grouped = groupRunsByProject(testRuns);
        const projectRuns = grouped.get(displayKey || '') || [];
        const run = projectRuns.find(r => r.id === tester.id);

        if (!run) return null;

        const theirIssues = run.steps
          .map(step => {
            const result = run.results?.[step.id];
            if (!result) return null;
            const isFailed = result.status === 'Failed';
            const hasPassNote = result.status === 'Passed' && (result.notes?.trim() || result.noteChips?.length);
            if (!isFailed && !hasPassNote) return null;
            return { step, result, kind: isFailed ? 'fail' : 'pass-note' as 'fail' | 'pass-note' };
          })
          .filter(Boolean);

        const issueCount = theirIssues.length;
        const hasIssues = issueCount > 0;
        const profileUnread = getUnreadReplyCount(tester.id);

        return (
          <>
            <div className="tester-profile-overlay open" onClick={() => setShowTesterProfile(false)} />
            <aside className="tester-profile open">
              <div className="profile-head">
                <div className="profile-avatar" style={{background: tester.color}}>{tester.initials}</div>
                <div style={{flex: 1}}>
                  <div className="profile-name">
                    {tester.testerName}
                    {tester.platform && <span style={{marginLeft: 8, fontSize: 10, background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 4, verticalAlign: 'middle', fontFamily: '"JetBrains Mono", monospace'}}>{tester.platform}</span>}
                  </div>
                  {run.deviceInfo && (
                    <div className="profile-meta">{run.deviceInfo.device} · {run.deviceInfo.os} · {run.deviceInfo.browser}</div>
                  )}
                </div>
                <button className="profile-close" onClick={() => setShowTesterProfile(false)} aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <div className="profile-stats">
                <div><div className="ps-label">Steps</div><div className="ps-value">{run.steps?.length || 0}</div></div>
                <div><div className="ps-label">Passed</div><div className="ps-value">{(run.steps?.length || 0) - tester.failCount}</div></div>
                <div><div className="ps-label">Failed</div><div className="ps-value fail">{tester.failCount}</div></div>
                <div><div className="ps-label">Noted</div><div className="ps-value note">{tester.passNoteCount}</div></div>
              </div>

              {hasIssues && (
                <div className="profile-actions">
                  <div className="pa-heading">
                    Contact {tester.testerName.split(' ')[0]}
                    <span style={{fontWeight: 400, color: 'var(--ink-mute)', textTransform: 'none', letterSpacing: 0, fontSize: 11}}>
                      · {issueCount} issue{issueCount > 1 ? 's' : ''} to follow up
                    </span>
                  </div>
                  <button className="pa-btn in-app" onClick={() => openContactGeneral({id: tester.id, runId: tester.id, name: tester.testerName, initials: tester.initials, color: tester.color}, 'in-app')}>
                    <div className="pa-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    </div>
                    <div>
                      <div className="pa-label">
                        Message in-app
                        {profileUnread > 0 && <span style={{marginLeft: 8, color: 'var(--info)', fontWeight: 600}}>· {profileUnread} new</span>}
                      </div>
                      <div className="pa-sub">
                        {profileUnread > 0 ? `${profileUnread} unread repl${profileUnread === 1 ? 'y' : 'ies'} from ${tester.testerName.split(' ')[0]}` : `${tester.testerName.split(' ')[0]} sees it when they reopen the run`}
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {hasIssues && (
                <div className="profile-issues">
                  <div className="pi-heading">{tester.testerName.split(' ')[0]}&apos;s issues ({issueCount})</div>
                  {theirIssues.map((issue, idx) => issue && (
                    <div
                      key={idx}
                      className="pi-item"
                      onClick={() => {
                        // Expanding from profile needs to open the correct split row key!
                        setExpandedStepId(`${issue.step.id}::${tester.platform || ''}`);
                        setShowTesterProfile(false);
                      }}
                    >
                      <span className={`pi-dot ${issue.kind}`}></span>
                      <div className="pi-content">
                        <div className="pi-step">Step {(run.steps.findIndex(s => s.id === issue.step.id) + 1).toString().padStart(2, '0')}{issue.step.area ? ` · ${issue.step.area}` : ''}</div>
                        <div className="pi-action">{issue.step.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!hasIssues && (
                <div style={{padding: '30px 20px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13}}>
                  <div style={{marginBottom: 8}}>✓</div>
                  No issues flagged by {tester.testerName.split(' ')[0]}.
                </div>
              )}
            </aside>
          </>
        );
      })()}

      {/* --- CONTACT MODAL (Thread or Compose) --- */}
      {contactModal && (
        <div className="cm-overlay open" onClick={() => setContactModal(null)}>
          <div className={`contact-modal ${!contactModal.activeThread ? 'compose-mode' : ''}`} onClick={e => e.stopPropagation()}>

            <div className="cm-head">
              <div>
                <h2 className="cm-head-title">
                  {contactModal.activeThread
                    ? `Conversation with ${contactModal.tester.name}`
                    : `Message ${contactModal.tester.name}`}
                </h2>
                {contactModal.stepAction ? (
                  <p className="cm-head-sub">About <strong>Step {(contactModal.stepIndex ?? 0) + 1} · {contactModal.stepAction}</strong></p>
                ) : (
                  <p className="cm-head-sub">General follow-up on <strong>{activeProject?.projectName}</strong></p>
                )}
              </div>
              <button className="cm-close" onClick={() => setContactModal(null)} aria-label="Close">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {contactModal.activeThread ? (
              // ─── THREAD VIEW ───
              <>
                {contactModal.tester && (
                  <div className="cm-context-bar">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                    {contactModal.tester.name.split(' ')[0]} was testing on <strong>
                      {(() => {
                        const run = testRuns.find(tr => tr.id === contactModal.runId);
                        return run?.deviceInfo
                          ? `${run.deviceInfo.device} · ${run.deviceInfo.os} · ${run.deviceInfo.browser}`
                          : 'unknown device';
                      })()}
                    </strong>
                  </div>
                )}

                <div className="cm-thread">
                  {contactModal.activeThread.root.contextNote && (
                    <div className="original-note">
                      <div className="original-note-label">
                        {contactModal.tester.name.split(' ')[0]}&apos;s original note while testing
                      </div>
                      <div className="original-note-body">
                        &quot;{contactModal.activeThread.root.contextNote}&quot;
                      </div>
                      {contactModal.activeThread.root.contextChips && contactModal.activeThread.root.contextChips.length > 0 && (
                        <div className="original-note-chips">
                          {contactModal.activeThread.root.contextChips.map(c => (
                            <span key={c} className="original-note-chip">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="msg-bubble from-pm">
                    <div className="msg-bubble-meta">
                      You · {formatRelativeTime(contactModal.activeThread.root.createdAt)}
                    </div>
                    <div className="msg-bubble-body">{contactModal.activeThread.root.body}</div>
                  </div>

                  {contactModal.activeThread.replies.map(reply => (
                    <div
                      key={reply.id}
                      className={`msg-bubble from-tester ${!reply.readByPm ? 'unread' : ''}`}
                    >
                      <div className="msg-bubble-meta">
                        {!reply.readByPm && <span className="unread-dot"></span>}
                        {contactModal.tester.name.split(' ')[0]} · {formatRelativeTime(reply.createdAt)}
                        {!reply.readByPm && ' · new'}
                      </div>
                      <div className="msg-bubble-body">{reply.body}</div>
                    </div>
                  ))}
                </div>

                <div className="cm-reply-area">
                  <textarea
                    className="cm-reply-textarea"
                    placeholder={`Reply to ${contactModal.tester.name.split(' ')[0]}...`}
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    autoFocus
                  />
                  <div className="cm-reply-row">
                    <span className="cm-reply-note">
                      {contactModal.tester.name.split(' ')[0]} gets this next time they open the run
                    </span>
                    <button
                      className="cm-reply-btn"
                      onClick={handleSendReplyFromThread}
                      disabled={!contactMessage.trim() || isSendingMessage}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                      </svg>
                      {isSendingMessage ? 'Sending...' : 'Send reply'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // ─── COMPOSE VIEW ───
              <>
                <div className="compose-body">
                  {contactModal.originalResult && (contactModal.originalResult.notes || contactModal.originalResult.noteChips?.length) && (
                    <div className="cm-context">
                      <div className="cm-context-label">{contactModal.tester.name.split(' ')[0]}&apos;s original note</div>
                      <div className="cm-context-step">
                        {contactModal.originalResult.status}
                        {contactModal.originalResult.noteChips?.length ? ` · ${contactModal.originalResult.noteChips.join(', ')}` : ''}
                      </div>
                      {contactModal.originalResult.notes && (
                        <div className="cm-context-note">&quot;{contactModal.originalResult.notes}&quot;</div>
                      )}
                    </div>
                  )}

                  <div className="cm-compose-label">Your message</div>
                  <textarea
                    className="cm-compose-textarea"
                    placeholder={`Hi ${contactModal.tester.name.split(' ')[0]}, thanks for flagging this. Could you share more detail on...`}
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    autoFocus
                  />

                  <div className="cm-compose-label">Send via</div>
                  <div className="cm-channel-choice">
                    <span
                      className={`cm-channel ${contactChannel === 'in-app' ? 'selected' : ''}`}
                      onClick={() => setContactChannel('in-app')}
                    >
                      <div className="cm-channel-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                      </div>
                      <div className="cm-channel-name">In-app message</div>
                      <div className="cm-channel-desc">{contactModal.tester.name.split(' ')[0]} sees it on next run</div>
                    </span>
                    {contactModal.tester.email && (
                      <span
                        className={`cm-channel mailto ${contactChannel === 'mailto' ? 'selected' : ''}`}
                        onClick={() => setContactChannel('mailto')}
                      >
                        <div className="cm-channel-icon">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        </div>
                        <div className="cm-channel-name">Email</div>
                        <div className="cm-channel-desc">{contactModal.tester.email}</div>
                      </span>
                    )}
                  </div>
                </div>

                <div className="panel-foot">
                  <span className="cm-reply-note">
                    {contactModal.stepAction ? 'Context & note auto-attached' : 'Project context attached'}
                  </span>
                  <div style={{display: 'flex', gap: 8}}>
                    <button className="cm-btn secondary" onClick={() => setContactModal(null)}>Cancel</button>
                    <button
                      className="cm-btn"
                      onClick={handleSendMessage}
                      disabled={!contactMessage.trim() || isSendingMessage}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      {isSendingMessage ? 'Sending...' : contactChannel === 'mailto' ? 'Open mail client' : 'Send message'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* --- AI JIRA DRAFTING MODAL --- */}
      {draftingModal.open && (
        <div className="panel-overlay open" style={{ zIndex: 3000 }} onClick={() => {}}>
          <div className="ai-modal" style={{ position: 'fixed', top: '8vh', left: '5vw', right: '5vw', width: '90vw', margin: 0, zIndex: 3001, borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
            <div className="ai-modal-head">
              <div className="head-left">
                <div className="ai-mark">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                  <h2 className="head-title">
                    {allDraftsApproved 
                      ? `All ${draftingModal.tickets.length} tickets approved` 
                      : <>Drafting <em>{draftingModal.tickets.length} Jira ticket{draftingModal.tickets.length === 1 ? '' : 's'}</em></>}
                  </h2>
                  <span className="head-sub">{activeProject?.projectName} {activeProject?.testCycle ? `· Cycle: ${activeProject.testCycle}` : '· UAT'}</span>
                </div>
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                {allDraftsApproved ? (
                  <span className="head-stat" style={{ background: 'var(--pass-soft)', borderColor: 'rgba(74,124,89,0.25)', color: 'var(--pass)' }}>
                    <strong>Ready</strong>
                  </span>
                ) : (
                  <span className="head-stat">
                    {approvedDraftsCount === draftingModal.tickets.length 
                      ? `All ${draftingModal.tickets.length} approved` 
                      : `${approvedDraftsCount} of ${draftingModal.tickets.length} approved`}
                  </span>
                )}
                <button className="close-btn" onClick={() => setDraftingModal({ open: false, tickets: [], activeTicketId: null, refining: false, pushing: false })} aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {allDraftsApproved ? (
              // FINAL REVIEW VIEW (All Approved)
              <div className="ai-modal-body" style={{ gridTemplateColumns: '1fr', padding: '0 40px', overflowY: 'auto' }}>
                <div style={{ maxWidth: 800, margin: '20px auto 40px', width: '100%' }}>
                  <div style={{ marginBottom: 24, padding: '14px 18px', background: 'var(--pass-soft)', border: '1px solid rgba(74,124,89,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'var(--pass)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: 'var(--pass)', letterSpacing: '-0.01em' }}>All {draftingModal.tickets.length} drafts approved — ready to ship</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>Tickets will be created on the <strong>PROOF</strong> board with attached evidence and tester context.</div>
                    </div>
                  </div>

                  <div className="section-label">Tickets to create · {draftingModal.tickets.length}</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {draftingModal.tickets.map(t => (
                      <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${priorityColor(t.severity)}`, borderRadius: 8, padding: '12px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 14, alignItems: 'center' }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--ink-mute)', fontWeight: 600, minWidth: 56 }}>
                          Step {t.stepIndex + 1 < 10 ? '0'+(t.stepIndex+1) : t.stepIndex+1}
                          {/* 8f: Display platform in final review */}
                          {t.platform && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>· {t.platform}</span>}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-mute)' }}>{t.sources.length} testers · {t.evidenceUrls.length} attachments</div>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: '3px 9px', background: `${priorityColor(t.severity)}15`, color: priorityColor(t.severity), borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: priorityColor(t.severity) }}></span> {t.severity}
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--jira)', fontWeight: 600 }}>→ PROOF</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 28, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 }}>
                    <div className="section-label" style={{ margin: '0 0 10px' }}>After push · automatic actions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--ink-soft)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pass)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Triage Board pills update with linked Jira IDs
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pass)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Tester evidence uploaded to each ticket
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pass)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Webhook listener will track each ticket&rsquo;s status
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : showLoading ? (
              // LOADING OVERLAY
              <div className="ai-modal-body" style={{ gridTemplateColumns: '1fr' }}>
                <div className="loading-overlay">
                  <div className="loading-mark">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  </div>
                  <h2 className="loading-title">Working on your <em>tickets</em>...</h2>
                  <p className="loading-sub">Reading reports, finding patterns, and drafting clear reproduction steps. Each ticket gets the same care a senior QA engineer would give it.</p>
                  <div className="loading-progress">
                    <div className={`lp-step ${loadingStepIdx >= 1 ? 'done' : 'active'}`}>
                      <div className="lp-step-icon">{loadingStepIdx >= 1 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> : <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg>}</div>
                      Read {draftingModal.tickets.reduce((sum, t) => sum + t.sources.length, 0)} tester reports across {draftingModal.tickets.length} steps
                    </div>
                    <div className={`lp-step ${loadingStepIdx >= 2 ? 'done' : loadingStepIdx === 1 ? 'active' : ''}`}>
                      <div className="lp-step-icon">{loadingStepIdx >= 2 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> : loadingStepIdx === 1 ? <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg> : null}</div>
                      Identified device patterns &amp; common themes
                    </div>
                    <div className={`lp-step ${loadingStepIdx >= 3 ? 'done' : loadingStepIdx === 2 ? 'active' : ''}`}>
                      <div className="lp-step-icon">{loadingStepIdx >= 3 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> : loadingStepIdx === 2 ? <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg> : null}</div>
                      Drafting reproduction steps &amp; severity
                    </div>
                    <div className={`lp-step ${loadingStepIdx === 3 ? 'active' : ''}`}>
                      <div className="lp-step-icon">{loadingStepIdx === 3 ? <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg> : null}</div>
                      Cross-referencing with screenshots
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // 3-COLUMN LAYOUT
              <div className="ai-modal-body with-sources" id="modalBody">
                {/* Left Column: List */}
                <div className="list-panel">
                  <div className="list-head">
                    <span className="list-label">Pending tickets · {draftingModal.tickets.length}</span>
                    <span className="list-progress">{approvedDraftsCount}/{draftingModal.tickets.length} done</span>
                  </div>
                  <div className="list-items">
                    {draftingModal.tickets.map(t => {
                      const isActive = t.id === draftingModal.activeTicketId;
                      return (
                        <div key={t.id} className={`list-item ${isActive ? 'active' : ''} ${t.approved ? 'approved' : ''}`} onClick={() => setDraftingModal(prev => ({ ...prev, activeTicketId: t.id }))}>
                          <div className="li-status-row">
                            {t.status === 'queued' && <span className="li-status queued">Queued</span>}
                            {t.status === 'drafting' && <span className="li-status drafting">Drafting</span>}
                            {t.status === 'ready' && <span className="li-status ready">Ready</span>}
                            {t.status === 'refining' && <span className="li-status refining">Refining</span>}
                            {t.status === 'approved' && <span className="li-status approved">Approved</span>}
                            {/* 8d: Display platform in the ticket list panel */}
                            <span className="li-step-num">
                              Step {t.stepIndex + 1 < 10 ? '0'+(t.stepIndex+1) : t.stepIndex+1}
                              {t.platform && <span className="li-platform"> · {t.platform}</span>}
                            </span>
                          </div>
                          {(t.status === 'queued' || t.status === 'drafting') ? (
                            <>
                              <div className="li-shimmer"></div>
                              <div className="li-shimmer short"></div>
                            </>
                          ) : (
                            <>
                              <div className="li-title">{t.title || 'Drafting...'}</div>
                              <div className="li-meta">
                                <span className={`li-priority-dot ${t.severity.toLowerCase().includes('high') || t.severity.toLowerCase() === 'critical' ? 'high' : t.severity === 'Medium' ? 'medium' : 'low'}`}></span>
                                <span className="li-priority-text">{t.severity}</span>
                                <span className="li-testers">· {t.sources.length} testers</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Middle Column: Draft View */}
                {activeDraft && (
                  <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div className="draft-column" style={{ opacity: activeDraft.status === 'refining' ? 0.6 : 1, transition: 'opacity 0.3s' }}>
                      <span className="citation-hint">Hover claims to trace sources</span>
                      <div className="detail-meta-row">
                        <span className="detail-tag bug">Bug</span>
                        <span className="detail-tag step">Step {activeDraft.stepIndex + 1}</span>
                        {/* 8e: Display platform in the draft column */}
                        {activeDraft.platform && <span className="detail-tag detail-tag-platform">{activeDraft.platform}</span>}
                        <span className="detail-tag testers">{activeDraft.sources.length} testers</span>
                        <span 
                          className={`detail-tag priority ${activeDraft.severity.toLowerCase().includes('high') || activeDraft.severity.toLowerCase() === 'critical' ? 'high' : ''}`} 
                          style={{
                            background: priorityColor(activeDraft.severity) + '15',
                            color: priorityColor(activeDraft.severity),
                            ['--priority-dot-color' as any]: priorityColor(activeDraft.severity),
                          }}
                        >
                          {activeDraft.severity} priority
                        </span>
                        <span className="detail-tag ai-drafted">AI drafted</span>
                      </div>
                      
                      <h2 className="detail-title">{activeDraft.title}</h2>

                      <div className="section-label ai">Description</div>
                      <div className="content-block">
                        {renderDescriptionWithCitations(activeDraft.description, activeDraft.citations || [])}
                      </div>

                      <div className="section-label">Steps to reproduce</div>
                      <div className="content-block">
                        <ol>
                          {(activeDraft.stepsToReproduce || []).map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                      </div>

                      <div className="meta-grid">
                        <div className="meta-card">
                          <div className="meta-card-label">Expected behaviour</div>
                          <div className="meta-card-content">{activeDraft.expectedBehavior}</div>
                        </div>
                        <div className="meta-card">
                          <div className="meta-card-label">Actual behaviour</div>
                          <div className="meta-card-content">{renderDescriptionWithCitations(activeDraft.actualBehavior, activeDraft.citations || [])}</div>
                        </div>
                      </div>

                      <div className="section-label">Severity</div>
                      <div className="severity-row">
                        {(['Critical', 'High', 'Medium', 'Low', 'Enhancement'] as const).map(level => (
                          <span key={level} className={`severity-chip ${activeDraft.severity === level ? 'selected' : ''}`} style={activeDraft.severity === level ? { background: priorityColor(level), borderColor: priorityColor(level), color: '#fff' } : {}}>
                            <span className="severity-chip-dot" style={{ background: activeDraft.severity === level ? '#fff' : priorityColor(level) }}></span>{level}
                          </span>
                        ))}
                      </div>
                      <div className="ai-suggestion">
                        <span><strong>AI suggests {activeDraft.severity}</strong> · {renderDescriptionWithCitations(activeDraft.severityReasoning, activeDraft.citations || [])}</span>
                      </div>
                    </div>
                    
                    {/* Refine Bar */}
                    <div className="refine-bar">
                      <div className="refine-label">Refine with AI</div>
                      <div className="refine-chips">
                        {REFINEMENT_CHIPS.map(c => (
                          <button key={c.label} className="refine-chip" onClick={() => handleRefine(c.instruction)} disabled={draftingModal.refining}>{c.label}</button>
                        ))}
                      </div>
                      <div className="refine-input-row">
                        <input className="refine-input" placeholder='Or describe a change — "make it sound more urgent"' value={refineInput} onChange={e => setRefineInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRefine(refineInput)} disabled={draftingModal.refining} />
                        <button className="refine-send" onClick={() => handleRefine(refineInput)} disabled={!refineInput.trim() || draftingModal.refining}>
                          Refine
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Right Column: Sources */}
                {activeDraft && (
                  <div className="sources-column">
                    <div className="sources-head">
                      <div className="sources-head-title">Sources · {activeDraft.sources.length} testers</div>
                      <div className="sources-head-sub">All raw reports for Step {activeDraft.stepIndex + 1}. Hover a claim on the left to <strong>trace its sources</strong>.</div>
                    </div>
                    <div className="sources-list">
                      {activeDraft.sources.map(s => (
                        <div key={s.testerId} className={`source-card ${s.status === 'Failed' ? 'fail' : 'pass-note'}`} data-tester={s.testerId} id={`source-${s.testerId}`}>
                          <div className="sc-head">
                            <div className="sc-avatar" style={{ background: colorForTester(s.testerName) }}>{initialsFor(s.testerName)}</div>
                            <span className="sc-name">{s.testerName}</span>
                            <span className={`sc-status ${s.status === 'Failed' ? 'fail' : 'note'}`}>{s.status}</span>
                          </div>
                          <div className="sc-device">{s.deviceInfo.device} · {s.deviceInfo.os} · {s.deviceInfo.browser}</div>
                          {s.noteChips && s.noteChips.length > 0 && (
                            <div className="sc-chips">
                              {s.noteChips.map(c => <span key={c} className={`sc-chip ${s.status !== 'Failed' ? 'amber' : ''}`}>{c}</span>)}
                            </div>
                          )}
                          {s.notes && <div className="sc-quote">&ldquo;{s.notes}&rdquo;</div>}
                          {s.evidenceUrls && s.evidenceUrls.length > 0 && (
                            <div className="sc-evidence-row">
                              {s.evidenceUrls.map((u, i) => (
                                <div key={i} className="sc-evidence" onClick={() => openViewer(s.evidenceUrls!, i)} title="View attachment">
                                  {getMediaType(u) === 'video' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="6 4 20 12 6 20 6 4"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SVG overlay for connector lines */}
                <svg className="connector-svg" id="connectorSvg"></svg>
              </div>
            )}

            {/* FOOTER */}
            <div className="ai-modal-foot">
              <div className="foot-status">
                <span className="foot-counter">
                  {allDraftsApproved 
                    ? <em>{approvedDraftsCount} of {draftingModal.tickets.length}</em> 
                    : <strong>{approvedDraftsCount} of {draftingModal.tickets.length}</strong>} approved · {draftingModal.tickets.length - approvedDraftsCount === 0 ? 'ready to push' : `${draftingModal.tickets.length - approvedDraftsCount} to review`}
                </span>
                {!allDraftsApproved && activeDraft && !activeDraft.approved && activeDraft.status !== 'drafting' && activeDraft.status !== 'refining' && (
                  <button className="approve-mini" onClick={() => approveTicket(activeDraft.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Approve this ticket
                  </button>
                )}
              </div>
              <div className="foot-actions">
                {allDraftsApproved ? (
                  <button className="foot-btn ghost" onClick={() => setDraftingModal(prev => ({ ...prev, tickets: prev.tickets.map(t => ({ ...t, approved: false })) }))}>Back to review</button>
                ) : (
                  <button className="foot-btn ghost" onClick={() => setDraftingModal({ open: false, tickets: [], activeTicketId: null, refining: false, pushing: false })}>Cancel all</button>
                )}
                <button className="foot-btn primary" disabled={draftingModal.pushing || approvedDraftsCount === 0} onClick={handleFinalPush}>
                  <span className="jira-mark">J</span>
                  {draftingModal.pushing ? 'Pushing to Jira...' : allDraftsApproved ? `Push ${approvedDraftsCount} tickets to PROOF board` : `Push ${approvedDraftsCount} to Jira (${draftingModal.tickets.length - approvedDraftsCount} unapproved)`}
                  {allDraftsApproved && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 4 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL QR MODAL */}
      {qrModalOpen && (
        <div className="qr-full" onClick={(e) => { if(e.target === e.currentTarget) setQrModalOpen(false); }}>
          <div className="qr-full-card">
            <div className="qr-full-eyebrow">{qrTarget ? `Step ${qrTarget.stepId} · Reference Material` : 'Scan'}</div>
            <h3 className="qr-full-title">Scan to upload from phone</h3>
            <div className="qr-full-img">
              {uploadUrl ? <QRCodeSVG value={uploadUrl} size={220} /> : <div className="qr-full-pattern"></div>}
              <div className="qr-corner tl"></div><div className="qr-corner tr"></div><div className="qr-corner bl"></div>
            </div>
            <div className="qr-instructions">
              <div className="qr-step-item"><div className="qr-step-num">1</div><div>Open your phone's camera and point it at the code</div></div>
              <div className="qr-step-item"><div className="qr-step-num">2</div><div>Tap the notification to open the upload page</div></div>
              <div className="qr-step-item"><div className="qr-step-num">3</div><div>Take photos or videos — they attach here automatically</div></div>
            </div>
            <div className="qr-waiting">Waiting for device...</div>
            <button className="qr-close-btn" onClick={() => setQrModalOpen(false)}>Close</button>
          </div>
        </div>
      )}

    </div>
  );
}