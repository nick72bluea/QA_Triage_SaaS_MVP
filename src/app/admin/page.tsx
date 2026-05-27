"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { TestRunData, TestStep, TestResult } from '@/types';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { PageHead } from '@/components/PageHead';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { brandingSnapshotFrom } from '@/types/workspace';

// ─── Sidebar is NOT imported here — it lives in layout.tsx ───

type ViewState = 'LIST' | 'DETAIL';
interface ExtendedTestResult extends TestResult { isTriaged?: boolean; }

const getMediaType = (url: string) => {
  if (url.toLowerCase().match(/\.(mp4|webm|ogg|mov)(?=\?|$)/i)) return 'video';
  if (url.toLowerCase().match(/\.(pdf)(?=\?|$)/i)) return 'pdf';
  return 'image';
};

const getAvatarColor = (name: string) => {
  const COLORS = ['#3d5a80', '#a6421f', '#b8860b', '#6a4a7c', '#4a7c59'];
  let hash = 0;
  if (!name) return COLORS[0];
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
};

const AdminStyles = React.memo(() => (
  <style dangerouslySetInnerHTML={{__html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

    :root, .admin-page {
      --bg: #f4f3ef; --surface: #ffffff; --surface-alt: #fafaf7;
      --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f;
      --line: #e5e2db; --line-strong: #d4d0c7;
      --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329;
      --pass: #4a7c59; --pass-soft: #e8f0eb;
      --fail: #a6421f; --fail-soft: #f7e8e2;
      --warn: #b8860b; --warn-soft: #f9f0da;
      --info: #3d5a80; --info-soft: #e5ecf2;
      --purple: #6a4a7c; --purple-soft: rgba(106,74,124,0.12);
      --radius: 6px;
    }
    .admin-page * { box-sizing: border-box; }
    .admin-page { min-height: 100vh; background: var(--bg); font-family: 'IBM Plex Sans', system-ui, sans-serif; color: var(--ink); font-size: 14px; }

    .main { padding: 32px 40px 60px; max-width: 1400px; display: flex; flex-direction: column; margin: 0 auto; width: 100%; }
    .project-head { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-shrink: 0; }
    .breadcrumb { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .breadcrumb a { color: var(--ink-mute); text-decoration: none; cursor: pointer; }
    .breadcrumb a:hover { color: var(--ink); }
    .breadcrumb .sep { opacity: 0.4; }
    .breadcrumb .current { color: var(--ink); }
    .project-title-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .project-title { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
    .project-tags { display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
    .tag { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 8px; border-radius: 4px; background: var(--info-soft); color: var(--info); }
    .tag.cycle { background: var(--purple-soft); color: var(--purple); }
    .project-stats { display: flex; gap: 22px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
    .project-stat .ps-label { color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.1em; font-size: 9px; margin-bottom: 2px; }
    .project-stat .ps-value { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: var(--ink); }

    .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; position: relative; }
    .search { position: relative; flex: 1; min-width: 260px; max-width: 520px; }
    .search input { width: 100%; height: 40px; padding: 0 12px 0 40px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-family: inherit; font-size: 13px; color: var(--ink); transition: all 0.15s ease; }
    .search input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .search svg.search-ico { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--ink-mute); }
    .search .kbd-hint { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 2px 6px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 3px; color: var(--ink-mute); pointer-events: none; }
    .chip-filter { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-chip { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: 999px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .filter-chip .chip-count { background: var(--surface-alt); padding: 1px 5px; border-radius: 999px; font-size: 9px; }
    .filter-chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .filter-chip.active .chip-count { background: rgba(255,255,255,0.15); color: #fff; }
    .filter-chip:hover:not(.active) { background: var(--surface-alt); }
    .sort-select { height: 34px; padding: 0 28px 0 12px; font-family: inherit; font-size: 12px; color: var(--ink-soft); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2355524d' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 10px center; margin-left: auto; }

    .bulk-bar { position: sticky; top: 16px; background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 8px; display: none; align-items: center; gap: 12px; margin-bottom: 16px; z-index: 5; box-shadow: 0 10px 30px rgba(0,0,0,0.15); animation: slideDown 0.25s ease; }
    .bulk-bar.show { display: flex; }
    @keyframes slideDown { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .bulk-count { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
    .bulk-actions { margin-left: auto; display: flex; gap: 6px; }
    .bulk-btn { padding: 6px 12px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); color: #fff; border-radius: 4px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .bulk-btn:hover { background: rgba(255,255,255,0.12); }

    #project-list { display: flex; flex-direction: column; gap: 8px; }
    .section-heading { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin: 28px 0 12px; display: flex; align-items: center; gap: 10px; }
    .section-heading:first-child { margin-top: 0; }
    .section-heading::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .section-heading .count { background: var(--surface); border: 1px solid var(--line); padding: 2px 8px; border-radius: 999px; color: var(--ink-soft); font-weight: 500; }
    .section-group { display: flex; flex-direction: column; gap: 6px; }

    .project-row { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--line-strong); border-radius: 8px; padding: 14px 18px; display: grid; grid-template-columns: 16px 1fr 220px 160px auto; gap: 16px; align-items: center; cursor: pointer; transition: all 0.15s ease; position: relative; }
    .project-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-color: var(--line-strong); }
    .project-row.status-need { border-left-color: var(--warn); }
    .project-row.status-active { border-left-color: var(--info); }
    .project-row.status-done { border-left-color: var(--pass); opacity: 0.82; }
    .project-row.status-done:hover { opacity: 1; }
    .project-row.highlighted { box-shadow: 0 0 0 2px var(--accent); border-color: var(--accent); }
    .project-row.has-popover { z-index: 50; }

    .row-check { width: 16px; height: 16px; border: 1.5px solid var(--line-strong); border-radius: 3px; background: var(--surface); cursor: pointer; opacity: 0; transition: opacity 0.15s ease; }
    .project-row:hover .row-check, .row-check.checked { opacity: 1; }
    .row-check.checked { background: var(--accent); border-color: var(--accent); position: relative; }
    .row-check.checked::after { content: ''; position: absolute; top: 1px; left: 4px; width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }

    .project-main { min-width: 0; }
    .project-name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
    .project-name { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
    .tag.live { background: var(--pass-soft); color: var(--pass); display: inline-flex; align-items: center; gap: 4px; }
    .tag.live::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--pass); animation: livePulse 1.6s ease-in-out infinite; }
    .project-story { font-size: 12px; color: var(--ink-mute); line-height: 1.5; }
    .project-story b { color: var(--ink-soft); font-weight: 500; }

    .avatar-block { display: flex; flex-direction: column; gap: 5px; }
    .avatar-block-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); }
    .avatar-stack { display: flex; align-items: center; gap: 8px; }
    .avatars { display: flex; }
    .avatars .mini-avatar { width: 26px; height: 26px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; font-family: 'JetBrains Mono', monospace; border: 2px solid var(--surface); margin-left: -6px; position: relative; transition: transform 0.2s ease; }
    .avatars .mini-avatar:first-child { margin-left: 0; }
    .avatars .mini-avatar:hover { transform: translateY(-2px); z-index: 3; }
    .avatars .mini-avatar.live::after { content: ''; position: absolute; bottom: -1px; right: -1px; width: 9px; height: 9px; border-radius: 50%; background: var(--pass); border: 2px solid var(--surface); animation: livePulse 1.6s ease-in-out infinite; }
    .avatars .more { background: var(--line); color: var(--ink-soft); font-size: 9px; }
    .avatar-empty { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--warn); text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 8px; background: var(--warn-soft); border-radius: 4px; font-weight: 500; }
    .avatar-empty::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--warn); }

    .progress-block { display: flex; flex-direction: column; gap: 5px; }
    .progress-block-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); display: flex; justify-content: space-between; }
    .progress-block-label .val { color: var(--ink); font-weight: 500; }
    .progress-segmented { height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; display: flex; }
    .progress-segmented .seg { height: 100%; }
    .seg.pass { background: var(--pass); } .seg.fail { background: var(--fail); } .seg.pend { background: var(--warn); }

    .row-actions { display: flex; gap: 4px; align-items: center; position: relative; }
    .action-btn { width: 34px; height: 34px; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-mute); transition: all 0.15s ease; position: relative; }
    .action-btn:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
    .action-btn::before { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%) translateY(4px); background: var(--ink); color: #fff; font-size: 10px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 8px; border-radius: 4px; white-space: nowrap; pointer-events: none; opacity: 0; transition: all 0.15s ease; z-index: 5; }
    .action-btn:hover::before { opacity: 1; transform: translateX(-50%) translateY(0); }
    .action-btn.disabled { opacity: 0.35; cursor: not-allowed; }
    .action-btn.disabled:hover { background: var(--surface); color: var(--ink-mute); border-color: var(--line); }

    .tabs-bar { padding: 0 32px; border-bottom: 1px solid var(--line); background: var(--surface); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .tabs { display: flex; gap: 0; }
    .tab { padding: 14px 20px; font-family: inherit; font-size: 13px; font-weight: 500; color: var(--ink-mute); background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: color 0.15s ease, border-color 0.15s ease; display: inline-flex; align-items: center; gap: 8px; margin-bottom: -1px; }
    .tab:hover { color: var(--ink); }
    .tab.active { color: var(--ink); border-color: var(--accent); }
    .tab .tab-count { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 2px 6px; background: var(--surface-alt); color: var(--ink-mute); border-radius: 4px; font-weight: 500; }
    .tab.active .tab-count { background: var(--accent-soft); color: var(--accent); }
    .live-indicator { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; color: var(--pass); padding: 3px 10px; background: var(--pass-soft); border-radius: 999px; text-transform: uppercase; letter-spacing: 0.08em; }
    .live-indicator .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pass); animation: livePulse 1.4s ease-in-out infinite; }

    .tab-panels { flex: 1; }
    .tab-panel { display: none; padding: 24px 32px 60px; max-width: 1200px; margin: 0 auto; }
    .tab-panel.active { display: block; }

    .script-intro { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--ink-soft); }
    .script-intro svg { color: var(--accent); flex-shrink: 0; }
    .script-intro b { color: var(--ink); font-weight: 500; }
    .script-list { display: flex; flex-direction: column; gap: 10px; }
    .script-step { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; transition: all 0.15s ease; position: relative; }
    .script-step:hover { border-color: var(--line-strong); box-shadow: 0 2px 6px rgba(0,0,0,0.04); }
    .step-head-row { display: grid; grid-template-columns: 24px 40px 1fr auto; gap: 12px; align-items: flex-start; padding: 14px 16px 12px; }
    .step-drag { cursor: grab; color: var(--ink-mute); opacity: 0; transition: opacity 0.15s ease; display: flex; align-items: center; justify-content: center; padding-top: 6px; }
    .script-step:hover .step-drag { opacity: 1; }
    .step-num { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; color: var(--ink-mute); padding: 4px 8px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 4px; text-align: center; margin-top: 2px; }
    .step-body { flex: 1; min-width: 0; }
    .step-action.editable { width: 100%; border: none; background: transparent; font-family: inherit; font-size: 14px; font-weight: 500; color: var(--ink); padding: 4px 8px; margin: -4px -8px; border-radius: 4px; outline: none; transition: background 0.1s ease; }
    .step-action.editable:hover { background: var(--surface-alt); }
    .step-action.editable:focus { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
    .step-expected { font-size: 12.5px; color: var(--ink-mute); line-height: 1.45; display: flex; gap: 6px; }
    .step-expected::before { content: '↳'; color: var(--ink-mute); font-family: 'JetBrains Mono', monospace; flex-shrink: 0; margin-top: 1px; }
    .step-expected.editable { width: 100%; border: none; background: transparent; font-family: inherit; font-size: 12.5px; color: var(--ink-mute); padding: 4px 8px; margin: -4px -8px; border-radius: 4px; outline: none; resize: none; transition: background 0.1s ease; }
    .step-expected.editable:hover { background: var(--surface-alt); }
    .step-expected.editable:focus { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
    .step-meta-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; font-size: 11px; }
    .step-meta-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 4px; color: var(--ink-soft); font-family: 'JetBrains Mono', monospace; font-size: 10px; }
    .step-meta-chip.priority-high { color: var(--fail); border-color: rgba(166,66,31,0.3); }
    .step-meta-chip.priority-med { color: var(--warn); border-color: rgba(184,134,11,0.3); }
    .step-meta-chip.priority-low { color: var(--pass); border-color: rgba(74,124,89,0.3); }
    .step-meta-chip .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .step-actions-top { display: flex; gap: 4px; padding-top: 2px; }
    .step-btn { width: 30px; height: 30px; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-mute); transition: all 0.15s ease; }
    .step-btn:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
    .step-btn.danger:hover { background: var(--fail-soft); color: var(--fail); border-color: var(--fail); }

    .attachments-strip { padding: 0 16px 14px; margin-left: 76px; }
    .attachments-wrap { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .attachment { position: relative; border-radius: 6px; overflow: hidden; cursor: pointer; transition: transform 0.15s ease; flex-shrink: 0; }
    .attachment:hover { transform: translateY(-2px); }
    .attachment.image { width: 90px; height: 64px; border: 1px solid var(--line); }
    .attachment.image .img-bg { width: 100%; height: 100%; background-size: cover; background-position: center; }
    .attachment.video { width: 90px; height: 64px; background: linear-gradient(135deg, #1a1a1a 0%, #55524d 100%); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: #fff; }
    .attachment-duration { position: absolute; bottom: 4px; right: 4px; font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 1px 5px; background: rgba(0,0,0,0.6); color: #fff; border-radius: 3px; }
    .attachment.link { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; height: 64px; background: var(--surface-alt); border: 1px solid var(--line); color: var(--ink-soft); font-size: 12px; font-weight: 500; max-width: 220px; }
    .attachment.link .link-ico { width: 24px; height: 24px; border-radius: 4px; background: #f24e1e; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; }
    .attachment.link .link-info { min-width: 0; }
    .attachment.link .link-title { font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .attachment.link .link-host { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); }
    .attachment-add { width: 90px; height: 64px; border: 1px dashed var(--line-strong); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--ink-mute); font-size: 10px; font-weight: 500; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; transition: all 0.15s ease; flex-shrink: 0; }
    .attachment-add:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .qr-inline { width: 64px; height: 64px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); padding: 6px; cursor: pointer; transition: all 0.15s ease; position: relative; flex-shrink: 0; }
    .qr-inline:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(45,74,62,0.15); }
    .qr-mini { width: 100%; height: 100%; background: linear-gradient(90deg, #000 2px, transparent 2px, transparent 4px, #000 4px, #000 6px, transparent 6px, transparent 10px, #000 10px, #000 12px, transparent 12px, transparent 14px, #000 14px), linear-gradient(#000 2px, transparent 2px, transparent 4px, #000 4px, #000 6px, transparent 6px, transparent 10px, #000 10px, #000 12px, transparent 12px, transparent 14px, #000 14px); background-size: 16px 16px; opacity: 0.85; }
    .add-step { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; margin-top: 10px; border: 1px dashed var(--line-strong); border-radius: 8px; color: var(--ink-mute); cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s ease; background: var(--surface-alt); }
    .add-step:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

    .testers-layout { display: grid; grid-template-columns: 1fr 360px; gap: 20px; align-items: flex-start; }
    .testers-list { display: flex; flex-direction: column; gap: 12px; }
    .tester-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; transition: all 0.2s ease; }
    .tester-card:hover { border-color: var(--line-strong); box-shadow: 0 2px 6px rgba(0,0,0,0.04); }
    .tester-top { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .tester-avatar { width: 36px; height: 36px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; }
    .tester-info { flex: 1; min-width: 0; }
    .tester-name { font-weight: 500; color: var(--ink); font-size: 14px; margin-bottom: 2px; display: flex; align-items: center; }
    .tester-status { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-mute); display: flex; align-items: center; gap: 6px; }
    .tester-status .s-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-mute); }
    .tester-card.s-done .s-dot { background: var(--pass); } .tester-card.s-done .tester-status { color: var(--pass); }
    .tester-card.s-active .s-dot { background: var(--info); animation: sPulse 1.4s ease-in-out infinite; } .tester-card.s-active .tester-status { color: var(--info); }
    .tester-card.s-wait .s-dot { background: var(--warn); } .tester-card.s-wait .tester-status { color: var(--warn); }
    @keyframes sPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .tester-progress { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .tp-bar { flex: 1; height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; display: flex; }
    .tp-fill { height: 100%; } .tp-fill.pass { background: var(--pass); }
    .tp-label { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-soft); }
    .tester-link-row { display: flex; gap: 8px; align-items: stretch; }
    .link-pill { flex: 1; display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-soft); overflow: hidden; cursor: pointer; transition: all 0.15s ease; min-width: 0; }
    .link-pill:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
    .link-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .qr-btn, .more-btn { width: 36px; height: 36px; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-mute); transition: all 0.15s ease; flex-shrink: 0; }
    .qr-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
    .invite-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: sticky; top: 24px; }
    .invite-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; }
    .invite-sub { color: var(--ink-mute); font-size: 12px; margin: 0 0 14px; line-height: 1.5; }
    .invite-input-row { display: flex; gap: 6px; margin-bottom: 12px; }
    .input-field { flex: 1; height: 36px; padding: 0 12px; font-family: inherit; font-size: 13px; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 6px; }
    .input-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.12); }
    .btn-add { height: 36px; padding: 0 14px; border: none; background: var(--accent); color: #fff; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    .btn-add:hover:not(:disabled) { background: var(--accent-ink); }
    .btn-add:disabled { opacity: 0.6; cursor: not-allowed; }
    .recent-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); margin-bottom: 6px; }
    .recent-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .recent-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px 3px 3px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 999px; font-size: 11px; cursor: pointer; }
    .recent-chip:hover { border-color: var(--accent); background: var(--accent-soft); }
    .recent-chip .mini-avatar { width: 18px; height: 18px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }

    .modal-overlay { position: fixed; inset: 0; background: rgba(18,26,23,0.4); backdrop-filter: blur(3px); display: none; align-items: center; justify-content: center; padding: 24px; z-index: 40; }
    .modal-overlay.show { display: flex; animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .edit-modal { width: 880px; max-width: 100%; max-height: calc(100vh - 48px); background: var(--surface); border-radius: 10px; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden; }
    .modal-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 28px 14px; border-bottom: 1px solid var(--line); }
    .modal-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
    .modal-title .eyebrow { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 4px; }
    .close-btn { width: 32px; height: 32px; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); transition: all 0.15s ease; }
    .close-btn:hover { background: var(--bg); color: var(--ink); }
    .modal-body { flex: 1; overflow-y: auto; padding: 20px 28px; }
    .section { padding: 14px 0; border-bottom: 1px solid var(--line); }
    .section:last-child { border-bottom: none; }
    .section-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
    .section-label::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .field-grid { display: grid; gap: 16px; }
    .grid-2 { grid-template-columns: 1fr 1fr; }
    .grid-3 { grid-template-columns: 1fr 1fr 1.2fr; }
    .field { display: flex; flex-direction: column; }
    .field-label { font-size: 12px; font-weight: 500; color: var(--ink-soft); margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .field-label .arrow { font-family: 'JetBrains Mono', monospace; color: var(--ink-mute); font-size: 11px; margin-right: auto; }
    .counter { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); font-weight: 400; }
    .counter.warn { color: var(--warn); } .counter.near { color: var(--fail); }
    .input, .textarea { width: 100%; padding: 10px 12px; font-family: inherit; font-size: 14px; line-height: 1.5; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 6px; transition: all 0.15s ease; }
    .input { height: 38px; padding: 0 12px; }
    .textarea { resize: vertical; min-height: 96px; }
    .input:focus, .textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.12); }
    .priority-select { display: flex; gap: 4px; background: var(--bg); padding: 3px; border-radius: 6px; border: 1px solid var(--line-strong); height: 38px; }
    .priority-option { flex: 1; border: none; background: transparent; font-family: inherit; font-size: 12px; font-weight: 500; color: var(--ink-soft); border-radius: 4px; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .priority-option:hover { color: var(--ink); }
    .priority-option.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
    .priority-option .dot { width: 6px; height: 6px; border-radius: 50%; }
    .dot.high { background: #c0392b; } .dot.med { background: #d4a017; } .dot.low { background: #4a7c59; }
    .ref-layout { display: grid; grid-template-columns: 1fr 200px; gap: 16px; align-items: stretch; }
    .ref-upload-zone { border: 2px dashed var(--line-strong); border-radius: 8px; padding: 18px; background: var(--surface-alt); transition: all 0.2s ease; display: flex; flex-direction: column; gap: 12px; }
    .ref-upload-zone.dragover { border-color: var(--accent); background: var(--accent-soft); border-style: solid; }
    .ref-upload-top { display: flex; align-items: center; gap: 10px; }
    .ref-upload-icon { width: 36px; height: 36px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--accent); flex-shrink: 0; }
    .ref-upload-title { font-weight: 500; font-size: 13px; margin-bottom: 2px; }
    .ref-upload-sub { font-size: 11px; color: var(--ink-mute); }
    .ref-link-row { display: flex; gap: 6px; }
    .ref-link-row .input { flex: 1; height: 34px; font-size: 12px; }
    .ref-link-btn { height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .ref-link-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .qr-upload-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 14px 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; cursor: pointer; }
    .qr-upload-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); font-weight: 500; }
    .qr-card-img { width: 130px; height: 130px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 10px; transition: all 0.15s ease; }
    .qr-upload-card:hover .qr-card-img { border-color: var(--accent); box-shadow: 0 4px 12px rgba(45,74,62,0.15); transform: scale(1.02); }
    .qr-card-pattern { width: 100%; height: 100%; background: linear-gradient(90deg, #000 3px, transparent 3px, transparent 6px, #000 6px, #000 9px, transparent 9px, transparent 15px, #000 15px, #000 18px, transparent 18px, transparent 21px, #000 21px), linear-gradient(#000 3px, transparent 3px, transparent 6px, #000 6px, #000 9px, transparent 9px, transparent 15px, #000 15px, #000 18px, transparent 18px, transparent 21px, #000 21px); background-size: 24px 24px; opacity: 0.9; }
    .qr-card-hint { font-size: 11px; color: var(--ink-soft); line-height: 1.4; }
    .modal-attachments { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .modal-attachments .attachment.image { width: 120px; height: 80px; }
    .modal-attachments .attachment.video { width: 120px; height: 80px; }
    .modal-attachments .attachment.link { height: 80px; max-width: 280px; }
    .attachment-remove { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity 0.15s ease; z-index: 2; border: none; }
    .attachment:hover .attachment-remove { opacity: 1; }
    .modal-foot { display: flex; justify-content: space-between; align-items: center; padding: 14px 28px; border-top: 1px solid var(--line); background: var(--surface-alt); }
    .modal-foot-hint { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; }
    .modal-foot-actions { display: flex; gap: 8px; }
    .btn { height: 36px; padding: 0 14px; font-family: inherit; font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 6px; }
    .btn-secondary { background: var(--surface); border-color: var(--line-strong); color: var(--ink-soft); }
    .btn-secondary:hover { background: var(--surface-alt); }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-ink); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

    .qr-full { position: fixed; inset: 0; background: rgba(18,26,23,0.6); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 50; animation: fadeIn 0.2s ease; }
    .qr-full-card { background: var(--surface); border-radius: 16px; padding: 32px; text-align: center; max-width: 400px; box-shadow: 0 24px 60px rgba(0,0,0,0.3); animation: qrIn 0.3s cubic-bezier(.4,0,.2,1); }
    @keyframes qrIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .qr-full-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 4px; }
    .qr-full-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 20px; }
    .qr-full-img { width: 260px; height: 260px; background: var(--surface); border: 2px solid var(--ink); border-radius: 12px; margin: 0 auto 20px; padding: 18px; display: flex; align-items: center; justify-content: center; }
    .qr-instructions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; text-align: left; }
    .qr-step-item { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: var(--ink-soft); }
    .qr-step-num { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .qr-waiting { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.1em; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--surface-alt); border-radius: 999px; margin-bottom: 16px; }
    .qr-waiting::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--warn); animation: pulse 1.4s ease-in-out infinite; }
    .qr-close-btn { background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink-soft); height: 40px; padding: 0 20px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500; width: 100%; }
    .qr-close-btn:hover { background: var(--surface-alt); color: var(--ink); }

    .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); transition: transform 0.3s cubic-bezier(.4,0,.2,1); z-index: 100; }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast .check { color: var(--pass); }
    .save-flash { position: fixed; top: 20px; right: 24px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--pass); padding: 6px 12px; background: var(--pass-soft); border: 1px solid rgba(74,124,89,0.3); border-radius: 999px; opacity: 0; transition: opacity 0.2s ease; z-index: 50; display: flex; align-items: center; gap: 6px; }
    .save-flash.show { opacity: 1; }

    .pop { position: absolute; top: calc(100% + 8px); right: 0; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; box-shadow: 0 16px 40px rgba(0,0,0,0.14); padding: 10px; min-width: 300px; z-index: 10; display: none; }
    .pop.open { display: block; animation: popIn 0.15s ease; }
    @keyframes popIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .pop-title { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); padding: 4px 8px 8px; border-bottom: 1px solid var(--line); margin-bottom: 6px; display: flex; justify-content: space-between; }
    .link-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 5px; cursor: pointer; transition: background 0.1s ease; }
    .link-item:hover { background: var(--surface-alt); }
    .link-item .mini-avatar { width: 24px; height: 24px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
    .link-item-info { flex: 1; min-width: 0; }
    .link-item-name { font-weight: 500; font-size: 13px; }
    .link-item-activity { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); margin-top: 1px; }
    .add-input-row { display: flex; gap: 6px; padding: 4px 4px 8px; }
    .add-input-row input { flex: 1; height: 34px; padding: 0 12px; font-family: inherit; font-size: 13px; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 6px; }
    .add-input-row input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.12); }
    .btn-sm-primary { height: 34px; padding: 0 12px; border: none; background: var(--accent); color: #fff; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .btn-sm-primary:hover { background: var(--accent-ink); }
    .recent-chips-row { padding: 4px; border-top: 1px dashed var(--line); }
    .recent-chips-row .label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); padding: 6px 4px 4px; }
    .recent-chips-inline { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 4px 4px; }
    .recent-chip-sm { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px 3px 3px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 999px; font-size: 11px; cursor: pointer; transition: all 0.1s ease; }
    .recent-chip-sm:hover { border-color: var(--accent); background: var(--accent-soft); }
    .recent-chip-sm .mini-avatar { width: 18px; height: 18px; font-size: 9px; }

    @keyframes livePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    @media (max-width: 900px) {
      .tab-panel { padding: 16px 20px 40px; }
      .step-head-row { grid-template-columns: 40px 1fr; } .step-drag, .step-actions-top { display: none; }
      .attachments-strip { margin-left: 0; padding: 0 16px 14px; }
      .testers-layout { grid-template-columns: 1fr; } .invite-panel { position: static; }
      .ref-layout { grid-template-columns: 1fr; }
      .main { padding: 20px; }
      .project-row { grid-template-columns: 1fr; gap: 10px; }
      .row-check { display: none; }
    }
  `}} />
));
AdminStyles.displayName = 'AdminStyles';

export default function AdminPage() {
  const router = useRouter();
  const { settings: workspaceSettings } = useWorkspaceSettings();

  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewState>('LIST');
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
  const [allRuns, setAllRuns] = useState<TestRunData[]>([]);

  const [toastMsg, setToastMsg] = useState('');
  const [saveFlashOpen, setSaveFlashOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'testers'>('script');
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<'all' | 'need' | 'active' | 'done'>('all');
  const [sortOrder, setSortOrder] = useState<'recent' | 'name'>('recent');
  const [selectedListProjects, setSelectedListProjects] = useState<string[]>([]);
  const [activePopover, setActivePopover] = useState<{ type: 'copy' | 'add', projectName: string } | null>(null);
  const [editingStep, setEditingStep] = useState<TestStep | null>(null);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [isDraggingRef, setIsDraggingRef] = useState(false);
  const [newTesterName, setNewTesterName] = useState('');
  const [isAddingTester, setIsAddingTester] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrStepContext, setQrStepContext] = useState<number | null>(null);
  const [uploadToken, setUploadToken] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [qrTesterName, setQrTesterName] = useState('');
  const [qrTesterUrl, setQrTesterUrl] = useState('');

  // 6a: Platform Editor State
  const [platformEditorOpen, setPlatformEditorOpen] = useState(false);
  const [platformEditorList, setPlatformEditorList] = useState<string[]>([]);
  const [platformEditorInput, setPlatformEditorInput] = useState('');

  useEffect(() => {
    setHydrated(true);
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

  const formatDate = (date: Date) => {
    if (!hydrated) return '—';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const projects = useMemo(() => {
    const grouped: Record<string, any> = {};
    allRuns.forEach(run => {
      if (!grouped[run.projectName]) {
        grouped[run.projectName] = {
          name: run.projectName, cycle: run.testCycle || 'N/A', environment: run.environment || 'N/A',
          runs: [], totalSteps: 0, completedSteps: 0,
          createdAt: run.createdAt?.toDate ? run.createdAt.toDate() : new Date(0)
        };
      }
      grouped[run.projectName].runs.push(run);
      if (grouped[run.projectName].runs.length === 1) grouped[run.projectName].totalSteps = run.steps?.length || 0;
      if (run.testerName !== 'Unassigned') grouped[run.projectName].completedSteps += Object.keys(run.results || {}).length;
    });
    return Object.values(grouped).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [allRuns]);

  const uniqueTestersList = useMemo(() => Array.from(new Set(allRuns.map(r => r.testerName).filter(n => n !== 'Unassigned'))), [allRuns]);

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500); };
  const triggerSaveFlash = () => { setSaveFlashOpen(true); setTimeout(() => setSaveFlashOpen(false), 1500); };

  // ─── BRANDING SNAPSHOT ──────────────────────────────────────────────────
  // When we create a new testRun, embed the current workspace's branding.
  // The tester page reads this snapshot and themes itself accordingly.
  const getBrandingSnapshot = () => {
    if (!workspaceSettings) return null;
    return brandingSnapshotFrom(workspaceSettings);
  };

  const handleAddNewTester = async (projectName: string, nameOverride?: string, platformsOverride?: string[]) => {
    const nameToUse = (nameOverride || newTesterName).trim();
    if (!nameToUse) return;
    setIsAddingTester(true);
    try {
      const project = projects.find(p => p.name === projectName);
      if (!project) return;
      const templateRun = project.runs[0] as TestRunData;
      const branding = getBrandingSnapshot();

      const platforms = platformsOverride 
        || (templateRun.platforms && templateRun.platforms.length > 0
            ? templateRun.platforms // default: assign to all platforms
            : []);

      if (platforms.length === 0) {
        // Legacy single-platform path
        await addDoc(collection(db, 'testRuns'), {
          projectName: templateRun.projectName,
          testerName: nameToUse,
          environment: templateRun.environment || '',
          testCycle: templateRun.testCycle || '',
          steps: templateRun.steps,
          createdAt: serverTimestamp(),
          results: {},
          ...(branding ? { branding } : {}),
        });
      } else {
        // Cross-platform — one run per platform
        await Promise.all(platforms.map(platform =>
          addDoc(collection(db, 'testRuns'), {
            projectName: templateRun.projectName,
            testerName: nameToUse,
            environment: templateRun.environment || '',
            testCycle: templateRun.testCycle || '',
            steps: templateRun.steps,
            createdAt: serverTimestamp(),
            results: {},
            platform,
            platforms: templateRun.platforms,
            ...(branding ? { branding } : {}),
          })
        ));
      }

      const unassignedRun = allRuns.find(r => 
        r.projectName === templateRun.projectName 
        && r.testCycle === templateRun.testCycle 
        && r.testerName === 'Unassigned'
      );
      if (unassignedRun?.id) await deleteDoc(doc(db, 'testRuns', unassignedRun.id));
      
      setNewTesterName('');
      setActivePopover(null);
      showToast(`${nameToUse} added · ${platforms.length || 1} link${platforms.length > 1 ? 's' : ''} generated`);
    } catch { alert('Error adding tester.'); } finally { setIsAddingTester(false); }
  };

  const savePlatforms = async () => {
    const projectRuns = allRuns.filter(r => r.projectName === selectedProjectName);
    await Promise.all(projectRuns.map(run =>
      updateDoc(doc(db, 'testRuns', run.id), { platforms: platformEditorList })
    ));
    setPlatformEditorOpen(false);
    triggerSaveFlash();
    showToast('Platforms updated · live to all runs');
  };

  const handleCopyLink = (runId: string, name: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/tester/${runId}`);
    showToast(`${name}'s link copied to clipboard`);
    setActivePopover(null);
  };

  const showTesterQR = (name: string, url: string) => { setQrTesterName(name); setQrTesterUrl(url); setQrModalOpen(true); };
  const toggleListSelection = (projectName: string) => {
    setSelectedListProjects(prev => prev.includes(projectName) ? prev.filter(p => p !== projectName) : [...prev, projectName]);
  };

  const updateMasterScript = async (updatedSteps: TestStep[]) => {
    const projectRuns = allRuns.filter(r => r.projectName === selectedProjectName);
    await Promise.all(projectRuns.map(run => updateDoc(doc(db, 'testRuns', run.id), { steps: updatedSteps })));
    triggerSaveFlash();
  };

  const handleInlineUpdate = async (stepId: string, field: keyof TestStep, value: string) => {
    const project = projects.find(p => p.name === selectedProjectName);
    if (!project) return;
    const templateRun = project.runs[0] as TestRunData;
    const currentStep = templateRun.steps.find(s => s.id === stepId);
    if (!currentStep || currentStep[field] === value) return;
    await updateMasterScript(templateRun.steps.map(s => s.id === stepId ? { ...s, [field]: value } : s));
  };

  const handleDuplicateStep = async (step: TestStep, index: number) => {
    const project = projects.find(p => p.name === selectedProjectName);
    if (!project) return;
    const templateRun = project.runs[0] as TestRunData;
    const updatedSteps = [...templateRun.steps];
    updatedSteps.splice(index + 1, 0, { ...step, id: `step_${Date.now()}` });
    showToast('Step duplicated');
    await updateMasterScript(updatedSteps);
  };

  const handleDeleteStep = async (stepId: string) => {
    const project = projects.find(p => p.name === selectedProjectName);
    if (!project) return;
    const templateRun = project.runs[0] as TestRunData;
    showToast('Step deleted');
    await updateMasterScript(templateRun.steps.filter(s => s.id !== stepId));
  };

  const handleAddStep = async () => {
    const project = projects.find(p => p.name === selectedProjectName);
    if (!project) return;
    const templateRun = project.runs[0] as TestRunData;
    const newStep: TestStep = { id: `step_${Date.now()}`, action: 'New test step...', expectedResult: 'Expected result...', area: '', scenario: '', priority: 'Medium', mediaUrls: [], referenceLinks: [] };
    showToast('New step added');
    await updateMasterScript([...templateRun.steps, newStep]);
  };

  const handleSaveModal = async () => {
    if (!editingStep || !selectedProjectName) return;
    setIsSavingStep(true);
    try {
      const project = projects.find(p => p.name === selectedProjectName);
      const templateRun = project?.runs[0] as TestRunData;
      await updateMasterScript(templateRun.steps.map(s => s.id === editingStep.id ? editingStep : s));
      setEditingStep(null);
      showToast('Step saved · live to all testers');
    } catch { alert('Failed to update master script.'); } finally { setIsSavingStep(false); }
  };

  const handleAdminDesktopUpload = async (files: FileList | null, targetStepId: string | null = null) => {
    const fileArray = Array.from(files || []);
    if (fileArray.length === 0) return;
    setIsUploadingMedia(true);
    try {
      const newUrls: string[] = [];
      for (const file of fileArray) {
        const storageRef = ref(storage, `admin_media/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        newUrls.push(await getDownloadURL(storageRef));
      }
      if (editingStep) {
        setEditingStep({ ...editingStep, mediaUrls: [...(editingStep.mediaUrls || []), ...newUrls] });
      } else if (targetStepId && selectedProjectName) {
        const project = projects.find(p => p.name === selectedProjectName);
        const templateRun = project?.runs[0] as TestRunData;
        await updateMasterScript(templateRun.steps.map(s => s.id === targetStepId ? { ...s, mediaUrls: [...(s.mediaUrls || []), ...newUrls] } : s));
        showToast('File attached to step');
      }
    } catch { alert('Upload failed.'); } finally { setIsUploadingMedia(false); }
  };

  const handleAddLink = () => {
    if (!newLinkInput.trim() || !editingStep) return;
    setEditingStep({ ...editingStep, referenceLinks: [...(editingStep.referenceLinks || []), newLinkInput.trim()] });
    setNewLinkInput('');
  };

  const openAdminQrScanner = (stepIndex: number) => {
    setQrTesterName('');
    const token = Math.random().toString(36).substring(2, 15);
    setUploadToken(token);
    setQrStepContext(stepIndex);
    setUploadUrl(`${window.location.origin}/mobile-upload/${token}`);
    setQrModalOpen(true);
  };

  useEffect(() => {
    if (!qrModalOpen || !uploadToken || qrTesterName) return;
    const docRef = doc(db, 'mobileUploads', uploadToken);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists() && docSnap.data().url) {
        const fileUrl = docSnap.data().url;
        if (editingStep) {
          setEditingStep(prev => prev ? { ...prev, mediaUrls: [...(prev.mediaUrls || []), fileUrl] } : null);
        } else if (qrStepContext !== null && selectedProjectName) {
          const projectRuns = allRuns.filter(r => r.projectName === selectedProjectName);
          const templateRun = projectRuns[0];
          if (templateRun) {
            const targetStepId = templateRun.steps[qrStepContext - 1]?.id;
            if (targetStepId) {
              await updateMasterScript(templateRun.steps.map(s => s.id === targetStepId ? { ...s, mediaUrls: [...(s.mediaUrls || []), fileUrl] } : s));
              showToast('QR file attached successfully');
            }
          }
        }
        deleteDoc(docRef).catch(console.error);
        setQrModalOpen(false);
      }
    });
    return () => unsubscribe();
  }, [qrModalOpen, uploadToken, qrTesterName, editingStep, qrStepContext, selectedProjectName, allRuns]);

  // ── LIST VIEW ──
  const renderListView = () => {
    const processedProjects = projects.map(proj => {
      const activeTesters = proj.runs.filter((r: any) => r.testerName !== 'Unassigned');
      const testerCount = activeTesters.length;
      const totalPossibleSteps = proj.totalSteps * testerCount;
      const pct = totalPossibleSteps > 0 ? Math.round((proj.completedSteps / totalPossibleSteps) * 100) : 0;
      let status: 'need' | 'active' | 'done' = 'active';
      if (testerCount === 0) status = 'need';
      else if (pct === 100) status = 'done';
      const searchLower = searchQuery.toLowerCase();
      const isMatch = proj.name.toLowerCase().includes(searchLower) || activeTesters.some((t: any) => t.testerName?.toLowerCase().includes(searchLower));
      return { ...proj, testerCount, pct, status, activeTesters, isMatch };
    });

    const filteredProjects = processedProjects.filter(p => p.isMatch && (listFilter === 'all' || p.status === listFilter));
    const sorted = [...filteredProjects].sort((a, b) => sortOrder === 'name' ? a.name.localeCompare(b.name) : b.createdAt.getTime() - a.createdAt.getTime());
    const needsTesters = sorted.filter(p => p.status === 'need');
    const inProgress = sorted.filter(p => p.status === 'active');
    const complete = sorted.filter(p => p.status === 'done');
    const totalTestersCount = new Set(allRuns.map(r => r.testerName).filter(n => n !== 'Unassigned')).size;
    const liveNowCount = allRuns.filter(r => r.testerName !== 'Unassigned' && !r.isCompleted && Object.keys(r.results || {}).length > 0).length;

    const renderProjectRow = (p: any) => {
      const isChecked = selectedListProjects.includes(p.name);
      const hasPopover = activePopover?.projectName === p.name;
      return (
        <div key={p.name} className={`project-row status-${p.status}${isChecked ? ' highlighted' : ''}${hasPopover ? ' has-popover' : ''}`} onClick={() => { setSelectedProjectName(p.name); setActiveTab('script'); setView('DETAIL'); }}>
          <div className={`row-check${isChecked ? ' checked' : ''}`} onClick={e => { e.stopPropagation(); toggleListSelection(p.name); }} />
          <div className="project-main">
            <div className="project-name-row">
              <span className="project-name">{p.name}</span>
              {p.cycle && p.cycle !== 'N/A' && <span className="tag cycle">{p.cycle}</span>}
              {p.environment && p.environment !== 'N/A' && <span className="tag">{p.environment}</span>}
            </div>
            <div className="project-story">
              {p.status === 'need' ? `Created ${formatDate(p.createdAt)} · ${p.totalSteps} steps · Ready to provision` :
               p.status === 'done' ? `Completed · ${p.totalSteps} steps passed` :
               `Started recently · ${p.totalSteps} steps · In progress`}
            </div>
          </div>
          <div className="avatar-block">
            <div className="avatar-block-label">Testers</div>
            {p.testerCount === 0 ? (
              <div className="avatar-empty">No testers</div>
            ) : (
              <div className="avatar-stack">
                <div className="avatars">
                  {p.activeTesters.slice(0, 3).map((t: any, i: number) => {
                    const isLive = !t.isCompleted && Object.keys(t.results || {}).length > 0;
                    return <div key={i} className={`mini-avatar${isLive ? ' live' : ''}`} style={{ background: getAvatarColor(t.testerName) }} title={t.testerName}>{t.testerName.charAt(0).toUpperCase()}</div>;
                  })}
                  {p.testerCount > 3 && <div className="mini-avatar more">+{p.testerCount - 3}</div>}
                </div>
              </div>
            )}
          </div>
          <div className="progress-block">
            <div className="progress-block-label"><span>Progress</span><span className="val">{p.pct}%</span></div>
            <div className="progress-segmented"><div className="seg pass" style={{ width: `${p.pct}%` }} /></div>
          </div>
          <div className="row-actions">
            <button className={`action-btn${p.testerCount === 0 ? ' disabled' : ''}`} data-tooltip={p.testerCount === 0 ? 'No testers yet' : 'Copy link'} onClick={e => { e.stopPropagation(); if (p.testerCount > 0) setActivePopover({ type: 'copy', projectName: p.name }); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/></svg>
            </button>
            <button className="action-btn" data-tooltip="Add tester" onClick={e => { e.stopPropagation(); setActivePopover({ type: 'add', projectName: p.name }); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            </button>
            <button className="action-btn" data-tooltip="Edit script" onClick={e => { e.stopPropagation(); setSelectedProjectName(p.name); setActiveTab('script'); setView('DETAIL'); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M11 13l2 2 4-4" strokeLinejoin="round"/></svg>
            </button>

            {hasPopover && activePopover!.type === 'copy' && (
              <div className="pop open" onClick={e => e.stopPropagation()}>
                <div className="pop-title"><span>Copy Tester Link</span><span style={{ color: 'var(--ink-soft)' }}>{p.name}</span></div>
                {p.activeTesters.map((t: any) => (
                  <div key={t.id} className="link-item" onClick={() => handleCopyLink(t.id, t.testerName)}>
                    <div className="mini-avatar" style={{ background: getAvatarColor(t.testerName) }}>{t.testerName.charAt(0).toUpperCase()}</div>
                    <div className="link-item-info">
                      <div className="link-item-name">{t.testerName}</div>
                      <div className="link-item-activity">Copy unique assignment link</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </div>
                ))}
              </div>
            )}

            {hasPopover && activePopover!.type === 'add' && (
              <div className="pop open" onClick={e => e.stopPropagation()}>
                <div className="pop-title"><span>Add Tester</span><span style={{ color: 'var(--ink-soft)' }}>{p.name}</span></div>
                <div className="add-input-row">
                  <input type="text" placeholder="Name or email..." value={newTesterName} onChange={e => setNewTesterName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNewTester(p.name)} />
                  <button className="btn-sm-primary" onClick={() => handleAddNewTester(p.name)}>{isAddingTester ? '...' : 'Generate'}</button>
                </div>
                {uniqueTestersList.length > 0 && (
                  <div className="recent-chips-row">
                    <div className="label">Recent on your team</div>
                    <div className="recent-chips-inline">
                      {uniqueTestersList.slice(0, 4).map(t => (
                        <span key={t} className="recent-chip-sm" onClick={() => handleAddNewTester(p.name, t)}>
                          <span className="mini-avatar" style={{ background: getAvatarColor(t) }}>{t.charAt(0).toUpperCase()}</span>{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <main className="main">
        {activePopover && <div style={{ position: 'fixed', inset: 0, zIndex: 7 }} onClick={() => setActivePopover(null)} />}
        <PageHead
          eyebrow={['Workspace', 'Project Admin']}
          title={<>Project <em>admin</em></>}
          sub="Provision testers, maintain test scripts, and re-share links."
          actions={
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--ink-mute)' }}>
              <div>Projects<span style={{ fontFamily: "'Fraunces', serif", fontSize: '20px', color: 'var(--ink)', fontWeight: 600, marginLeft: '6px' }}>{projects.length}</span></div>
              <div>Testers<span style={{ fontFamily: "'Fraunces', serif", fontSize: '20px', color: 'var(--ink)', fontWeight: 600, marginLeft: '6px' }}>{totalTestersCount}</span></div>
              <div>Live now<span style={{ fontFamily: "'Fraunces', serif", fontSize: '20px', color: 'var(--pass)', fontWeight: 600, marginLeft: '6px' }}>{liveNowCount}</span></div>
            </div>
          }
        />
        <div className="toolbar">
          <div className="search">
            <svg className="search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search projects or testers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <span className="kbd-hint">/</span>
          </div>
          <div className="chip-filter">
            <button className={`filter-chip${listFilter === 'all' ? ' active' : ''}`} onClick={() => setListFilter('all')}>All <span className="chip-count">{processedProjects.length}</span></button>
            <button className={`filter-chip${listFilter === 'need' ? ' active' : ''}`} onClick={() => setListFilter('need')}>Needs testers <span className="chip-count">{processedProjects.filter(p => p.status === 'need').length}</span></button>
            <button className={`filter-chip${listFilter === 'active' ? ' active' : ''}`} onClick={() => setListFilter('active')}>In progress <span className="chip-count">{processedProjects.filter(p => p.status === 'active').length}</span></button>
            <button className={`filter-chip${listFilter === 'done' ? ' active' : ''}`} onClick={() => setListFilter('done')}>Complete <span className="chip-count">{processedProjects.filter(p => p.status === 'done').length}</span></button>
          </div>
          <select className="sort-select" value={sortOrder} onChange={e => setSortOrder(e.target.value as 'recent' | 'name')}>
            <option value="recent">Recently edited</option>
            <option value="name">Project name</option>
          </select>
        </div>
        <div className={`bulk-bar${selectedListProjects.length > 0 ? ' show' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span className="bulk-count"><span>{selectedListProjects.length}</span> selected</span>
          <div className="bulk-actions">
            <button className="bulk-btn" onClick={() => setSelectedListProjects([])}>Clear</button>
            <button className="bulk-btn">Archive</button>
          </div>
        </div>
        <div id="project-list">
          {needsTesters.length > 0 && (<><h3 className="section-heading">Needs Testers <span className="count">{needsTesters.length}</span></h3><div className="section-group">{needsTesters.map(renderProjectRow)}</div></>)}
          {inProgress.length > 0 && (<><h3 className="section-heading">In Progress <span className="count">{inProgress.length}</span></h3><div className="section-group">{inProgress.map(renderProjectRow)}</div></>)}
          {complete.length > 0 && (<><h3 className="section-heading">Complete <span className="count">{complete.length}</span></h3><div className="section-group">{complete.map(renderProjectRow)}</div></>)}
        </div>
      </main>
    );
  };

  // ── DETAIL VIEW ──
  const renderDetailView = () => {
    const project = projects.find(p => p.name === selectedProjectName);
    if (!project) return null;
    const templateRun = project.runs[0] as TestRunData;
    const attachmentCount = templateRun.steps.reduce((acc, step) => acc + (step.mediaUrls?.length || 0) + (step.referenceLinks?.length || 0), 0);
    const activeTesters = project.runs.filter((r: any) => r.testerName !== 'Unassigned');

    return (
      <main className="main">
        <header className="project-head">
          <div>
            <div className="breadcrumb">
              <a onClick={() => setView('LIST')}>Project Admin</a>
              <span className="sep">/</span>
              <span className="current">{project.name}</span>
            </div>
            <div className="project-title-row"><h1 className="project-title">{project.name}</h1></div>
            <div className="project-tags">
              {project.cycle && project.cycle !== 'N/A' && <span className="tag cycle">{project.cycle}</span>}
              {project.environment && project.environment !== 'N/A' && <span className="tag">{project.environment}</span>}
            </div>
            {/* 6a: PLATFORM EDITOR AT PROJECT LEVEL */}
            {templateRun.platforms && templateRun.platforms.length > 0 && (
              <div className="project-platforms-row" style={{ marginTop: '10px' }}>
                <div className="project-platforms-label" style={{ fontSize: '11px', color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Platforms:</div>
                <div className="project-platforms-list" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {templateRun.platforms.map(p => (
                    <span key={p} className="platform-chip-static" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500 }}>{p}</span>
                  ))}
                  <button className="platform-edit-btn" style={{ background: 'transparent', border: '1px solid var(--line-strong)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => {
                    setPlatformEditorList([...templateRun.platforms!]);
                    setPlatformEditorOpen(true);
                  }}>
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="project-stats">
            <div className="project-stat"><div className="ps-label">Steps</div><div className="ps-value">{templateRun.steps.length}</div></div>
            <div className="project-stat"><div className="ps-label">Testers</div><div className="ps-value">{activeTesters.length}</div></div>
            <div className="project-stat"><div className="ps-label">Attachments</div><div className="ps-value">{attachmentCount}</div></div>
          </div>
        </header>

        <div className="tabs-bar">
          <div className="tabs">
            <button className={`tab${activeTab === 'script' ? ' active' : ''}`} onClick={() => setActiveTab('script')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Script <span className="tab-count">{templateRun.steps.length}</span>
            </button>
            <button className={`tab${activeTab === 'testers' ? ' active' : ''}`} onClick={() => setActiveTab('testers')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              Testers &amp; Links <span className="tab-count">{activeTesters.length}</span>
            </button>
          </div>
          <span className="live-indicator" style={{ opacity: activeTab === 'script' ? 1 : 0.4 }}><span className="live-dot" /> Live · {activeTesters.length} testers</span>
        </div>

        <div className="tab-panels">
          <div className={`tab-panel${activeTab === 'script' ? ' active' : ''}`}>
            <div className="script-intro">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <div><b>Edits push live</b> to active testers. Their existing pass/fail results are preserved against the original text. Add or remove steps with care.</div>
            </div>
            <div className="script-list">
              {templateRun.steps.map((step, idx) => {
                const n = idx + 1;
                const nn = n < 10 ? '0' + n : '' + n;
                return (
                  <div className="script-step" key={step.id}>
                    <div className="step-head-row">
                      <div className="step-drag">
                        <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><circle cx="3" cy="3" r="1.3"/><circle cx="3" cy="7" r="1.3"/><circle cx="3" cy="11" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="9" cy="7" r="1.3"/><circle cx="9" cy="11" r="1.3"/></svg>
                      </div>
                      <div className="step-num">{nn}</div>
                      <div className="step-body">
                        <input className="step-action editable" defaultValue={step.action} onBlur={e => handleInlineUpdate(step.id, 'action', e.target.value)} />
                        <div className="step-expected">
                          <textarea className="step-expected editable" defaultValue={step.expectedResult} onBlur={e => handleInlineUpdate(step.id, 'expectedResult', e.target.value)} rows={2} />
                        </div>
                        {/* 6c: STEP ROW INDICATOR FOR PLATFORMS */}
                        {(step.area || step.scenario || step.priority || (step.appliesTo && step.appliesTo.length > 0)) && (
                          <div className="step-meta-row">
                            {step.priority && <span className={`step-meta-chip priority-${step.priority.toLowerCase().includes('high') ? 'high' : step.priority.toLowerCase().includes('low') ? 'low' : 'med'}`}><span className="dot" /> {step.priority}</span>}
                            {step.area && <span className="step-meta-chip">{step.area}</span>}
                            {step.scenario && <span className="step-meta-chip">{step.scenario}</span>}
                            {step.appliesTo && step.appliesTo.length > 0 && (
                              <span className="step-meta-chip" style={{ color: 'var(--accent)', borderColor: 'rgba(122,178,138,0.3)' }}>
                                {step.appliesTo.join(' · ')} only
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="step-actions-top">
                        <button className="step-btn" onClick={() => setEditingStep(step)} title="Full edit">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                        </button>
                        <button className="step-btn" title="Duplicate" onClick={() => handleDuplicateStep(step, idx)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        </button>
                        <button className="step-btn danger" title="Delete" onClick={() => handleDeleteStep(step.id)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                        </button>
                      </div>
                    </div>
                    <div className="attachments-strip">
                      <div className="attachments-wrap">
                        {step.mediaUrls?.map((url, imgIdx) => (
                          <div className={`attachment ${getMediaType(url)}`} key={imgIdx} onClick={() => window.open(url, '_blank')}>
                            {getMediaType(url) === 'video' ? (<><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span className="attachment-duration">VID</span></>) :
                             getMediaType(url) === 'pdf' ? (<div style={{ color: '#3d5a80', fontSize: '10px', fontWeight: 'bold' }}>PDF</div>) :
                             (<div className="img-bg" style={{ backgroundImage: `url(${url})` }} />)}
                          </div>
                        ))}
                        {step.referenceLinks?.map((url, linkIdx) => (
                          <div className="attachment link" key={linkIdx} onClick={() => window.open(url, '_blank')}>
                            <div className="link-ico">URL</div>
                            <div className="link-info">
                              <div className="link-title">{url.split('://')[1]?.substring(0, 20) || url.substring(0, 20)}</div>
                              <div className="link-host">External Link</div>
                            </div>
                          </div>
                        ))}
                        <label className="attachment-add" style={{ cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Attach
                          <input type="file" multiple hidden onChange={e => handleAdminDesktopUpload(e.target.files, step.id)} />
                        </label>
                        <div className="qr-inline" onClick={() => openAdminQrScanner(n)} title="Scan to upload from phone"><div className="qr-mini" /></div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="add-step" onClick={handleAddStep}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add a step
              </div>
            </div>
          </div>

          <div className={`tab-panel${activeTab === 'testers' ? ' active' : ''}`}>
            <div className="testers-layout">
              <div className="testers-list">
                {activeTesters.map((run: any) => {
                  const comp = Object.keys(run.results || {}).length;
                  const tot = run.steps?.length || 0;
                  const pct = tot > 0 ? Math.round((comp / tot) * 100) : 0;
                  const isDone = comp === tot && tot > 0;
                  return (
                    <div className={`tester-card ${isDone ? 's-done' : comp > 0 ? 's-active' : 's-wait'}`} key={run.id}>
                      <div className="tester-top">
                        <div className="tester-avatar" style={{ background: getAvatarColor(run.testerName) }}>{run.testerName.charAt(0).toUpperCase()}</div>
                        <div className="tester-info">
                          <div className="tester-name">
                            {run.testerName}
                            {/* 6d: TESTER PLATFORM SUFFIX */}
                            {run.platform && <span className="tester-platform-badge" style={{ marginLeft: '8px', fontSize: '10px', background: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontFamily: '"JetBrains Mono", monospace' }}>{run.platform}</span>}
                          </div>
                          <div className="tester-status"><span className="s-dot" />{isDone ? 'Completed' : comp > 0 ? `In progress · step ${comp}` : "Invited · hasn't started yet"}</div>
                        </div>
                        <button className="more-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button>
                      </div>
                      <div className="tester-progress">
                        <div className="tp-bar"><div className="tp-fill pass" style={{ width: `${pct}%` }} /></div>
                        <span className="tp-label">{comp} / {tot} · {pct}%</span>
                      </div>
                      <div className="tester-link-row">
                        <div className="link-pill" onClick={() => handleCopyLink(run.id, run.testerName)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/></svg>
                          <span className="link-url">qa-triage.app/tester/{run.id.substring(0, 8)}...</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        </div>
                        <button className="qr-btn" onClick={() => showTesterQR(run.testerName, `${window.location.origin}/tester/${run.id}`)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <aside className="invite-panel">
                <h3 className="invite-title">Invite a tester</h3>
                <p className="invite-sub">Generate a unique link for this tester. They&apos;ll inherit the current master script.</p>
                <div className="invite-input-row">
                  <input className="input-field" type="text" placeholder="Name or email..." value={newTesterName} onChange={e => setNewTesterName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNewTester(templateRun.projectName)} />
                  <button className="btn-add" onClick={() => handleAddNewTester(templateRun.projectName)} disabled={isAddingTester}>
                    {isAddingTester ? '...' : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Generate Link</>}
                  </button>
                </div>
                {uniqueTestersList.length > 0 && (
                  <>
                    <div className="recent-label">Recent on your team</div>
                    <div className="recent-chips">
                      {uniqueTestersList.slice(0, 4).map(t => (
                        <span className="recent-chip" key={t} onClick={() => handleAddNewTester(templateRun.projectName, t)}>
                          <span className="mini-avatar" style={{ background: getAvatarColor(t) }}>{t.charAt(0).toUpperCase()}</span>{t}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </aside>
            </div>
          </div>
        </div>
      </main>
    );
  };

  return (
    <div className="admin-page" suppressHydrationWarning>
      <AdminStyles />

      {view === 'LIST' && renderListView()}
      {view === 'DETAIL' && renderDetailView()}

      {/* EDIT MODAL */}
      {editingStep && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setEditingStep(null); }}>
          <div className="edit-modal">
            <header className="modal-head">
              <h2 className="modal-title"><span className="eyebrow">Full Edit</span>Edit Test Step</h2>
              <button className="close-btn" onClick={() => setEditingStep(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </header>
            <div className="modal-body">
              <section className="section">
                <div className="section-label">Core Instructions</div>
                <div className="field-grid grid-2">
                  <div className="field">
                    <label className="field-label">
                      <span>Step Action</span><span className="arrow">→</span>
                      <span className={`counter${editingStep.action.length >= 250 ? ' near' : editingStep.action.length >= 180 ? ' warn' : ''}`}>{editingStep.action.length} / 250</span>
                    </label>
                    <textarea className="textarea" maxLength={250} rows={4} value={editingStep.action} onChange={e => setEditingStep({ ...editingStep, action: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="field-label">
                      <span>Expected Result</span>
                      <span className={`counter${editingStep.expectedResult.length >= 250 ? ' near' : editingStep.expectedResult.length >= 180 ? ' warn' : ''}`} style={{ marginLeft: 'auto' }}>{editingStep.expectedResult.length} / 250</span>
                    </label>
                    <textarea className="textarea" maxLength={250} rows={4} value={editingStep.expectedResult} onChange={e => setEditingStep({ ...editingStep, expectedResult: e.target.value })} />
                  </div>
                </div>
              </section>
              <section className="section">
                <div className="section-label">Step Metadata</div>
                <div className="field-grid grid-3">
                  <div className="field">
                    <label className="field-label"><span>Area / Module</span></label>
                    <input className="input" type="text" maxLength={25} value={editingStep.area || ''} onChange={e => setEditingStep({ ...editingStep, area: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="field-label"><span>Scenario</span></label>
                    <input className="input" type="text" maxLength={150} value={editingStep.scenario || ''} onChange={e => setEditingStep({ ...editingStep, scenario: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="field-label"><span>Priority</span></label>
                    <div className="priority-select">
                      {(['High', 'Medium', 'Low'] as const).map(p => (
                        <button key={p} className={`priority-option${editingStep.priority === p ? ' active' : ''}`} onClick={() => setEditingStep({ ...editingStep, priority: p })}>
                          <span className={`dot ${p === 'High' ? 'high' : p === 'Medium' ? 'med' : 'low'}`} />{p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* 6b: PER-STEP APPLIES-TO SELECTOR */}
              {projects.find(p => p.name === selectedProjectName)?.runs[0]?.platforms && (projects.find(p => p.name === selectedProjectName)?.runs[0]?.platforms || []).length > 0 && (
                <section className="section">
                  <div className="section-label">Platform Targeting</div>
                  <div className="field">
                    <label className="field-label">
                      <span>This step applies to</span>
                    </label>
                    <div className="platform-applies-chips" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(projects.find(p => p.name === selectedProjectName)?.runs[0]?.platforms || []).map(p => {
                        const isApplied = !editingStep.appliesTo || editingStep.appliesTo.length === 0
                          ? true // empty appliesTo = applies to all
                          : editingStep.appliesTo.includes(p);
                        return (
                          <button
                            key={p}
                            className={`platform-applies-chip${isApplied ? ' on' : ''}`}
                            style={{
                              padding: '6px 12px', border: '1px solid var(--line-strong)', background: isApplied ? 'var(--accent)' : 'var(--surface)', color: isApplied ? '#fff' : 'var(--ink-mute)', borderRadius: '999px', fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease', borderColor: isApplied ? 'var(--accent)' : 'var(--line-strong)'
                            }}
                            onClick={() => {
                              let newAppliesTo: string[];
                              const templateRun = projects.find(proj => proj.name === selectedProjectName)?.runs[0] as TestRunData;
                              if (!editingStep.appliesTo || editingStep.appliesTo.length === 0) {
                                newAppliesTo = templateRun.platforms!.filter(x => x !== p);
                              } else {
                                newAppliesTo = editingStep.appliesTo.includes(p)
                                  ? editingStep.appliesTo.filter(x => x !== p)
                                  : [...editingStep.appliesTo, p];
                              }
                              if (newAppliesTo.length === templateRun.platforms!.length) {
                                newAppliesTo = [];
                              }
                              setEditingStep({
                                ...editingStep,
                                appliesTo: newAppliesTo.length === 0 ? undefined : newAppliesTo
                              });
                            }}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                    <div className="field-helper" style={{ fontSize: '11px', color: 'var(--ink-mute)', marginTop: '6px', fontFamily: '"JetBrains Mono", monospace' }}>
                      {(!editingStep.appliesTo || editingStep.appliesTo.length === 0)
                        ? 'Applies to all platforms (default)'
                        : `Only applies to: ${editingStep.appliesTo.join(', ')}`}
                    </div>
                  </div>
                </section>
              )}

              <section className="section">
                <div className="section-label">Reference Material · <span style={{ color: 'var(--ink)', textTransform: 'none', letterSpacing: 0, fontFamily: '"IBM Plex Sans", sans-serif' }}>{(editingStep.mediaUrls?.length || 0) + (editingStep.referenceLinks?.length || 0)} attached</span></div>
                <div className="ref-layout">
                  <div className={`ref-upload-zone${isDraggingRef ? ' dragover' : ''}`} onDragOver={e => { e.preventDefault(); setIsDraggingRef(true); }} onDragLeave={() => setIsDraggingRef(false)} onDrop={e => { e.preventDefault(); setIsDraggingRef(false); handleAdminDesktopUpload(e.dataTransfer.files); }}>
                    <div className="ref-upload-top">
                      <div className="ref-upload-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                      <div>
                        <div className="ref-upload-title">Drop files or paste a link</div>
                        <div className="ref-upload-sub">Images, videos, PDFs, or <label style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>browse<input type="file" multiple hidden onChange={e => handleAdminDesktopUpload(e.target.files)} /></label></div>
                      </div>
                    </div>
                    <div className="ref-link-row">
                      <input className="input" type="text" placeholder="Paste a Figma, Loom, or any URL..." value={newLinkInput} onChange={e => setNewLinkInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddLink()} />
                      <button className="ref-link-btn" onClick={handleAddLink}>Attach</button>
                    </div>
                    {isUploadingMedia && <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '8px' }}>Uploading files...</div>}
                  </div>
                  <div className="qr-upload-card" onClick={() => openAdminQrScanner(0)}>
                    <div className="qr-upload-label">Scan to upload</div>
                    <div className="qr-card-img"><div className="qr-card-pattern" /></div>
                    <div className="qr-card-hint"><b>From your phone</b><br />camera → attach</div>
                  </div>
                </div>
                <div className="modal-attachments">
                  {editingStep.mediaUrls?.map((url, i) => (
                    <div className={`attachment ${getMediaType(url)}`} key={i} onClick={() => window.open(url, '_blank')}>
                      {getMediaType(url) === 'video' ? (<><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span className="attachment-duration">VID</span></>) :
                       getMediaType(url) === 'pdf' ? (<div style={{ color: '#3d5a80', fontSize: '10px', fontWeight: 'bold', padding: '10px' }}>PDF</div>) :
                       (<div className="img-bg" style={{ backgroundImage: `url(${url})` }} />)}
                      <button className="attachment-remove" onClick={e => { e.stopPropagation(); setEditingStep({ ...editingStep, mediaUrls: editingStep.mediaUrls?.filter((_, idx) => idx !== i) }); }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                  {editingStep.referenceLinks?.map((url, i) => (
                    <div className="attachment link" key={i} onClick={() => window.open(url, '_blank')}>
                      <div className="link-ico">URL</div>
                      <div className="link-info">
                        <div className="link-title">{url.split('://')[1]?.substring(0, 20) || url.substring(0, 20)}</div>
                        <div className="link-host">External Link</div>
                      </div>
                      <button className="attachment-remove" onClick={e => { e.stopPropagation(); setEditingStep({ ...editingStep, referenceLinks: editingStep.referenceLinks?.filter((_, idx) => idx !== i) }); }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <footer className="modal-foot">
              <span className="modal-foot-hint">Changes save on exit · Push live to {projects.find(p => p.name === selectedProjectName)?.runs.filter((r: any) => r.testerName !== 'Unassigned').length || 0} testers</span>
              <div className="modal-foot-actions">
                <button className="btn btn-secondary" onClick={() => setEditingStep(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveModal} disabled={isSavingStep}>{isSavingStep ? 'Saving...' : 'Save Step'}</button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* PLATFORM EDITOR MODAL */}
      {platformEditorOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setPlatformEditorOpen(false); }}>
          <div className="edit-modal" style={{ width: '480px' }}>
            <header className="modal-head">
              <h2 className="modal-title">Edit Platforms</h2>
              <button className="close-btn" onClick={() => setPlatformEditorOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </header>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '20px' }}>
                Add or remove platforms for this project. Note: Removing a platform won't delete existing runs tagged with it, but it will hide it from future tester assignments.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {platformEditorList.map(p => (
                  <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--surface-alt)', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '13px' }}>
                    {p}
                    <button onClick={() => setPlatformEditorList(prev => prev.filter(x => x !== p))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-mute)' }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. Android 15"
                  value={platformEditorInput}
                  onChange={e => setPlatformEditorInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && platformEditorInput.trim() && !platformEditorList.includes(platformEditorInput.trim())) {
                      setPlatformEditorList([...platformEditorList, platformEditorInput.trim()]);
                      setPlatformEditorInput('');
                    }
                  }}
                  style={{ flex: 1, height: '36px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: '13px' }}
                />
                <button
                  onClick={() => {
                    if (platformEditorInput.trim() && !platformEditorList.includes(platformEditorInput.trim())) {
                      setPlatformEditorList([...platformEditorList, platformEditorInput.trim()]);
                      setPlatformEditorInput('');
                    }
                  }}
                  style={{ height: '36px', padding: '0 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                >
                  Add
                </button>
              </div>
            </div>
            <footer className="modal-foot">
              <div className="modal-foot-actions" style={{ marginLeft: 'auto' }}>
                <button className="btn btn-secondary" onClick={() => setPlatformEditorOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={savePlatforms}>Save Platforms</button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* QR MODAL */}
      {qrModalOpen && (
        <div className="qr-full" onClick={e => { if (e.target === e.currentTarget) setQrModalOpen(false); }}>
          <div className="qr-full-card">
            <div className="qr-full-eyebrow">{qrTesterName ? `Tester Link · ${qrTesterUrl.substring(0, 30)}...` : `Step ${qrStepContext !== null && qrStepContext > 0 ? (qrStepContext < 10 ? '0' + qrStepContext : qrStepContext) : '01'} · Reference Material`}</div>
            <h3 className="qr-full-title">{qrTesterName ? `${qrTesterName}'s Testing Link` : 'Scan to upload from phone'}</h3>
            <div className="qr-full-img">
              {qrTesterName && qrTesterUrl ? <QRCodeSVG value={qrTesterUrl} size={220} /> : uploadUrl ? <QRCodeSVG value={uploadUrl} size={220} /> : <div className="qr-card-pattern" style={{ width: 220, height: 220 }} />}
            </div>
            {!qrTesterName && (
              <div className="qr-instructions">
                <div className="qr-step-item"><div className="qr-step-num">1</div><div>Open your phone&apos;s camera and point it at the code</div></div>
                <div className="qr-step-item"><div className="qr-step-num">2</div><div>Tap the notification to open the upload page</div></div>
                <div className="qr-step-item"><div className="qr-step-num">3</div><div>Take photos or videos — they attach here automatically</div></div>
              </div>
            )}
            {!qrTesterName && <div className="qr-waiting">Waiting for device...</div>}
            <button className="qr-close-btn" onClick={() => setQrModalOpen(false)}>Close</button>
          </div>
        </div>
      )}

      <div className={`toast${toastMsg ? ' show' : ''}`}>
        <svg className="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>{toastMsg}</span>
      </div>
      <div className={`save-flash${saveFlashOpen ? ' show' : ''}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        Saved · pushed live to active testers
      </div>
    </div>
  );
}