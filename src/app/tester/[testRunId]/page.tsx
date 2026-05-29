"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { doc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, orderBy, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { TestRunData, TestStep, TestResult, TesterMessage, MessageThread } from '@/types';
import { QRCodeSVG } from 'qrcode.react';
import { stepAppliesToPlatform } from '@/lib/platforms';

type TesterStage = 'LOADING' | 'WELCOME' | 'TESTING' | 'COMPLETE' | 'RESULTS';

interface ExtendedTestStep extends TestStep {
  objective?: string;
  preConditions?: string;
}

const getMediaType = (url: string) => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.match(/\.(mp4|webm|ogg|mov)(?=\?|$)/i)) return 'video';
  if (lowerUrl.match(/\.(pdf)(?=\?|$)/i)) return 'pdf';
  return 'image'; 
};

// --- HELPER 1: PARSE ACTION ---
type ParsedAction =
  | { type: 'single'; text: string; intro?: undefined }
  | { type: 'list'; items: string[]; intro?: string };

function parseAction(raw: string): ParsedAction {
  if (!raw || typeof raw !== 'string') return { type: 'single', text: raw || '' };
  const text = raw.trim();

  const numberedPattern = /\s*\d+\.\s+/g;
  const numberedMatches = text.match(numberedPattern) || [];
  if (numberedMatches.length >= 2) {
    const firstNumIdx = text.search(/\d+\.\s+/);
    let intro: string | undefined;
    let listSource = text;
    if (firstNumIdx > 0) {
      const candidate = text.slice(0, firstNumIdx).trim().replace(/[:\-–—]\s*$/, '').trim();
      if (candidate.length > 0 && candidate.length < 120) {
        intro = candidate;
        listSource = text.slice(firstNumIdx);
      }
    }
    const items = listSource.split(numberedPattern).map(s => s.trim()).filter(Boolean);
    if (items.length >= 2) return { type: 'list', items, intro };
  }

  const bulletPattern = /(?:^|\n)\s*[-•*]\s+/g;
  const bulletMatches = text.match(bulletPattern) || [];
  if (bulletMatches.length >= 2) {
    const items = text.split(bulletPattern).map(s => s.trim()).filter(Boolean);
    if (items.length >= 2) return { type: 'list', items };
  }

  return { type: 'single', text };
}

// --- HELPER 2: LIGHTBOX COMPONENT ---
interface LightboxProps {
  urls: string[];
  startIdx: number;
  onClose: () => void;
}

function Lightbox({ urls, startIdx, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIdx);
  const total = urls.length;
  const url = urls[idx];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx(i => (i - 1 + total) % total);
      if (e.key === 'ArrowRight') setIdx(i => (i + 1) % total);
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [total, onClose]);

  const mediaType = getMediaType(url || '');

  return (
    <div className="lightbox open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lightbox-inner">
        <div className="lightbox-top">
          <span className="lightbox-counter">{idx + 1} of {total}</span>
          <button className="lightbox-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {mediaType === 'video' ? (
          <video className="lightbox-img" src={url} controls autoPlay />
        ) : mediaType === 'pdf' ? (
          <iframe className="lightbox-img" src={url} style={{ width: '92vw', height: '82vh', border: 0, background: '#fff' }} />
        ) : (
          <img className="lightbox-img" src={url} alt="" />
        )}
        {total > 1 && (
          <>
            <button className="lightbox-nav prev" onClick={() => setIdx(i => (i - 1 + total) % total)} aria-label="Previous">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button className="lightbox-nav next" onClick={() => setIdx(i => (i + 1) % total)} aria-label="Next">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// --- ISOLATED TIMER COMPONENT ---
const TimerChip = ({ cumulativeMs, sessionStartTime, isRunning }: { cumulativeMs: number, sessionStartTime: number, isRunning: boolean }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - sessionStartTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, sessionStartTime]);

  const totalMs = cumulativeMs + (isRunning ? elapsed : 0);
  const sec = Math.floor(totalMs / 1000);
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');

  return <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: '36px', display: 'inline-block', textAlign: 'center' }}>{mm}:{ss}</span>;
};

// --- GLOBAL STYLES ---
const GlobalTesterStyles = React.memo(() => (
  <style dangerouslySetInnerHTML={{__html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
    
    .tester-v2 {
      --bg: #0f1410; --surface: #171d18; --surface-lift: #1d2420; --surface-high: #242b26;
      --ink: #f4f3ef; --ink-soft: #c4c0b4; --ink-mute: #7a7a72;
      --line: rgba(255,255,255,0.08); --line-strong: rgba(255,255,255,0.15);
      /* --accent / --accent-soft / --accent-ink come from TesterBrandingProvider at runtime */
      --coral: #e8a385; --coral-soft: rgba(232,163,133,0.12);
      --warm: #f0d4a1; --warm-soft: rgba(240,212,161,0.12);
      --rose: #d88a90; --rose-soft: rgba(216,138,144,0.14);
      --amber: #e8c888; --amber-soft: rgba(232,200,136,0.14);
      --info: #8aaed8; --info-soft: rgba(138,174,216,0.14);
      --radius: 12px;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      color: var(--ink); font-size: 15px; line-height: 1.5;
      min-height: 100vh; background: radial-gradient(ellipse at 15% 0%, rgba(122,178,138,0.12) 0%, transparent 50%), radial-gradient(ellipse at 85% 100%, rgba(232,163,133,0.08) 0%, transparent 50%), linear-gradient(180deg, #0d1210 0%, #10160f 100%);
      background-attachment: fixed; position: relative; overflow-x: hidden;
    }

    .tester-v2 * { box-sizing: border-box; }
    
    .tester-v2::before { content: ''; position: fixed; inset: 0; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); pointer-events: none; z-index: 1; opacity: 0.6; }
    .tester-v2::after { content: ''; position: fixed; top: -200px; left: 50%; transform: translateX(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(122,178,138,0.06) 0%, transparent 60%); pointer-events: none; z-index: 0; animation: orbFloat 12s ease-in-out infinite; }
    @keyframes orbFloat { 0%, 100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(30px); } }

    .wrap { position: relative; z-index: 2; min-height: 100vh; display: flex; flex-direction: column; padding: 32px 24px; max-width: 600px; margin: 0 auto; }

    /* WELCOME STYLES */
    .top-chip { display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px; background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 999px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-soft); align-self: flex-start; margin-bottom: 28px; backdrop-filter: blur(10px); animation: slideDown 0.6s cubic-bezier(.2,.6,.2,1); }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    .brand-dot, .check-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: dotPulse 2s ease-in-out infinite; }
    .check-dot { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; color: #0f1410; }
    @keyframes dotPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(122,178,138,0.6); } 50% { box-shadow: 0 0 0 4px rgba(122,178,138,0); } }
    @keyframes currentPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }

    .hero { margin-bottom: 36px; animation: fadeSlide 0.8s 0.15s both cubic-bezier(.2,.6,.2,1); }
    @keyframes fadeSlide { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    .greeting { font-family: 'Fraunces', serif; font-size: 52px; font-weight: 500; line-height: 1.02; letter-spacing: -0.03em; margin: 0 0 16px; color: var(--ink); }
    .greeting em { font-style: italic; color: var(--accent); font-weight: 500; }
    .hero-sub { font-size: 16px; color: var(--ink-soft); margin: 0; max-width: 440px; line-height: 1.5; }
    .hero-sub b { color: var(--ink); font-weight: 500; }
    .hero-title { font-family: 'Fraunces', serif; font-size: 48px; font-weight: 500; line-height: 1.05; letter-spacing: -0.03em; margin: 0 0 16px; color: var(--ink); }
    .hero-title em { font-style: italic; color: var(--accent); font-weight: 500; }

    .journey { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px 24px; margin-bottom: 28px; backdrop-filter: blur(20px); animation: fadeSlide 0.8s 0.3s both cubic-bezier(.2,.6,.2,1); }
    .journey-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 14px; font-weight: 500; }
    .journey-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
    .j-stat .j-value { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; line-height: 1; letter-spacing: -0.01em; color: var(--ink); margin-bottom: 4px; }
    .j-stat .j-value em { font-style: italic; color: var(--accent); font-weight: 500; }
    .j-stat .j-label { font-size: 11px; color: var(--ink-mute); font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; }

    .form-section { animation: fadeSlide 0.8s 0.45s both cubic-bezier(.2,.6,.2,1); }
    .form-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 14px; font-weight: 500; display: flex; align-items: center; gap: 10px; }
    .form-label::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .detected-badge { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); padding: 3px 8px; background: var(--accent-soft); border-radius: 4px; }

    .field-stack { display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; }
    .field { position: relative; }
    .field-input-wrap { position: relative; display: flex; align-items: center; }
    .field-icon { position: absolute; left: 16px; color: var(--ink-mute); transition: color 0.2s ease; pointer-events: none; }
    .field:focus-within .field-icon { color: var(--accent); }
    .field input, .field select { box-sizing: border-box; width: 100%; height: 56px; padding: 0 16px 0 50px; font-family: inherit; font-size: 15px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); transition: all 0.2s ease; appearance: none; }
    .field select { background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a7a72' stroke-width='2' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; }
    .field input::placeholder { color: var(--ink-mute); }
    .field input:hover:not(:disabled), .field select:hover:not(:disabled) { border-color: var(--line-strong); background: var(--surface-lift); }
    .field input:focus, .field select:focus { outline: none; border-color: var(--accent); background: var(--surface-lift); box-shadow: 0 0 0 4px var(--accent-soft); }
    .field input:disabled, .field select:disabled { opacity: 0.7; cursor: not-allowed; background: rgba(255,255,255,0.02); }
    .field-confirm { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); opacity: 0; transition: opacity 0.3s ease; color: var(--accent); }
    .field.valid .field-confirm { opacity: 1; }

    .start-btn { width: 100%; height: 60px; border: none; background: var(--ink); color: var(--bg); font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500; letter-spacing: -0.01em; border-radius: var(--radius); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; position: relative; overflow: hidden; transition: all 0.3s cubic-bezier(.2,.6,.2,1); opacity: 0.3; pointer-events: none; }
    .start-btn.ready { opacity: 1; pointer-events: auto; box-shadow: 0 8px 30px rgba(122,178,138,0.25); }
    .start-btn.ready:hover { background: var(--accent); transform: translateY(-2px); box-shadow: 0 12px 40px rgba(122,178,138,0.4); }
    .start-btn .arrow { transition: transform 0.3s cubic-bezier(.2,.6,.2,1); }
    .start-btn.ready:hover .arrow { transform: translateX(4px); }
    .start-btn.ready::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(122,178,138,0.2), transparent); animation: btnShimmer 3s ease-in-out infinite; }
    @keyframes btnShimmer { 0%, 100% { left: -100%; } 50% { left: 100%; } }

    /* MESSAGING: BANNER */
    .msg-banner { background: linear-gradient(180deg, rgba(232,200,136,0.14) 0%, rgba(232,200,136,0.08) 100%); border: 1px solid rgba(232,200,136,0.3); border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; gap: 14px; margin-bottom: 20px; animation: bannerIn 0.4s cubic-bezier(.2,.6,.2,1); }
    .msg-banner.complete-variant { margin: 0 auto 24px; max-width: 500px; }
    @keyframes bannerIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .msg-banner-icon { width: 38px; height: 38px; border-radius: 10px; background: var(--amber); color: #3a2e0a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .msg-banner-content { flex: 1; min-width: 0; }
    .msg-banner-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 500; letter-spacing: -0.01em; margin: 0 0 2px; }
    .msg-banner-title em { font-style: italic; color: var(--amber); }
    .msg-banner-sub { font-size: 12.5px; color: var(--ink-soft); margin: 0; }
    .msg-banner-btn { padding: 8px 14px; background: var(--amber); color: #3a2e0a; border: none; border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; letter-spacing: -0.01em; }
    .msg-banner-btn:hover { filter: brightness(1.08); }

    /* MESSAGING: PILL */
    .msg-pill { position: fixed; top: 80px; right: 24px; z-index: 12; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px; background: rgba(232,200,136,0.14); border: 1px solid rgba(232,200,136,0.35); border-radius: 999px; color: var(--amber); font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
    .msg-pill:hover { background: rgba(232,200,136,0.2); transform: scale(1.02); }
    .msg-pill-icon { width: 18px; height: 18px; background: var(--amber); color: #3a2e0a; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .msg-pill-icon svg { width: 10px; height: 10px; }
    .msg-pill-count { background: rgba(0,0,0,0.25); padding: 1px 6px; border-radius: 6px; font-size: 10px; color: var(--amber); }
    .msg-pill.has-new::before { content: ''; position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; background: var(--amber); border-radius: 50%; box-shadow: 0 0 0 0 var(--amber); animation: newPulse 2s ease-in-out infinite; }
    @keyframes newPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(232,200,136,0.5); } 50% { box-shadow: 0 0 0 6px rgba(232,200,136,0); } }

    /* MESSAGING: TOAST */
    .msg-toast { position: fixed; top: 80px; right: 24px; z-index: 14; max-width: 320px; background: var(--surface-lift); border: 1px solid rgba(232,200,136,0.4); border-radius: 12px; padding: 14px 16px 14px 14px; display: flex; gap: 12px; align-items: flex-start; box-shadow: 0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(232,200,136,0.08); animation: toastIn 0.35s cubic-bezier(.2,.6,.2,1); cursor: pointer; overflow: hidden; }
    .msg-toast.show { transform: translateX(0); opacity: 1; }
    @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
    .msg-toast-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--amber); color: #3a2e0a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .msg-toast-content { flex: 1; min-width: 0; }
    .msg-toast-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--amber); font-weight: 500; margin-bottom: 2px; }
    .msg-toast-text { font-size: 13px; color: var(--ink); line-height: 1.4; margin: 0 0 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .msg-toast-cta { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); }
    .msg-toast-close { width: 20px; height: 20px; border: none; background: transparent; color: var(--ink-mute); cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: -2px; }
    .msg-toast-close:hover { color: var(--ink); background: rgba(255,255,255,0.05); }
    .msg-toast::after { content: ''; position: absolute; bottom: 0; left: 0; height: 2px; background: var(--amber); width: 100%; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; animation: toastProgress 8s linear forwards; opacity: 0.6; }
    @keyframes toastProgress { from { width: 100%; } to { width: 0; } }

    /* MESSAGING: INBOX PANEL */
    .msg-inbox-overlay { position: fixed; inset: 0; background: rgba(10, 14, 10, 0.35); z-index: 55; }
    .msg-inbox { position: fixed; top: 14px; right: 20px; z-index: 60; width: 380px; max-height: 500px; background: var(--surface-lift); border: 1px solid var(--line-strong); border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.4); display: flex; flex-direction: column; overflow: hidden; animation: inboxIn 0.25s cubic-bezier(.2,.6,.2,1); }
    @media (max-width: 600px) { .msg-inbox { inset: 14px; width: auto; max-height: none; } .msg-detail { inset: 14px; width: auto; max-height: none; } }
    @keyframes inboxIn { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .inbox-head { padding: 14px 16px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
    .inbox-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 500; letter-spacing: -0.01em; margin: 0; }
    .inbox-title em { font-style: italic; color: var(--amber); }
    .inbox-close { width: 26px; height: 26px; background: transparent; border: 1px solid var(--line); border-radius: 6px; color: var(--ink-mute); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .inbox-close:hover { color: var(--ink); background: rgba(255,255,255,0.03); }
    .inbox-list { flex: 1; overflow-y: auto; }
    .inbox-foot { padding: 10px 16px; border-top: 1px solid var(--line); font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-mute); text-align: center; letter-spacing: 0.06em; }
    .inbox-empty { padding: 40px 20px; text-align: center; color: var(--ink-mute); font-size: 13px; }
    .inbox-item { padding: 14px 16px; border-bottom: 1px solid var(--line); cursor: pointer; transition: background 0.15s; display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: flex-start; }
    .inbox-item:hover { background: rgba(255,255,255,0.02); }
    .inbox-item.unread { background: rgba(232,200,136,0.03); }
    .inbox-item.unread:hover { background: rgba(232,200,136,0.06); }
    .inbox-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: #0f1410; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
    .inbox-body { min-width: 0; }
    .inbox-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; flex-wrap: wrap; }
    .inbox-from { font-size: 12.5px; font-weight: 500; color: var(--ink); }
    .inbox-step { font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 1px 6px; background: var(--amber-soft); color: var(--amber); border-radius: 3px; text-transform: uppercase; letter-spacing: 0.06em; }
    .inbox-step.general { background: var(--info-soft); color: var(--info); }
    .inbox-preview { font-size: 12.5px; color: var(--ink-soft); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .inbox-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .inbox-time { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); letter-spacing: 0.04em; }
    .inbox-unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); }

    /* MESSAGING: MESSAGE DETAIL THREAD */
    .msg-detail { position: fixed; top: 14px; right: 20px; z-index: 60; width: 380px; max-height: 540px; background: var(--surface-lift); border: 1px solid var(--line-strong); border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.4); display: flex; flex-direction: column; overflow: hidden; }
    .detail-head { padding: 14px 16px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
    .detail-back { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--ink-soft); cursor: pointer; font-family: inherit; font-size: 12px; padding: 4px 6px; border-radius: 5px; }
    .detail-back:hover { color: var(--ink); background: rgba(255,255,255,0.03); }
    .detail-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; }
    
    .detail-context { padding: 10px 12px; background: rgba(232,200,136,0.06); border-left: 3px solid var(--amber); border-radius: 4px; margin-bottom: 14px; font-size: 12.5px; }
    .detail-context-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--amber); font-weight: 500; margin-bottom: 6px; }
    .detail-context-step { color: var(--ink); font-weight: 500; margin-bottom: 4px; }
    .detail-context-note { font-family: 'Fraunces', serif; font-style: italic; color: var(--ink-soft); }

    .msg-bubble { max-width: 85%; padding: 10px 13px; border-radius: 10px; font-size: 13px; line-height: 1.5; position: relative; margin-bottom: 12px; }
    .msg-bubble-meta { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px; opacity: 0.8; display: flex; align-items: center; gap: 6px; }
    .msg-bubble-body { white-space: pre-wrap; word-break: break-word; }
    
    .msg-bubble.from-pm { align-self: flex-start; background: var(--surface-high); border: 1px solid var(--line); color: var(--ink); border-bottom-left-radius: 3px; }
    .msg-bubble.from-pm .msg-bubble-meta { color: var(--ink-mute); }
    .msg-bubble.from-pm.unread { border-color: var(--amber); background: rgba(232,200,136,0.05); }
    
    .msg-bubble.from-tester { align-self: flex-end; background: var(--accent); color: #0f1410; border-bottom-right-radius: 3px; }
    .msg-bubble.from-tester .msg-bubble-meta { color: rgba(15,20,16,0.6); }

    .detail-jump-btn { display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; padding: 8px 12px; background: transparent; border: 1px solid var(--line-strong); color: var(--ink); border-radius: 7px; font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; margin-bottom: 16px; transition: all 0.15s; }
    .detail-jump-btn:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
    
    .detail-reply-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 500; margin-bottom: 8px; }
    .detail-reply-textarea { width: 100%; min-height: 80px; padding: 10px 12px; font-family: inherit; font-size: 13px; line-height: 1.5; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); resize: vertical; margin-bottom: 10px; }
    .detail-reply-textarea::placeholder { color: var(--ink-mute); }
    .detail-reply-textarea:focus { outline: none; border-color: var(--accent); }
    .detail-foot { padding: 12px 16px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; background: rgba(255,255,255,0.02); }
    .detail-btn { padding: 8px 14px; border-radius: 7px; font-family: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; }
    .detail-btn.ghost { background: transparent; border-color: var(--line-strong); color: var(--ink-soft); }
    .detail-btn.ghost:hover { color: var(--ink); background: rgba(255,255,255,0.03); }
    .detail-btn.primary { background: var(--accent); color: #0f1410; font-weight: 600; }
    .detail-btn.primary:hover { filter: brightness(1.06); }
    .detail-btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }

    /* MESSAGING: STEP CALLOUT */
    .step-msg-callout { padding: 14px 16px; background: linear-gradient(180deg, rgba(232,200,136,0.12) 0%, rgba(232,200,136,0.06) 100%); border: 1px solid rgba(232,200,136,0.35); border-radius: 10px; margin-bottom: 16px; display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: flex-start; }
    .smc-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: #0f1410; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
    .smc-body { min-width: 0; }
    .smc-eyebrow { display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--amber); font-weight: 500; margin-bottom: 4px; }
    .smc-from { font-size: 13px; font-weight: 500; color: var(--ink); margin: 0 0 6px; }
    .smc-from em { color: var(--amber); font-style: italic; }
    .smc-message { font-size: 13px; color: var(--ink); line-height: 1.5; margin-bottom: 10px; padding: 10px 12px; background: rgba(0,0,0,0.15); border-radius: 6px; white-space: pre-wrap; }
    .smc-reply-row { display: flex; gap: 8px; align-items: center; }
    .smc-reply-link { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: transparent; border: 1px solid var(--line-strong); border-radius: 6px; color: var(--ink-soft); font-family: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
    .smc-reply-link:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .smc-reply-link.primary { background: var(--amber); color: #3a2e0a; border-color: var(--amber); }
    .smc-reply-link.primary:hover { filter: brightness(1.08); }
    .smc-reply-sheet { margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(232,200,136,0.25); animation: sheetIn 0.2s cubic-bezier(.2,.6,.2,1); }
    @keyframes sheetIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .smc-textarea { width: 100%; min-height: 60px; padding: 9px 11px; font-family: inherit; font-size: 12.5px; line-height: 1.5; border: 1px solid rgba(232,200,136,0.3); border-radius: 6px; background: rgba(0,0,0,0.2); color: var(--ink); resize: vertical; margin-bottom: 8px; }
    .smc-textarea:focus { outline: none; border-color: var(--amber); background: rgba(0,0,0,0.3); }
    .smc-textarea::placeholder { color: var(--ink-mute); }
    .step-msg-callout-collapsed { padding: 10px 14px; background: var(--accent-soft); border: 1px solid rgba(122,178,138,0.3); border-radius: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--accent); cursor: pointer; transition: all 0.15s; }
    .step-msg-callout-collapsed:hover { background: rgba(122,178,138,0.2); }

    /* LIVE EVIDENCE STYLES */
    .live-evidence-grid { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .live-thumb-wrap { width: 64px; height: 64px; border-radius: 8px; border: 1px solid var(--line-strong); overflow: hidden; cursor: zoom-in; position: relative; animation: slideDown 0.3s cubic-bezier(.2,.6,.2,1); background: var(--surface-lift); }
    .live-thumb-wrap img { width: 100%; height: 100%; object-fit: cover; }
    .live-video-thumb, .live-pdf-thumb { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--ink-mute); font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600; background: linear-gradient(135deg, #1a1a1a 0%, #3a3a3a 100%); color: #fff; }
    .live-video-thumb svg { margin-bottom: 2px; }

    /* PLATFORM BADGE */
    .tester-platform-badge { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 2px 8px; border-radius: 4px; background: var(--accent-soft); color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; margin-left: 8px; vertical-align: middle; display: inline-block; }

    /* TESTING STYLES / REDESIGN ADDITIONS */
    .top-bar { position: sticky; top: 0; z-index: 10; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; background: rgba(15,20,16,0.88); backdrop-filter: blur(20px); border-bottom: 1px solid var(--line); }
    .top-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
    
    .nav-btn { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid var(--line); color: var(--ink-soft); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
    .nav-btn:hover:not([disabled]) { background: rgba(255,255,255,0.08); border-color: var(--line-strong); color: var(--ink); }
    .nav-btn.back-btn:hover:not([disabled]) { transform: translateX(-1px); }
    .nav-btn.fwd-btn:hover:not([disabled]) { transform: translateX(1px); }
    .nav-btn[disabled] { opacity: 0.3; cursor: not-allowed; }
    .nav-btn svg { width: 16px; height: 16px; }

    .jump-pill { position: sticky; top: 69px; z-index: 9; max-width: 720px; margin: 12px auto 0; padding: 0 24px; display: none; align-items: center; justify-content: space-between; gap: 14px; }
    .jump-pill.show { display: flex; animation: jumpIn 0.3s cubic-bezier(.2,.6,.2,1); }
    @keyframes jumpIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    .jump-pill-text { font-size: 13px; color: var(--amber); font-family: 'IBM Plex Sans', sans-serif; padding: 8px 14px; background: var(--amber-soft); border: 1px solid rgba(232,200,136,0.3); border-radius: 20px; flex: 1; text-align: center; }
    .jump-pill-text strong { color: var(--ink); font-weight: 500; }
    .jump-pill-btn { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--amber); border: none; border-radius: 20px; color: #3a2e0a; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; letter-spacing: -0.01em; }
    .jump-pill-btn:hover { transform: translateX(2px); box-shadow: 0 4px 12px rgba(232,200,136,0.3); }
    .jump-pill-btn svg { opacity: 0.8; }

    .top-info { min-width: 0; }
    .top-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: dotPulse 2s ease-in-out infinite; flex-shrink: 0; }
    .top-title { font-weight: 500; font-size: 15px; color: var(--ink); letter-spacing: -0.01em; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; }
    .top-sub { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-top: 2px; }
    .top-sub.review { color: var(--amber); }
    .time-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-soft); }

    .progress-trail { display: flex; justify-content: center; gap: 4px; padding: 20px 28px 8px; position: relative; z-index: 2; flex-wrap: wrap; }
    .trail-node { width: 22px; height: 3px; background: var(--line); border-radius: 2px; transition: all 0.25s; cursor: pointer; position: relative; }
    .trail-node.pass { background: var(--accent); opacity: 0.6; }
    .trail-node.pass-note { background: var(--amber); opacity: 0.75; }
    .trail-node.fail { background: var(--rose); opacity: 0.6; }
    .trail-node.current { background: var(--accent); box-shadow: 0 0 12px var(--accent-soft); animation: currentPulse 2s ease-in-out infinite; opacity: 1; }
    .trail-node.viewing { background: var(--ink-soft); transform: scaleY(2); opacity: 1; box-shadow: 0 0 8px rgba(255,255,255,0.25); }
    .trail-node.viewing.pass { background: var(--accent); }
    .trail-node.viewing.pass-note { background: var(--amber); }
    .trail-node.viewing.fail { background: var(--rose); }
    .trail-node:hover:not(.current):not(.viewing) { transform: scaleY(1.8); opacity: 1; }

    .stage { position: relative; z-index: 2; max-width: 980px; margin: 0 auto; padding: 20px 24px 180px; }
    .stage.narrow { max-width: 720px; }

    .step-shell { display: grid; grid-template-columns: 220px 1fr; gap: 18px; align-items: start; }
    .step-shell.no-context { grid-template-columns: 1fr; max-width: 720px; margin: 0 auto; }

    .context-panel { position: sticky; top: 100px; padding: 22px 20px; background: rgba(255,255,255,0.015); border: 1px solid var(--line); border-radius: 16px; animation: stepIn 0.5s cubic-bezier(.2,.6,.2,1) both; }
    .context-block + .context-block { margin-top: 20px; padding-top: 20px; border-top: 1px dashed var(--line); }
    .context-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--accent); font-weight: 500; display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
    .context-label::before { content: ''; width: 10px; height: 1px; background: var(--accent); }
    .context-label.amber { color: var(--amber); }
    .context-label.amber::before { background: var(--amber); }
    .context-text { font-size: 13.5px; line-height: 1.55; color: var(--ink-soft); }
    .context-text.italic { font-family: 'Fraunces', serif; font-style: italic; font-weight: 400; font-size: 15px; line-height: 1.5; color: var(--ink); }

    .step-card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 28px 32px; position: relative; animation: stepIn 0.4s cubic-bezier(.2,.6,.2,1) both; backdrop-filter: blur(20px); transition: border-color 0.3s; }
    .step-card.reviewing { border-color: var(--amber); }
    @keyframes stepIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    .step-card.passing { animation: stepPass 0.6s cubic-bezier(.5,.0,.8,.3) forwards; }
    @keyframes stepPass { 0% { transform: translateY(0) scale(1); } 30% { transform: translateY(0) scale(1.02); box-shadow: 0 0 60px rgba(122,178,138,0.4); } 100% { transform: translateY(-40px) scale(0.95); opacity: 0; } }
    .step-card.failing { animation: stepFail 0.5s cubic-bezier(.3,0,.5,.3) forwards; }
    @keyframes stepFail { 0% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } 100% { transform: translateX(0); } }

    .review-banner { display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin: -4px 0 20px; background: var(--amber-soft); border: 1px solid rgba(232,200,136,0.3); border-radius: 10px; font-size: 12.5px; color: var(--amber); animation: bannerIn 0.3s cubic-bezier(.2,.6,.2,1); }
    @keyframes bannerIn { from { opacity: 0; } to { opacity: 1; } }
    .review-banner svg { width: 14px; height: 14px; flex-shrink: 0; }
    .review-banner strong { color: var(--ink); font-weight: 500; }

    .step-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
    .step-number { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); padding: 4px 10px; background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 4px; font-weight: 500; }
    .step-priority { display: inline-flex; align-items: center; gap: 5px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; padding: 3px 8px; border-radius: 4px; font-weight: 500; }
    .step-priority.high { color: var(--rose); background: var(--rose-soft); }
    .step-priority.high::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--rose); }

    .prior-status { display: inline-flex; align-items: center; gap: 5px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; padding: 3px 9px; border-radius: 10px; font-weight: 500; }
    .prior-status.pass { color: var(--accent); background: var(--accent-soft); border: 1px solid rgba(122,178,138,0.3); }
    .prior-status.pass-note { color: var(--amber); background: var(--amber-soft); border: 1px solid rgba(232,200,136,0.3); }
    .prior-status.fail { color: var(--rose); background: var(--rose-soft); border: 1px solid rgba(216,138,144,0.3); }

    .step-action { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 500; line-height: 1.25; letter-spacing: -0.02em; color: var(--ink); margin: 0 0 22px; }
    
    .step-action-intro { font-family: 'Fraunces', serif; font-size: 15px; font-style: italic; color: var(--ink-mute); margin: 0 0 14px; letter-spacing: 0.01em; }
    .step-action-list { list-style: none; padding: 0; margin: 0 0 24px; counter-reset: step; }
    .step-action-list li { display: grid; grid-template-columns: 28px 1fr; gap: 4px; padding: 10px 0; border-bottom: 1px dashed var(--line); counter-increment: step; font-size: 16px; line-height: 1.45; color: var(--ink); }
    .step-action-list li:last-child { border-bottom: none; }
    .step-action-list li::before { content: counter(step, decimal-leading-zero); font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; color: var(--accent); letter-spacing: 0.08em; padding-top: 5px; }

    .step-expected-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent); margin-bottom: 8px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
    .step-expected-label::before { content: ''; width: 14px; height: 1px; background: var(--accent); }
    .step-expected { font-size: 15px; color: var(--ink-soft); margin: 0 0 20px; line-height: 1.55; padding-left: 20px; border-left: 2px solid var(--accent-soft); }

    .prior-result { margin-top: 20px; padding: 16px 18px; background: rgba(232,200,136,0.04); border: 1px solid rgba(232,200,136,0.2); border-radius: 12px; animation: bannerIn 0.3s cubic-bezier(.2,.6,.2,1) 0.1s both; }
    .prior-result-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--amber); font-weight: 500; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
    .prior-chips { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
    .prior-chip { padding: 3px 8px; background: rgba(232,200,136,0.1); border: 1px solid rgba(232,200,136,0.3); border-radius: 10px; font-size: 11px; color: var(--amber); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.04em; }
    .prior-notes { font-family: 'Fraunces', serif; font-style: italic; font-weight: 400; font-size: 14px; color: var(--ink); margin: 0 0 10px; line-height: 1.5; }
    .prior-evidence { display: flex; gap: 8px; flex-wrap: wrap; }
    .prior-thumb { width: 80px; height: 56px; border-radius: 6px; background: var(--surface-lift); border: 1px solid var(--line); overflow: hidden; cursor: zoom-in; }
    .prior-thumb img { width: 100%; height: 100%; object-fit: cover; }

    .attachments-block { margin-top: 20px; padding-top: 20px; border-top: 1px dashed var(--line); }
    .attachments-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .attachments-label .count { padding: 2px 7px; background: rgba(255,255,255,0.06); border-radius: 10px; color: var(--ink-soft); }
    .attachment-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .attachment { position: relative; width: 180px; height: 128px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-lift); cursor: zoom-in; overflow: hidden; transition: all 0.2s cubic-bezier(.2,.6,.2,1); }
    .attachment:hover { transform: translateY(-2px); border-color: var(--accent); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    .attachment img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .attachment .expand-ico { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; background: rgba(0,0,0,0.55); backdrop-filter: blur(8px); border-radius: 6px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
    .attachment:hover .expand-ico { opacity: 1; }
    .attachment .expand-ico svg { width: 12px; height: 12px; color: #fff; }
    .attachment .type-tag { position: absolute; bottom: 8px; left: 8px; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; padding: 3px 7px; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); color: #fff; border-radius: 4px; font-weight: 500; }
    .attachment.video::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 44px; height: 44px; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); border-radius: 50%; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='white'%3E%3Cpolygon points='6 4 20 12 6 20 6 4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: center; }
    
    .attachment.link { width: auto; min-width: 200px; height: 60px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
    .attachment.link .link-ico { width: 36px; height: 36px; flex-shrink: 0; border-radius: 8px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.1em; }
    .attachment.link .link-info { min-width: 0; }
    .attachment.link .link-title { font-size: 13px; color: var(--ink); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
    .attachment.link .link-host { font-size: 11px; color: var(--ink-mute); }

    .peek-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 18px 22px; margin-top: 14px; transform: scale(0.96); opacity: 0.55; transition: all 0.3s cubic-bezier(.2,.6,.2,1); cursor: default; position: relative; }
    .peek-card::before { content: 'UP NEXT'; position: absolute; top: -9px; left: 24px; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); background: var(--bg); padding: 2px 8px; border: 1px solid var(--line); border-radius: 4px; }
    .peek-step-num { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 6px; }
    .peek-action { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 500; color: var(--ink-soft); margin: 0; line-height: 1.4; letter-spacing: -0.01em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    /* ACTION BAR */
    .action-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 10; padding: 20px 28px 26px; background: linear-gradient(180deg, transparent 0%, rgba(15,20,16,0.9) 30%, rgba(15,20,16,1) 100%); transition: opacity 0.3s; }
    .action-row { max-width: 720px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .abtn { height: 60px; border-radius: 14px; border: 1px solid var(--line-strong); font-family: 'IBM Plex Sans', sans-serif; font-size: 17px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s cubic-bezier(.2,.6,.2,1); letter-spacing: -0.01em; }
    .btn-fail { background: rgba(255,255,255,0.03); color: var(--ink-soft); }
    .btn-fail:hover { background: var(--rose-soft); color: var(--rose); border-color: var(--rose); transform: translateY(-2px); }
    .btn-pass { background: linear-gradient(180deg, #8ec7a0 0%, #7ab28a 100%); color: #0f1410; border-color: transparent; font-weight: 600; }
    .btn-pass:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(122,178,138,0.3); }
    .btn-fail.prior-fail, .btn-pass.prior-pass { position: relative; }
    .btn-fail.prior-fail::after, .btn-pass.prior-pass::after { content: ''; position: absolute; top: 8px; right: 12px; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

    .kbd-shortcut-hint { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); letter-spacing: 0.12em; text-transform: uppercase; padding: 6px 12px; background: rgba(15,20,16,0.6); backdrop-filter: blur(8px); border: 1px solid var(--line); border-radius: 8px; opacity: 0.7; pointer-events: none; z-index: 5; transition: opacity 0.3s; }
    .kbd-shortcut-hint kbd { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; margin: 0 2px; font-weight: 500; color: var(--ink-soft); }

    /* SHEETS AND PANELS */
    .sheet-overlay { position: fixed; inset: 0; background: rgba(10,14,10,0.55); backdrop-filter: blur(8px); z-index: 40; opacity: 0; pointer-events: none; transition: opacity 0.25s; }
    .sheet-overlay.show { opacity: 1; pointer-events: auto; }

    .pass-sheet { position: fixed; left: 0; right: 0; bottom: 0; background: var(--surface); border-top: 1px solid var(--line-strong); border-radius: 20px 20px 0 0; padding: 18px 24px 22px; box-shadow: 0 -20px 60px rgba(0,0,0,0.35); z-index: 50; transform: translateY(100%); transition: transform 0.35s cubic-bezier(.2,.6,.2,1); }
    .pass-sheet.open { transform: translateY(0); }
    .pass-sheet-inner { max-width: 580px; margin: 0 auto; }
    .sheet-handle { width: 34px; height: 3px; background: var(--line-strong); border-radius: 2px; margin: -4px auto 14px; }
    
    .pass-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent); font-weight: 500; margin-bottom: 6px; }
    .pass-eyebrow::before { content: ''; width: 12px; height: 12px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%237ab28a' stroke-width='3' stroke-linecap='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E"); background-size: contain; background-repeat: no-repeat; }
    .pass-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500; letter-spacing: -0.02em; color: var(--ink); margin: 0 0 2px; }
    .pass-title em { font-style: italic; font-weight: 400; color: var(--accent); }
    .pass-sub { font-size: 12.5px; color: var(--ink-mute); margin: 0 0 16px; }

    .pass-field-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 8px; font-weight: 500; }
    .pass-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .pass-chip { padding: 6px 11px; background: rgba(255,255,255,0.03); border: 1px solid var(--line); border-radius: 16px; color: var(--ink-soft); font-size: 12px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
    .pass-chip:hover { border-color: var(--line-strong); color: var(--ink); }
    .pass-chip.selected { background: var(--amber-soft); border-color: var(--amber); color: var(--amber); }

    .pass-notes { width: 100%; min-height: 60px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--line); border-radius: 10px; color: var(--ink); font-family: inherit; font-size: 13px; line-height: 1.5; resize: vertical; margin-bottom: 10px; }
    .pass-notes:focus { outline: none; border-color: var(--accent); }
    .pass-notes::placeholder { color: var(--ink-mute); }

    .pass-attach-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .pass-attach-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; background: rgba(255,255,255,0.03); border: 1px solid var(--line); border-radius: 8px; color: var(--ink-soft); font-size: 11.5px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
    .pass-attach-btn:hover { color: var(--ink); border-color: var(--line-strong); }
    .pass-attach-btn.done { color: var(--accent); border-color: var(--accent); }

    .pass-action-area { display: flex; flex-direction: column; gap: 8px; }
    .pass-skip-btn { height: 52px; width: 100%; border-radius: 14px; border: 1px solid var(--line-strong); background: rgba(255,255,255,0.04); color: var(--ink); font-family: inherit; font-size: 15px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s; letter-spacing: -0.01em; }
    .pass-skip-btn:hover { background: rgba(255,255,255,0.07); border-color: var(--ink-mute); }
    .pass-submit-btn { height: 44px; width: 100%; border-radius: 12px; border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent); font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; opacity: 0; max-height: 0; padding: 0; overflow: hidden; pointer-events: none; }
    .pass-submit-btn.visible { opacity: 1; max-height: 52px; padding: 0 16px; pointer-events: auto; animation: submitIn 0.25s cubic-bezier(.2,.6,.2,1); }
    .pass-submit-btn:hover:not(:disabled) { background: rgba(122,178,138,0.22); border-color: #94c5a3; color: #94c5a3; }
    .pass-submit-btn .arrow { transition: transform 0.2s; }
    .pass-submit-btn:hover:not(:disabled) .arrow { transform: translateX(3px); }
    
    .pass-skip-btn .kbd, .pass-submit-btn .kbd { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 1px 5px; background: rgba(255,255,255,0.08); border-radius: 3px; letter-spacing: 0.04em; font-weight: 400; opacity: 0.65; }
    .pass-submit-btn .kbd { background: rgba(122,178,138,0.15); opacity: 0.8; }
    @keyframes submitIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    .fail-panel { position: fixed; left: 0; right: 0; bottom: 0; background: var(--surface); border-top: 1px solid var(--line-strong); border-radius: 20px 20px 0 0; padding: 18px 24px 22px; box-shadow: 0 -20px 60px rgba(0,0,0,0.35); z-index: 50; transform: translateY(100%); transition: transform 0.35s cubic-bezier(.2,.6,.2,1); }
    .fail-panel.open { transform: translateY(0); }
    .fail-inner { max-width: 580px; margin: 0 auto; }
    .fail-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--rose); font-weight: 500; margin-bottom: 6px; }
    .fail-eyebrow::before { content: ''; width: 8px; height: 8px; background: var(--rose); border-radius: 50%; }
    .fail-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500; margin: 0 0 2px; }
    .fail-sub { font-size: 12.5px; color: var(--ink-mute); margin: 0 0 16px; }
    .fail-submit-btn { height: 52px; width: 100%; border-radius: 14px; border: 1px solid var(--rose); background: var(--rose-soft); color: var(--rose); font-family: inherit; font-size: 15px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 4px; transition: all 0.2s; }
    .fail-submit-btn:hover { background: rgba(216,138,144,0.22); }
    .fail-cancel-btn { height: 44px; width: 100%; border-radius: 12px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink-soft); font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 8px; transition: all 0.2s; }
    .fail-cancel-btn:hover { background: rgba(255,255,255,0.04); color: var(--ink); }

    /* FLASH OVERLAY */
    .flash-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15,20,16,0.72); backdrop-filter: blur(10px); z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
    .flash-overlay.show { opacity: 1; pointer-events: auto; }
    .flash-content { text-align: center; }
    .flash-overlay.show .flash-content { animation: flashContent 0.4s cubic-bezier(.2,.6,.2,1); }
    @keyframes flashContent { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .flash-tick { width: 84px; height: 84px; border-radius: 50%; background: var(--accent); color: #0f1410; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; box-shadow: 0 0 0 12px rgba(122,178,138,0.15), 0 0 0 24px rgba(122,178,138,0.08); }
    .flash-tick.quiet { background: transparent; border: 2px solid var(--accent); color: var(--accent); box-shadow: 0 0 0 10px rgba(122,178,138,0.1); }
    .flash-tick.fail { background: var(--rose); color: #0f1410; box-shadow: 0 0 0 12px rgba(216,138,144,0.15), 0 0 0 24px rgba(216,138,144,0.08); }
    .flash-word { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 500; letter-spacing: -0.02em; margin: 0; }
    .flash-sub { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--ink-mute); margin-top: 10px; font-weight: 500; }

    /* COMPLETE STAGE */
    .medal-wrap { display: flex; justify-content: center; margin-bottom: 28px; animation: fadeSlide 0.8s 0.2s both cubic-bezier(.2,.6,.2,1); }
    .medal { width: 110px; height: 110px; border-radius: 50%; background: linear-gradient(180deg, #8ec7a0 0%, #7ab28a 100%); color: #0f1410; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 14px rgba(122,178,138,0.12), 0 0 0 28px rgba(122,178,138,0.06), 0 10px 40px rgba(122,178,138,0.3); animation: medalPop 0.8s 0.3s cubic-bezier(.2,.8,.3,1.4) both; }
    @keyframes medalPop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    .big-stats { display: flex; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 26px; margin-bottom: 18px; gap: 20px; align-items: center; backdrop-filter: blur(20px); animation: fadeSlide 0.8s 0.5s both cubic-bezier(.2,.6,.2,1); }
    .big-stat { flex: 1; text-align: center; }
    .big-stat .bs-value { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 500; line-height: 1; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 6px; }
    .big-stat .bs-value em { font-style: italic; color: var(--accent); font-weight: 500; }
    .big-stat .bs-label { font-size: 11px; color: var(--ink-mute); font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.12em; }
    .stat-divider { width: 1px; height: 50px; background: var(--line); }

    .percentile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 22px; margin-bottom: 18px; display: flex; align-items: center; gap: 16px; backdrop-filter: blur(20px); animation: fadeSlide 0.8s 0.6s both cubic-bezier(.2,.6,.2,1); }
    .pct-badge { width: 52px; height: 52px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .pct-text { min-width: 0; }
    .pct-headline { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 500; letter-spacing: -0.01em; margin: 0 0 2px; color: var(--ink); }
    .pct-headline em { font-style: italic; color: var(--accent); }
    .pct-sub { font-size: 12px; color: var(--ink-mute); margin: 0; }

    .results { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px 22px; margin-bottom: 28px; backdrop-filter: blur(20px); animation: fadeSlide 0.8s 0.7s both cubic-bezier(.2,.6,.2,1); }
    .results-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 12px; font-weight: 500; }
    .results-bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--surface-lift); margin-bottom: 12px; }
    .seg { height: 100%; transition: flex 0.8s cubic-bezier(.2,.6,.2,1); }
    .seg.pass { background: var(--accent); }
    .seg.fail { background: var(--rose); }
    .results-legend { display: flex; gap: 18px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.1em; }
    .legend-item { display: inline-flex; align-items: center; gap: 6px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
    .legend-dot.pass { background: var(--accent); }
    .legend-dot.fail { background: var(--rose); }

    .c-actions { display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; animation: fadeSlide 0.8s 0.8s both cubic-bezier(.2,.6,.2,1); }
    .c-btn { height: 56px; border-radius: var(--radius); font-family: 'IBM Plex Sans', sans-serif; font-size: 15px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s; letter-spacing: -0.01em; border: 1px solid var(--line-strong); }
    .c-btn-primary { background: var(--accent); color: #0f1410; border-color: transparent; font-weight: 600; box-shadow: 0 6px 18px rgba(122,178,138,0.25); }
    .c-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(122,178,138,0.35); background: #8ec7a0; }
    .c-btn-secondary { background: transparent; color: var(--ink-soft); }
    .c-btn-secondary:hover { background: rgba(255,255,255,0.04); color: var(--ink); border-color: var(--ink-mute); }

    .thank-you { text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); display: flex; align-items: center; justify-content: center; gap: 6px; animation: fadeSlide 0.8s 0.9s both cubic-bezier(.2,.6,.2,1); }
    .thank-you svg { color: var(--rose); }

    .confetti-layer { position: fixed; inset: 0; pointer-events: none; z-index: 50; overflow: hidden; }
    .confetti { position: absolute; border-radius: 2px; }
    .confetti.fire { animation: confettiFall linear forwards; }
    @keyframes confettiFall { 0% { transform: translateY(-20px) rotate(0); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }

    /* RESULTS PAGE */
    .results-hero { padding: 40px 24px 20px; max-width: 720px; margin: 0 auto; text-align: center; }
    .results-hero-title { font-family: 'Fraunces', serif; font-size: 42px; font-weight: 500; letter-spacing: -0.03em; margin: 0 0 8px; color: var(--ink); }
    .results-hero-title em { font-style: italic; color: var(--accent); }
    .results-hero-sub { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); }

    .timeline { max-width: 720px; margin: 0 auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
    .timeline-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; opacity: 0; animation: fadeSlide 0.5s cubic-bezier(.2,.6,.2,1) forwards; border-left: 3px solid transparent; }
    .timeline-card.t-pass { border-left-color: var(--accent); }
    .timeline-card.t-fail { border-left-color: var(--rose); }
    .timeline-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .t-step-num { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); }
    .t-status { display: inline-flex; align-items: center; gap: 5px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; padding: 3px 9px; border-radius: 10px; font-weight: 500; }
    .t-status.pass { color: var(--accent); background: var(--accent-soft); }
    .t-status.fail { color: var(--rose); background: var(--rose-soft); }
    .timeline-action { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 500; margin: 0 0 6px; line-height: 1.3; letter-spacing: -0.01em; color: var(--ink); }
    .timeline-expected { font-size: 13px; color: var(--ink-soft); margin: 0 0 10px; line-height: 1.5; }
    .timeline-notes { margin-top: 12px; padding: 12px 14px; background: rgba(216,138,144,0.05); border-left: 2px solid var(--rose); border-radius: 8px; }
    .t-notes-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--rose); font-weight: 500; margin-bottom: 6px; }
    .t-notes-text { font-family: 'Fraunces', serif; font-style: italic; font-size: 13px; color: var(--ink); line-height: 1.5; margin-bottom: 10px; }
    .t-evidence-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .t-evidence-item, .t-evidence-vid { width: 90px; height: 64px; border-radius: 6px; background-size: cover; background-position: center; background-color: var(--surface-lift); border: 1px solid var(--line); cursor: zoom-in; transition: transform 0.2s; }
    .t-evidence-item:hover, .t-evidence-vid:hover { transform: translateY(-2px); border-color: var(--rose); }
    .t-evidence-vid { display: flex; align-items: center; justify-content: center; color: var(--ink-mute); }

    /* LIGHTBOX */
    .lightbox { position: fixed; inset: 0; z-index: 1000; background: rgba(10,14,10,0.92); backdrop-filter: blur(16px); display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.25s; }
    .lightbox.open { display: flex; opacity: 1; }
    .lightbox-inner { max-width: 92vw; max-height: 88vh; position: relative; animation: lightboxIn 0.3s cubic-bezier(.2,.6,.2,1); }
    @keyframes lightboxIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
    .lightbox-img { max-width: 92vw; max-height: 82vh; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); display: block; }
    .lightbox-top { position: absolute; top: -44px; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; }
    .lightbox-counter { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-soft); letter-spacing: 0.14em; text-transform: uppercase; }
    .lightbox-close { width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.08); border: 1px solid var(--line); color: var(--ink); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .lightbox-close:hover { background: rgba(255,255,255,0.15); transform: scale(1.05); }
    .lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.08); backdrop-filter: blur(10px); border: 1px solid var(--line); color: var(--ink); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .lightbox-nav:hover { background: rgba(255,255,255,0.18); transform: translateY(-50%) scale(1.05); }
    .lightbox-nav.prev { left: -60px; }
    .lightbox-nav.next { right: -60px; }

    /* RESULTS PAGE & MISC */
    .qr-full { position: fixed; inset: 0; background: rgba(18,26,23,0.6); backdrop-filter: blur(6px); display: none; align-items: center; justify-content: center; z-index: 1000; }
    .qr-full.show { display: flex; animation: fadeIn 0.2s ease; }
    .qr-full-card { background: var(--surface); border-radius: 16px; padding: 32px; text-align: center; max-width: 400px; box-shadow: 0 24px 60px rgba(0,0,0,0.5); }
    .qr-full-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 4px; }
    .qr-full-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 20px; }
    .qr-full-img { width: 260px; height: 260px; background: var(--surface); border: 2px solid var(--ink); border-radius: 12px; margin: 0 auto 20px; padding: 18px; position: relative; display: flex; align-items: center; justify-content: center; }
    .qr-close-btn { background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink-soft); height: 40px; padding: 0 20px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500; width: 100%; }
    .qr-close-btn:hover { background: var(--surface-lift); color: var(--ink); }

    /* Responsive */
    @media (max-width: 820px) {
      .step-shell { grid-template-columns: 1fr; }
      .context-panel { position: static; order: -1; }
      .lightbox-nav.prev { left: 10px; }
      .lightbox-nav.next { right: 10px; }
    }
    @media (max-width: 600px) {
      .step-card { padding: 24px 20px; border-radius: 16px; }
      .step-action { font-size: 24px; }
      .top-bar { padding: 14px 16px; }
      .top-title { font-size: 15px; }
      .time-chip { padding: 5px 10px; font-size: 10px; }
      .stage { padding: 20px 16px 140px; }
      .progress-trail { padding: 12px 16px 0; }
      .action-bar { padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); }
      .abtn { height: 56px; font-size: 15px; }
      .action-row { grid-template-columns: 1fr 1.6fr; }
      .hero-title { font-size: 40px; }
      .greeting { font-size: 40px; }
      .medal { width: 90px; height: 90px; }
      .big-stat .bs-value { font-size: 36px; }
      .big-stats { padding: 22px; }
      .pct-headline { font-size: 18px; }
      .pct-badge { width: 48px; height: 48px; }
      .attachment { width: 100%; max-width: 260px; }
    }
  `}} />
));
GlobalTesterStyles.displayName = 'GlobalTesterStyles';

export default function TesterExecutionEngine() {
  const params = useParams();
  const runId = (params?.id || params?.testRunId || '') as string;
  const [isMounted, setIsMounted] = useState(false);

  const [runData, setRunData] = useState<TestRunData | null>(null);
  const [stage, setStage] = useState<TesterStage>('LOADING');
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Core Platform Memoization
  const visibleSteps = useMemo(
    () => (runData?.steps || []).filter(s => stepAppliesToPlatform(s, runData?.platform)),
    [runData?.steps, runData?.platform]
  );

  // Welcome State
  const [device, setDevice] = useState('');
  const [os, setOs] = useState('');
  const [browser, setBrowser] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);

  // Testing & Timer State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [liveIdx, setLiveIdx] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());
  const [cumulativeTimeMs, setCumulativeTimeMs] = useState(0);
  const cumulativeTimeRef = useRef(0);
  const sessionStartRef = useRef(Date.now());

  // Lightbox
  const [lightboxState, setLightboxState] = useState<{ urls: string[]; startIdx: number } | null>(null);

  // Pass/Fail Overlays
  const [animatingState, setAnimatingState] = useState<'pass' | 'fail' | null>(null);
  const [flashConfig, setFlashConfig] = useState<{show: boolean, type: 'pass' | 'quiet' | 'fail', sub?: string | null}>({show: false, type: 'pass'});

  const [passSheetOpen, setPassSheetOpen] = useState(false);
  const [passChips, setPassChips] = useState<string[]>([]);
  const [passNotes, setPassNotes] = useState('');
  const [passMediaUrls, setPassMediaUrls] = useState<string[]>([]);
  const [isPassQuietFlash, setIsPassQuietFlash] = useState(false);

  const [failPanelOpen, setFailPanelOpen] = useState(false);
  const [failChips, setFailChips] = useState<string[]>([]);
  const [failNotes, setFailNotes] = useState('');
  const [failMediaUrls, setFailMediaUrls] = useState<string[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // QR Mobile Upload State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrTargetPanel, setQrTargetPanel] = useState<'pass' | 'fail' | null>(null);
  const [uploadToken, setUploadToken] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');

  const confettiContainerRef = useRef<HTMLDivElement>(null);

  // --- Messages State ---
  const [messages, setMessages] = useState<TesterMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [stepCalloutReplyOpen, setStepCalloutReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [toastMessage, setToastMessage] = useState<TesterMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // ═══════════════════════════════════════════════════════════
  // DERIVED VALUES
  // ═══════════════════════════════════════════════════════════
  const isReviewing = currentIdx < liveIdx;
  const passSheetIsDirty = passChips.length > 0 || passNotes.trim().length > 0 || passMediaUrls.length > 0;
  
  // The run is considered "started" the second they click "Start testing" and we save their device info.
  const hasSavedDevice = !!runData?.deviceInfo?.device;
  const isResuming = hasSavedDevice && !runData?.isCompleted;
  
  const isReadyToStart = device.trim().length > 0 && os.trim().length > 0 && browser.trim().length > 0;

  // 1. Initial Mount Check
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Fetch Data
  useEffect(() => {
    if (!runId) return;
    const docRef = doc(db, 'testRuns', runId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as TestRunData;
        setRunData({ id: docSnap.id, ...data });

        if (data.cumulativeTimeMs && cumulativeTimeRef.current === 0) {
          setCumulativeTimeMs(data.cumulativeTimeMs);
          cumulativeTimeRef.current = data.cumulativeTimeMs;
        }

        if (data.isCompleted && stage === 'LOADING') {
          setStage('COMPLETE');
        } else if (stage === 'LOADING') {
          // Safeguard: use the platform filtered array when deciding where to start
          const applicableSteps = (data.steps || []).filter(s => stepAppliesToPlatform(s, data.platform));
          const firstUncompleted = applicableSteps.findIndex(s => !data.results?.[s.id]);
          const startIdx = firstUncompleted === -1 ? 0 : (firstUncompleted || 0);
          setCurrentIdx(startIdx);
          setLiveIdx(startIdx);
          setStage('WELCOME');
        }
      } else {
        setErrorMsg("Test run not found or link has expired.");
      }
    }, () => {
      setErrorMsg("Unable to connect to database.");
    });
    return () => unsubscribe();
  }, [runId, stage]);

  // 3. Background Timer Sync
  useEffect(() => {
    if (stage !== 'TESTING' || !runId) return;
    sessionStartRef.current = Date.now();
    const syncInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - sessionStartRef.current;
      cumulativeTimeRef.current += elapsed;
      sessionStartRef.current = now;
      updateDoc(doc(db, 'testRuns', runId), { cumulativeTimeMs: cumulativeTimeRef.current }).catch(() => {});
      setCumulativeTimeMs(cumulativeTimeRef.current);
      setSessionStartTime(now);
    }, 10000);
    return () => clearInterval(syncInterval);
  }, [stage, runId]);

  // 4. Auto-detect environment
  useEffect(() => {
    if (stage === 'WELCOME' && runData) {
      if (runData.deviceInfo?.device) {
        // If resuming, trust the database over the current browser
        setDevice(runData.deviceInfo.device);
        setOs(runData.deviceInfo.os);
        setBrowser(runData.deviceInfo.browser);
      } else {
        setTimeout(() => {
          let d = '', o = 'macOS', b = 'Chrome'; // Fallbacks

          const ua = navigator.userAgent;
          
          // Simplified OS matching for Dropdown
          if (/iPhone|iPad|iPod/.test(ua)) { d = /iPad/.test(ua) ? 'iPad' : 'iPhone'; o = 'iOS'; }
          else if (/Android/.test(ua)) { d = 'Android Phone'; o = 'Android'; }
          else if (/Macintosh/.test(ua)) { d = 'Mac'; o = 'macOS'; }
          else if (/Windows/.test(ua)) { d = 'Windows PC'; o = 'Windows'; }
          else { o = 'Other'; }

          // Simplified Browser matching for Dropdown
          if (/Edg\//.test(ua)) b = 'Edge';
          else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) b = 'Chrome';
          else if (/Firefox\//.test(ua)) b = 'Firefox';
          else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) b = 'Safari';
          else b = 'Other';

          setAutoDetected(true);
          setDevice(d || 'Unknown Device');
          setOs(o);
          setBrowser(b);
        }, 400);
      }
    }
  }, [stage, runData]);

  // 5. Mobile QR Upload Listener
  useEffect(() => {
    if (!qrModalOpen || !uploadToken || !qrTargetPanel) return;
    const docRef = doc(db, 'mobileUploads', uploadToken);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().url) {
        if (qrTargetPanel === 'pass') setPassMediaUrls(prev => [...prev, docSnap.data().url]);
        else setFailMediaUrls(prev => [...prev, docSnap.data().url]);
        setQrModalOpen(false);
        setQrTargetPanel(null);
      }
    });
    return () => unsubscribe();
  }, [qrModalOpen, uploadToken, qrTargetPanel]);

  // 6. Messages Subscription
  useEffect(() => {
    if (!runId) return;
    const q = query(
      collection(db, 'testerMessages'),
      where('runId', '==', runId),
      orderBy('createdAt', 'desc')
    );

    let isFirstSnapshot = true;
    let previousIds = new Set<string>();

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as TesterMessage[];

      if (!isFirstSnapshot) {
        const newPmMessages = next.filter(m =>
          m.direction === 'pm_to_tester' &&
          !m.readByTester &&
          !previousIds.has(m.id)
        );
        if (newPmMessages.length > 0) {
          showToast(newPmMessages[0]);
        }
      }

      setMessages(next);
      setMessagesLoaded(true);
      previousIds = new Set(next.map(m => m.id));
      isFirstSnapshot = false;
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // 7. Cleanup Toast Timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // --- Derived Message State ---
  const threads = useMemo<MessageThread[]>(() => {
    const rootMessages = messages.filter(m => m.direction === 'pm_to_tester' && !m.parentMessageId);
    return rootMessages.map(root => {
      const replies = messages
        .filter(m => m.parentMessageId === root.id)
        .sort((a, b) => a.createdAt - b.createdAt);
      
      const hasUnreadPm = !root.readByTester || replies.some(r => r.direction === 'pm_to_tester' && !r.readByTester);

      return {
        root,
        replies,
        isRead: !hasUnreadPm,
        hasReply: replies.length > 0,
      };
    });
  }, [messages]);

  const unreadThreads = useMemo(() => threads.filter(t => !t.isRead), [threads]);

  const currentStepThread = useMemo(() => {
    if (!runData || stage !== 'TESTING') return null;
    const currentStep = visibleSteps[currentIdx];
    if (!currentStep) return null;
    const stepThreads = threads.filter(t => t.root.stepId === currentStep.id);
    return stepThreads.find(t => !t.isRead) || stepThreads[0] || null;
  }, [threads, runData, stage, currentIdx, visibleSteps]);

  // --- Message Helpers ---
  const initialsOf = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatRelativeTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    if (h < 24) return `${h}h`;
    if (d === 1) return 'Yday';
    if (d < 7) return `${d}d`;
    return new Date(ts).toLocaleDateString();
  };

  const showToast = (message: TesterMessage) => {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 8000);
  };

  const dismissToast = () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMessage(null);
  };

  const handleToastClick = (message: TesterMessage) => {
    dismissToast();
    setInboxOpen(true);
    const rootId = message.parentMessageId || message.id;
    setOpenMessageId(rootId);
    markThreadRead(rootId);
  };

  const markThreadRead = async (rootId: string) => {
    const threadMsgs = messages.filter(m => m.id === rootId || m.parentMessageId === rootId);
    const unread = threadMsgs.filter(m => m.direction === 'pm_to_tester' && !m.readByTester);
    
    if (unread.length === 0) return;

    setMessages(prev => prev.map(m => unread.some(u => u.id === m.id) ? { ...m, readByTester: true } : m));

    try {
      await Promise.all(unread.map(m => updateDoc(doc(db, 'testerMessages', m.id), { readByTester: true })));
    } catch (err) {
      setMessages(prev => prev.map(m => unread.some(u => u.id === m.id) ? { ...m, readByTester: false } : m));
    }
  };

  const sendReply = async (parentMessage: TesterMessage) => {
    if (!replyDraft.trim() || sendingReply || !runData) return;
    setSendingReply(true);
    try {
      await addDoc(collection(db, 'testerMessages'), {
        runId: parentMessage.runId,
        projectName: parentMessage.projectName,
        testCycle: parentMessage.testCycle || null,
        testerId: parentMessage.testerId,
        testerName: parentMessage.testerName,
        pmName: parentMessage.pmName,
        direction: 'tester_to_pm',
        body: replyDraft.trim(),
        createdAt: Date.now(),
        stepId: parentMessage.stepId,
        stepIndex: parentMessage.stepIndex,
        stepAction: parentMessage.stepAction,
        parentMessageId: parentMessage.id,
        readByTester: true,
        readByPm: false,
        hasReply: false,
      });

      await updateDoc(doc(db, 'testerMessages', parentMessage.id), {
        hasReply: true,
      });

      setReplyDraft('');
      setOpenMessageId(null);
    } catch (err) {
      console.error('Send reply failed:', err);
      alert('Failed to send reply — please try again.');
    } finally {
      setSendingReply(false);
    }
  };

  const sendReplyFromCallout = async (parentMessage: TesterMessage) => {
    await sendReply(parentMessage);
    setStepCalloutReplyOpen(false);
  };

  const bannerSubtext = (threads: MessageThread[], unread: MessageThread[]): string => {
    if (unread.length === 0) return `${threads.length} message${threads.length > 1 ? 's' : ''} in your inbox.`;
    const stepMessages = unread.filter(t => t.root.stepId);
    const generalMessages = unread.filter(t => !t.root.stepId);

    if (stepMessages.length > 0 && generalMessages.length > 0) {
      return `About ${stepMessages.length} step${stepMessages.length > 1 ? 's' : ''} and the overall experience.`;
    }
    if (stepMessages.length === 1) {
      const idx = (stepMessages[0].root.stepIndex ?? 0) + 1;
      return `About Step ${idx}.`;
    }
    if (stepMessages.length > 1) {
      return `About ${stepMessages.length} specific steps.`;
    }
    return 'A general question about your feedback.';
  };


  // --- CORE ACTIONS ---
  const handleStart = async () => {
    if (!isResuming) {
      await updateDoc(doc(db, 'testRuns', runId), { deviceInfo: { device, os, browser } });
    }
    setSessionStartTime(Date.now());
    sessionStartRef.current = Date.now();
    setStage('TESTING');
  };

  const triggerFlash = (type: 'pass'|'quiet'|'fail', sub?: string | null) => {
    setFlashConfig({show: true, type, sub});
    setTimeout(() => setFlashConfig(prev => ({...prev, show: false})), 850);
  };

  const saveResult = async (payload: Partial<TestResult>, opts: { advance: boolean }, currentStep: ExtendedTestStep) => {
    if (!currentStep || !runData) return;
    const now = Date.now();
    const elapsedSinceSync = now - sessionStartRef.current;
    cumulativeTimeRef.current += elapsedSinceSync;
    sessionStartRef.current = now;

    await updateDoc(doc(db, 'testRuns', runId), {
      [`results.${currentStep.id}`]: { ...payload },
      cumulativeTimeMs: cumulativeTimeRef.current
    });

    setCumulativeTimeMs(cumulativeTimeRef.current);
    setSessionStartTime(now);

    if (opts.advance) {
      if (currentIdx >= visibleSteps.length - 1) {
        await updateDoc(doc(db, 'testRuns', runId), { isCompleted: true, completedAt: serverTimestamp() });
        setStage('COMPLETE');
        triggerConfetti();
      } else {
        const nextIdx = currentIdx + 1;
        setCurrentIdx(nextIdx);
        setLiveIdx(prev => Math.max(prev, nextIdx));
        setFailChips([]); setFailNotes(''); setFailMediaUrls([]);
      }
    }
  };

  // --- RENDER LIVE EVIDENCE FROM PHONE ---
  const renderLiveEvidence = (urls: string[]) => {
    if (urls.length === 0) return null;
    return (
      <div className="live-evidence-grid">
        {urls.map((url, i) => {
          const type = getMediaType(url);
          return (
            <div key={i} className={`live-thumb-wrap ${type}`} onClick={() => setLightboxState({ urls, startIdx: i })}>
              {type === 'video' ? (
                <div className="live-video-thumb">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>VID</span>
                </div>
              ) : type === 'pdf' ? (
                <div className="live-pdf-thumb">PDF</div>
              ) : (
                <img src={url} alt="Evidence" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // --- NAVIGATION HANDLERS ---
  const navigateTo = (idx: number) => {
    if (!runData) return;
    if (idx < 0 || idx >= visibleSteps.length) return;
    if (idx > liveIdx) return;
    setCurrentIdx(idx);
    setPassSheetOpen(false);
    setFailPanelOpen(false);
    setStepCalloutReplyOpen(false);
    setReplyDraft('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goBack = () => { if (currentIdx > 0) navigateTo(currentIdx - 1); };
  const goForward = () => { if (currentIdx < liveIdx) navigateTo(currentIdx + 1); };
  const jumpToLive = () => navigateTo(liveIdx);

  // --- PASS HANDLERS ---
  const handleSilentPass = (currentStep: ExtendedTestStep) => {
    if (animatingState !== null) return;
    const wasReviewing = isReviewing;
    setIsPassQuietFlash(false);
    triggerFlash('pass');
    setTimeout(() => saveResult({ status: 'Passed' }, { advance: !wasReviewing }, currentStep), 900);
  };

  const handlePassWithSheet = (currentStep: ExtendedTestStep) => {
    if (animatingState !== null || !currentStep || !runData) return;
    const prior = runData.results?.[currentStep.id];
    if (prior && prior.status === 'Passed') {
      setPassChips([...(prior.noteChips || [])]);
      setPassNotes(prior.notes || '');
      setPassMediaUrls([...(prior.evidenceUrls || [])]);
    } else if (prior && prior.status === 'Failed') {
      setPassChips([]);
      setPassNotes(prior.notes || '');
      setPassMediaUrls([...(prior.evidenceUrls || [])]);
    } else {
      setPassChips([]); setPassNotes(''); setPassMediaUrls([]);
    }
    setPassSheetOpen(true);
  };

  const completePass = (withNote: boolean, currentStep: ExtendedTestStep) => {
    if (!currentStep || !runData) return;
    const wasReviewing = isReviewing;

    setPassSheetOpen(false);
    setIsPassQuietFlash(withNote);

    const payload: Partial<TestResult> = { status: 'Passed' };
    if (withNote) {
      if (passChips.length) payload.noteChips = passChips;
      if (passNotes.trim()) payload.notes = passNotes.trim();
      if (passMediaUrls.length) payload.evidenceUrls = passMediaUrls;
    } else if (wasReviewing) {
      const prior = runData.results?.[currentStep.id];
      if (prior?.status === 'Passed') {
        if (prior.noteChips) payload.noteChips = prior.noteChips;
        if (prior.notes) payload.notes = prior.notes;
        if (prior.evidenceUrls) payload.evidenceUrls = prior.evidenceUrls;
      }
    }

    if (wasReviewing) {
      triggerFlash(withNote ? 'quiet' : 'pass', withNote ? 'Changes saved' : 'Kept as is');
      saveResult(payload, { advance: false }, currentStep);
    } else {
      triggerFlash(withNote ? 'quiet' : 'pass', withNote ? `Note saved · Step ${String(currentIdx+1).padStart(2,'0')} passed` : null);
      setTimeout(() => saveResult(payload, { advance: true }, currentStep), 900);
    }
    setPassChips([]); setPassNotes(''); setPassMediaUrls([]);
  };

  const handlePassSkip = (currentStep: ExtendedTestStep) => completePass(false, currentStep);
  const handlePassSubmit = (currentStep: ExtendedTestStep) => completePass(true, currentStep);

  // --- FAIL HANDLERS ---
  const openFailPanel = (currentStep: ExtendedTestStep) => {
    if (!currentStep || !runData) return;
    const prior = runData.results?.[currentStep.id];
    if (prior && prior.status === 'Failed') {
      setFailChips([...(prior.noteChips || [])]);
      setFailNotes(prior.notes || '');
      setFailMediaUrls([...(prior.evidenceUrls || [])]);
    } else {
      setFailChips([]); setFailNotes(''); setFailMediaUrls([]);
    }
    setFailPanelOpen(true);
  };

  const handleFailSubmit = (currentStep: ExtendedTestStep) => {
    const wasReviewing = isReviewing;
    setFailPanelOpen(false);
    setAnimatingState('fail');
    const payload: Partial<TestResult> = { status: 'Failed' };
    if (failChips.length) payload.noteChips = failChips;
    if (failNotes.trim()) payload.notes = failNotes.trim();
    if (failMediaUrls.length) payload.evidenceUrls = failMediaUrls;

    setTimeout(() => {
      setAnimatingState(null);
      triggerFlash('fail', wasReviewing ? 'Changes saved' : `Step ${String(currentIdx+1).padStart(2,'0')} failed`);
      setTimeout(() => saveResult(payload, { advance: !wasReviewing }, currentStep), 900);
    }, 400);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'pass' | 'fail') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingMedia(true);
    try {
      const storageRef = ref(storage, `tester_evidence/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      if (target === 'pass') setPassMediaUrls(prev => [...prev, url]);
      else setFailMediaUrls(prev => [...prev, url]);
    } catch {
      alert("Upload failed.");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const openQrScanner = (target: 'pass' | 'fail') => {
    const token = Math.random().toString(36).substring(2, 15);
    setUploadToken(token);
    setQrTargetPanel(target);
    
    // TEMPORARY FOR LOCAL TESTING - Replace with your actual ngrok URL
    setUploadUrl(`${window.location.origin}/mobile-upload/${token}`);
    // setUploadUrl(`https://3f8c-2a00-23cc-f62f-d101-a03c-930f-25a6-c895.ngrok-free.app/mobile-upload/${token}`); 
    
    setQrModalOpen(true);
  };

  // --- KEYBOARD HANDLER ---
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (stage !== 'TESTING') return;
      if (animatingState !== null) return;
      if (lightboxState) return;

      if (inboxOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (openMessageId) setOpenMessageId(null);
          else setInboxOpen(false);
        }
        return; // Important: Block other shortcuts if inbox is open
      }

      const currentStep = visibleSteps[currentIdx] as ExtendedTestStep | undefined;
      if (!currentStep) return;

      if (passSheetOpen) {
        if (e.key === 'Escape') { e.preventDefault(); handlePassSkip(currentStep); return; }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          if (passSheetIsDirty) { e.preventDefault(); handlePassSubmit(currentStep); }
          return;
        }
        return;
      }
      if (failPanelOpen) {
        if (e.key === 'Escape') { e.preventDefault(); setFailPanelOpen(false); return; }
        return;
      }

      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); handleSilentPass(currentStep); }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); openFailPanel(currentStep); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
      if (e.key === 'ArrowRight') {
        if (currentIdx !== liveIdx && currentIdx < liveIdx) { e.preventDefault(); goForward(); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, animatingState, passSheetOpen, failPanelOpen, lightboxState, passSheetIsDirty, currentIdx, liveIdx, runData, inboxOpen, openMessageId, visibleSteps]);

  const statusClass = (result: TestResult | undefined) => {
    if (!result) return '';
    if (result.status === 'Failed') return 'fail';
    if (result.status === 'Passed' && (result.notes || result.noteChips?.length)) return 'pass-note';
    if (result.status === 'Passed') return 'pass';
    return '';
  };

  const triggerConfetti = () => {
    setTimeout(() => {
      if (!confettiContainerRef.current) return;
      const colors = ['#7ab28a', '#e8a385', '#f0d4a1', '#d88a90', '#c4c0b4'];
      const waves = [{ count: 30, delay: 200 }, { count: 20, delay: 900 }, { count: 16, delay: 1700 }, { count: 12, delay: 2500 }];

      waves.forEach(w => {
        setTimeout(() => {
          for (let i = 0; i < w.count; i++) {
            const el = document.createElement('div');
            el.className = 'confetti fire';
            el.style.background = colors[Math.floor(Math.random() * colors.length)];
            el.style.left = Math.random() * 100 + '%';
            el.style.top = '-20px';
            el.style.width = 7 + Math.random() * 5 + 'px';
            el.style.height = 12 + Math.random() * 8 + 'px';
            el.style.animationDelay = Math.random() * 0.5 + 's';
            el.style.animationDuration = 3.5 + Math.random() * 2.5 + 's';
            confettiContainerRef.current?.appendChild(el);
            setTimeout(() => el.remove(), 7000);
          }
        }, w.delay);
      });
    }, 500);
  };

  // --- RENDER SHELL ---
  if (!isMounted) {
    return null;
  }

  const allStepsCompleted = runData && Object.keys(runData.results || {}).length >= visibleSteps.length;

  const renderMessageDetail = (messageId: string) => {
    const thread = threads.find(t => t.root.id === messageId);
    if (!thread) return null;
    const msg = thread.root;
    
    const jumpToStep = () => {
      if (msg.stepId == null || msg.stepIndex == null) return;

      // Close the inbox
      setInboxOpen(false);
      setOpenMessageId(null);

      // If jumping from the WELCOME screen, we need to officially "start" the session
      if (stage === 'WELCOME') {
        updateDoc(doc(db, 'testRuns', runId), { deviceInfo: { device, os, browser } }).catch(() => {});
        setSessionStartTime(Date.now());
        sessionStartRef.current = Date.now();
      }

      // Set the current index to the step we are jumping to
      setCurrentIdx(msg.stepIndex);
      
      // Force the stage into TESTING if it isn't already
      if (stage !== 'TESTING') {
        setStage('TESTING');
      }

      // Window scroll reset
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    };
    
    return (
      <div className="msg-detail">
        <div className="detail-head">
          <button className="detail-back" onClick={() => setOpenMessageId(null)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Inbox
          </button>
          <button className="inbox-close" onClick={() => setInboxOpen(false)} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
  
        <div className="detail-body">
  
          {msg.contextNote && (
            <div className="detail-context">
              <div className="detail-context-label">Your original note</div>
              {msg.contextStatus && (
                <div className="detail-context-step">
                  {msg.contextStatus}
                  {msg.contextChips && msg.contextChips.length > 0 && ` · ${msg.contextChips.join(', ')}`}
                </div>
              )}
              <div className="detail-context-note">&quot;{msg.contextNote}&quot;</div>
            </div>
          )}

          <div className="cm-thread" style={{ display: 'flex', flexDirection: 'column', width: '100%', paddingBottom: '16px' }}>
            <div className="msg-bubble from-pm">
              <div className="msg-bubble-meta">{msg.pmName} (PM) · {formatRelativeTime(msg.createdAt)}</div>
              <div className="msg-bubble-body">{msg.body}</div>
            </div>

            {thread.replies.map(reply => (
              <div key={reply.id} className={`msg-bubble ${reply.direction === 'tester_to_pm' ? 'from-tester' : 'from-pm'} ${reply.direction === 'pm_to_tester' && !reply.readByTester ? 'unread' : ''}`}>
                <div className="msg-bubble-meta">
                  {reply.direction === 'tester_to_pm' ? 'You' : `${reply.pmName} (PM)`} · {formatRelativeTime(reply.createdAt)}
                  {reply.direction === 'pm_to_tester' && !reply.readByTester && ' · new'}
                </div>
                <div className="msg-bubble-body">{reply.body}</div>
              </div>
            ))}
          </div>

          {msg.stepId != null && msg.stepIndex != null && (
            <button className="detail-jump-btn" onClick={jumpToStep}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              {stage === 'COMPLETE' || stage === 'RESULTS' || stage === 'WELCOME'
                ? `Jump to Step ${(msg.stepIndex ?? 0) + 1}`
                : `Jump to Step ${(msg.stepIndex ?? 0) + 1} to re-test`}
            </button>
          )}
  
          <div className="detail-reply-label">Your reply</div>
          <textarea
            className="detail-reply-textarea"
            placeholder={`Reply to ${msg.pmName.split(' ')[0]}...`}
            value={replyDraft}
            onChange={e => setReplyDraft(e.target.value)}
          />
        </div>
  
        <div className="detail-foot">
          <button className="detail-btn ghost" onClick={() => setOpenMessageId(null)}>Cancel</button>
          <button
            className="detail-btn primary"
            onClick={() => sendReply(msg)}
            disabled={!replyDraft.trim() || sendingReply}
          >
            {sendingReply ? 'Sending...' : 'Send reply'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div suppressHydrationWarning>
      <div className="tester-v2">
        <GlobalTesterStyles />

        {errorMsg ? (
          <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ textAlign: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color: '#a6421f', margin: '0 auto 16px', display: 'block'}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <h2 style={{fontWeight: 500, fontSize: '24px', margin: '0 0 8px'}}>{errorMsg}</h2>
              <p style={{ color: '#7a7a72' }}>Please check the URL or contact your PM.</p>
            </div>
          </div>
        ) : stage === 'LOADING' || !runData ? (
          <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7ab28a', fontFamily: 'system-ui, sans-serif', fontSize: '14px' }}>
            Loading test environment...
          </div>
        ) : (
          <>
            {/* WELCOME STAGE */}
            {stage === 'WELCOME' && (
              <div className="wrap">
                <div className="top-chip"><span className="brand-dot"></span> Proofdeck · Test Invitation</div>
                <div className="hero">
                  <h1 className="greeting">
                    {isResuming ? 'Welcome back, ' : 'Hey '}<em>{(runData.testerName || 'Tester').split(' ')[0]}</em>,<br/>
                    {isResuming ? 'ready to resume?' : 'ready to test?'}
                  </h1>
                  {isResuming ? (
                    <p className="hero-sub">You have {visibleSteps.length - currentIdx} steps remaining for <b>{runData.projectName}</b>. Let&apos;s pick up right where you left off.</p>
                  ) : (
                    <p className="hero-sub">You&apos;ve been invited to test <b>{runData.projectName}</b>. It&apos;s a short one — about {Math.ceil(visibleSteps.length * 1.5)} minutes of your time. Your feedback goes straight to the PM.</p>
                  )}
                </div>

                {threads.length > 0 && (
                  <div className="msg-banner">
                    <div className="msg-banner-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                      </svg>
                    </div>
                    <div className="msg-banner-content">
                      <h3 className="msg-banner-title">
                        Your PM has <em>{unreadThreads.length > 0 ? `${unreadThreads.length} question${unreadThreads.length > 1 ? 's' : ''}` : 'been in touch'}</em>
                      </h3>
                      <p className="msg-banner-sub">{bannerSubtext(threads, unreadThreads)}</p>
                    </div>
                    <button className="msg-banner-btn" onClick={() => { setInboxOpen(true); setOpenMessageId(null); }}>
                      Read
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                      </svg>
                    </button>
                  </div>
                )}

                <div className="journey">
                  <div className="journey-label">Your journey</div>
                  <div className="journey-stats">
                    <div className="j-stat"><div className="j-value">{visibleSteps.length} <em>steps</em></div><div className="j-label">To complete</div></div>
                    <div className="j-stat"><div className="j-value">~{Math.ceil(visibleSteps.length * 1.5)} <em>min</em></div><div className="j-label">Estimated time</div></div>
                    <div className="j-stat"><div className="j-value">{runData.testCycle || 'UAT'}</div><div className="j-label">Cycle</div></div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-label">
                    <span>{isResuming ? 'Your saved test environment' : 'Confirm your setup'}</span>
                    {!isResuming && autoDetected && <span className="detected-badge">Auto-detected</span>}
                  </div>
                  
                  {isResuming && (
                    <div style={{ fontSize: '13px', color: 'var(--ink-mute)', marginBottom: '20px', lineHeight: '1.45', background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <strong style={{color: 'var(--amber)', display: 'block', marginBottom: '4px'}}>Device locked</strong>
                      Testing on a phone but typing notes here? We've locked your device settings to the ones you started with so the PM gets accurate bug reports.
                    </div>
                  )}

                  <div className="field-stack">
                    {/* DEVICE: Free text (too many models to list) */}
                    <div className={`field ${device.trim() ? 'valid' : ''}`}>
                      <div className="field-input-wrap">
                        <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                        <input type="text" placeholder="Device (e.g. MacBook, iPhone 15)" value={device} onChange={e => setDevice(e.target.value)} disabled={isResuming} />
                        <svg className="field-confirm" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </div>
                    
                    {/* OS: Standardized Dropdown */}
                    <div className={`field ${os.trim() ? 'valid' : ''}`}>
                      <div className="field-input-wrap">
                        <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        <select value={os} onChange={e => setOs(e.target.value)} disabled={isResuming}>
                          <option value="" disabled>Select OS</option>
                          <option value="iOS">iOS</option>
                          <option value="Android">Android</option>
                          <option value="macOS">macOS</option>
                          <option value="Windows">Windows</option>
                          <option value="Linux">Linux</option>
                          <option value="Other">Other</option>
                        </select>
                        <svg className="field-confirm" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </div>

                    {/* BROWSER: Standardized Dropdown */}
                    <div className={`field ${browser.trim() ? 'valid' : ''}`}>
                      <div className="field-input-wrap">
                        <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                        <select value={browser} onChange={e => setBrowser(e.target.value)} disabled={isResuming}>
                          <option value="" disabled>Select Browser</option>
                          <option value="Safari">Safari</option>
                          <option value="Chrome">Chrome</option>
                          <option value="Firefox">Firefox</option>
                          <option value="Edge">Edge</option>
                          <option value="Arc">Arc</option>
                          <option value="Other">Other</option>
                        </select>
                        <svg className="field-confirm" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </div>
                  </div>
                  <button className={`start-btn ${isReadyToStart ? 'ready' : ''}`} onClick={handleStart} disabled={!isReadyToStart}>
                    {isResuming ? 'Resume testing' : 'Start testing'}
                    <svg className="arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </button>
                </div>
              </div>
            )}

            {/* TESTING STAGE */}
            {stage === 'TESTING' && (() => {
              const currentStep = visibleSteps[currentIdx] as ExtendedTestStep | undefined;
              const nextStep = visibleSteps[currentIdx + 1] as ExtendedTestStep | undefined;
              const stepsBehind = liveIdx - currentIdx;

              if (!currentStep) return null;

              const parsed = parseAction(currentStep.action || '');
              const hasObjective = !!currentStep.objective?.trim();
              const hasPreconditions = !!currentStep.preConditions?.trim();
              const hasContext = hasObjective || hasPreconditions;
              const prior = runData.results?.[currentStep.id];
              const imageUrls = (currentStep.mediaUrls || []).filter(u => !/\.pdf(?=\?|$)/i.test(u));
              const allMediaUrls = currentStep.mediaUrls || [];
              const refLinks = currentStep.referenceLinks || [];
              const totalAttachments = allMediaUrls.length + refLinks.length;

              return (
                <>
                  <header className="top-bar">
                    <div className="top-left">
                      <button className="nav-btn back-btn" onClick={goBack} disabled={currentIdx === 0} title="Go back (←)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                      </button>
                      <button className="nav-btn fwd-btn" onClick={goForward} disabled={currentIdx >= liveIdx} title="Go forward (→)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                      <span className="top-dot" />
                      <div className="top-info">
                        <div className="top-title">
                          {runData.projectName}
                          {runData.platform && <span className="tester-platform-badge">{runData.platform}</span>}
                        </div>
                        <div className={`top-sub ${isReviewing ? 'review' : ''}`}>
                          {isReviewing ? `Reviewing step ${currentIdx + 1} · ${runData.testCycle || 'UAT'}` : `Step ${currentIdx + 1} of ${visibleSteps.length} · ${runData.testCycle || 'UAT'}`}
                        </div>
                      </div>
                    </div>
                    <div className="time-chip">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <TimerChip cumulativeMs={cumulativeTimeMs} sessionStartTime={sessionStartTime} isRunning={stage === 'TESTING' && animatingState === null && !isReviewing} />
                    </div>
                  </header>

                  {threads.length > 0 && !toastMessage && (
                    <button
                      className={`msg-pill ${unreadThreads.length > 0 ? 'has-new' : ''}`}
                      onClick={() => { setInboxOpen(true); setOpenMessageId(null); }}
                      aria-label={`${unreadThreads.length} unread messages`}
                    >
                      <span className="msg-pill-icon">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                        </svg>
                      </span>
                      Messages
                      <span className="msg-pill-count">{unreadThreads.length || threads.length}</span>
                    </button>
                  )}

                  {toastMessage && (
                    <div
                      className="msg-toast show"
                      onClick={() => handleToastClick(toastMessage)}
                      role="alert"
                    >
                      <div className="msg-toast-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                        </svg>
                      </div>
                      <div className="msg-toast-content">
                        <div className="msg-toast-eyebrow">New message · {toastMessage.pmName} (PM)</div>
                        <p className="msg-toast-text">{toastMessage.body}</p>
                        <div className="msg-toast-cta">Tap to read</div>
                      </div>
                      <button
                        className="msg-toast-close"
                        onClick={(e) => { e.stopPropagation(); dismissToast(); }}
                        aria-label="Dismiss"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  )}

                  {isReviewing && allStepsCompleted && (
                    <button
                      className="detail-jump-btn"
                      onClick={() => setStage('COMPLETE')}
                      style={{
                        position: 'fixed',
                        top: 80,
                        left: 24,
                        zIndex: 10,
                        padding: '8px 14px',
                        background: 'var(--surface)',
                        borderColor: 'var(--line-strong)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Done reviewing — back to summary
                    </button>
                  )}

                  {stepsBehind > 1 && !allStepsCompleted && (
                    <div className="jump-pill show">
                      <span className="jump-pill-text">
                        You&apos;re reviewing step <strong>{currentIdx + 1}</strong> of {visibleSteps.length}. Jump back to step <strong>{liveIdx + 1}</strong> when ready.
                      </span>
                      <button className="jump-pill-btn" onClick={jumpToLive}>
                        Skip ahead
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      </button>
                    </div>
                  )}

                  <div className="progress-trail">
                    {visibleSteps.map((s, i) => {
                      const res = runData.results?.[s.id];
                      let cls = statusClass(res);
                      if (i === currentIdx && currentIdx !== liveIdx) cls += ' viewing';
                      else if (i === currentIdx && !res) cls += ' current';
                      return <div key={s.id} className={`trail-node ${cls}`} onClick={() => { if (i <= liveIdx) navigateTo(i); }}></div>;
                    })}
                  </div>

                  <main className={`stage ${hasContext ? '' : 'narrow'}`}>
                    <div className={`step-shell ${hasContext ? '' : 'no-context'}`}>
                      {hasContext && (
                        <aside className="context-panel">
                          {hasObjective && (
                            <div className="context-block">
                              <div className="context-label">Objective</div>
                              <div className="context-text italic">{currentStep.objective}</div>
                            </div>
                          )}
                          {hasPreconditions && (
                            <div className="context-block">
                              <div className="context-label amber">Pre-conditions</div>
                              <div className="context-text" style={{ whiteSpace: 'pre-line' }}>{currentStep.preConditions}</div>
                            </div>
                          )}
                        </aside>
                      )}

                      <div>
                        <div className={`step-card ${isReviewing ? 'reviewing' : ''} ${animatingState === 'pass' ? 'passing' : animatingState === 'fail' ? 'failing' : ''}`}>
                          
                          {currentStepThread && !currentStepThread.hasReply && !stepCalloutReplyOpen && (
                            <div className="step-msg-callout">
                              <div className="smc-avatar">{initialsOf(currentStepThread.root.pmName)}</div>
                              <div className="smc-body">
                                <div className="smc-eyebrow">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                                  </svg>
                                  {currentStepThread.root.pmName} asked about this step
                                </div>
                                <p className="smc-from">
                                  Got a <em>quick follow-up</em>.
                                </p>
                                <div className="smc-message">{currentStepThread.root.body}</div>
                                <div className="smc-reply-row">
                                  <button
                                    className="smc-reply-link primary"
                                    onClick={() => {
                                      setStepCalloutReplyOpen(true);
                                      markThreadRead(currentStepThread.root.id);
                                    }}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                      <path d="M3 10h18M3 14h18M3 18h10"/>
                                    </svg>
                                    Write a reply
                                  </button>
                                  <button
                                    className="smc-reply-link"
                                    onClick={() => {
                                      setInboxOpen(true);
                                      setOpenMessageId(currentStepThread.root.id);
                                      markThreadRead(currentStepThread.root.id);
                                    }}
                                  >
                                    Read full message
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {currentStepThread && stepCalloutReplyOpen && (
                            <div className="step-msg-callout">
                              <div className="smc-avatar">{initialsOf(currentStepThread.root.pmName)}</div>
                              <div className="smc-body">
                                <div className="smc-eyebrow">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                                  </svg>
                                  Reply to {currentStepThread.root.pmName}
                                </div>
                                <div className="smc-message">{currentStepThread.root.body}</div>
                                <div className="smc-reply-sheet">
                                  <textarea
                                    className="smc-textarea"
                                    placeholder="Type your reply..."
                                    value={replyDraft}
                                    onChange={e => setReplyDraft(e.target.value)}
                                    autoFocus
                                  />
                                  <div style={{display: 'flex', gap: 6, justifyContent: 'flex-end'}}>
                                    <button
                                      className="smc-reply-link"
                                      onClick={() => { setStepCalloutReplyOpen(false); setReplyDraft(''); }}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      className="smc-reply-link primary"
                                      onClick={() => sendReplyFromCallout(currentStepThread.root)}
                                      disabled={!replyDraft.trim() || sendingReply}
                                    >
                                      {sendingReply ? 'Sending...' : 'Send reply'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {currentStepThread && currentStepThread.hasReply && !stepCalloutReplyOpen && (
                            <div
                              className="step-msg-callout-collapsed"
                              onClick={() => {
                                setInboxOpen(true);
                                setOpenMessageId(currentStepThread.root.id);
                              }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{color: 'var(--accent)'}}>
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                              {currentStepThread.isRead ? `You replied to ${currentStepThread.root.pmName}` : `${currentStepThread.root.pmName} replied to you`}
                              <span style={{marginLeft: 'auto', fontSize: 11, color: 'var(--ink-mute)'}}>View →</span>
                            </div>
                          )}

                          {isReviewing && prior && (
                            <div className="review-banner">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                              <span><strong>You&apos;re reviewing a past step.</strong> Changes will overwrite your original result.</span>
                            </div>
                          )}

                          <div className="step-meta">
                            <span className="step-number">Step {String(currentIdx + 1).padStart(2, '0')}</span>
                            {currentStep.priority && (
                              <span className={`step-priority ${currentStep.priority.toLowerCase().includes('high') ? 'high' : ''}`}>{currentStep.priority}</span>
                            )}
                            {prior && (
                              <span className={`prior-status ${statusClass(prior)}`}>
                                {prior.status === 'Passed' && (prior.notes || prior.noteChips?.length) ? 'Passed · noted' : prior.status}
                              </span>
                            )}
                          </div>

                          {parsed.type === 'single' ? (
                            <h1 className="step-action">{parsed.text}</h1>
                          ) : (
                            <>
                              {parsed.intro && <p className="step-action-intro">{parsed.intro}</p>}
                              <ol className="step-action-list">
                                {parsed.items.map((item, i) => <li key={i}>{item}</li>)}
                              </ol>
                            </>
                          )}

                          <div className="step-expected-label">Expected result</div>
                          <p className="step-expected">{currentStep.expectedResult}</p>

                          {isReviewing && prior && (prior.notes || prior.noteChips?.length || prior.evidenceUrls?.length) && (
                            <div className="prior-result">
                              <div className="prior-result-label">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                                Your previous note
                              </div>
                              {prior.noteChips && prior.noteChips.length > 0 && (
                                <div className="prior-chips">
                                  {prior.noteChips.map(c => <span key={c} className="prior-chip">{c}</span>)}
                                </div>
                              )}
                              {prior.notes && <p className="prior-notes">{prior.notes}</p>}
                              {prior.evidenceUrls && prior.evidenceUrls.length > 0 && (
                                <div className="prior-evidence">
                                  {prior.evidenceUrls.map((url, i) => (
                                    <div key={i} className="prior-thumb" onClick={() => setLightboxState({ urls: prior.evidenceUrls!, startIdx: i })}>
                                      <img src={url} alt="" />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {totalAttachments > 0 && (
                            <div className="attachments-block">
                              <div className="attachments-label">Reference <span className="count">{totalAttachments}</span></div>
                              <div className="attachment-row">
                                {allMediaUrls.map((url, i) => {
                                  const mediaType = getMediaType(url);
                                  return (
                                    <div
                                      key={`m-${i}`}
                                      className={`attachment ${mediaType}`}
                                      onClick={() => {
                                        if (mediaType === 'pdf') {
                                          window.open(url, '_blank');
                                        } else if (mediaType === 'image') {
                                          const imgIdx = imageUrls.indexOf(url);
                                          if (imgIdx >= 0) setLightboxState({ urls: imageUrls, startIdx: imgIdx });
                                        } else {
                                          setLightboxState({ urls: [url], startIdx: 0 });
                                        }
                                      }}
                                    >
                                      {mediaType === 'image' ? (
                                        <img src={url} alt="" />
                                      ) : mediaType === 'video' ? (
                                        <div style={{ width: '100%', height: '100%', background: '#1a2420' }} />
                                      ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1d2420' }}>
                                          <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: '0.12em' }}>PDF</span>
                                        </div>
                                      )}
                                      <div className="expand-ico">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                          <polyline points="15 3 21 3 21 9"/>
                                          <polyline points="9 21 3 21 3 15"/>
                                          <line x1="21" y1="3" x2="14" y2="10"/>
                                          <line x1="3" y1="21" x2="10" y2="14"/>
                                        </svg>
                                      </div>
                                      <span className="type-tag">{mediaType === 'image' ? 'IMG' : mediaType === 'video' ? 'VID' : 'PDF'}</span>
                                    </div>
                                  );
                                })}
                                {refLinks.map((url, i) => (
                                  <div key={`l-${i}`} className="attachment link" onClick={() => window.open(url, '_blank')}>
                                    <div className="link-ico">URL</div>
                                    <div className="link-info">
                                      <div className="link-title">{url.split('://')[1]?.substring(0, 20) || url.substring(0, 20)}</div>
                                      <div className="link-host">External link</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {nextStep && !isReviewing && (
                          <div className="peek-card">
                            <div className="peek-step-num">Step {String(currentIdx + 2).padStart(2, '0')}</div>
                            <p className="peek-action">
                              {(() => {
                                const nextParsed = parseAction(nextStep.action);
                                if (nextParsed.type === 'single') return nextParsed.text;
                                return nextParsed.intro || nextParsed.items.join(' · ');
                              })()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </main>

                  <div className="action-bar" style={{ opacity: failPanelOpen || passSheetOpen ? 0 : 1, pointerEvents: failPanelOpen || passSheetOpen ? 'none' : 'auto' }}>
                    <div className="action-row">
                      {isReviewing && prior ? (
                        <>
                          <button className={`abtn btn-fail ${prior.status === 'Failed' ? 'prior-fail' : ''}`} onClick={() => openFailPanel(currentStep)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            {prior.status === 'Failed' ? 'Keep as Fail · edit' : 'Change to Fail'}
                          </button>
                          <button className={`abtn btn-pass ${prior.status === 'Passed' ? 'prior-pass' : ''}`} onClick={() => handlePassWithSheet(currentStep)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            {prior.status === 'Passed' ? 'Keep as Pass · edit' : 'Change to Pass'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="abtn btn-fail" onClick={() => openFailPanel(currentStep)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            Fail
                          </button>
                          <button className="abtn btn-pass" onClick={() => handlePassWithSheet(currentStep)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Pass
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="kbd-shortcut-hint" style={{ opacity: passSheetOpen || failPanelOpen || lightboxState ? 0 : 0.7 }}>
                    <kbd>P</kbd> pass · <kbd>F</kbd> fail · <kbd>←</kbd> back · <kbd>→</kbd> forward
                  </div>

                  {/* OVERLAYS & SHEETS */}
                  <div className={`sheet-overlay ${passSheetOpen || failPanelOpen ? 'show' : ''}`} onClick={() => { setPassSheetOpen(false); setFailPanelOpen(false); }} />
                  
                  {/* PASS SHEET */}
                  <div className={`pass-sheet ${passSheetOpen ? 'open' : ''}`}>
                    <div className="pass-sheet-inner">
                      <div className="sheet-handle" />
                      <div className="pass-eyebrow">{isReviewing ? (prior?.status === 'Passed' ? 'Passed · editing' : 'Changing to Pass') : 'Passed'}</div>
                      <h2 className="pass-title">Anything to <em>flag</em>?</h2>
                      <p className="pass-sub">Optional — tap Skip to move on.</p>

                      <div className="pass-field-label">Quick flags</div>
                      <div className="pass-chips">
                        {['Felt slow', 'Minor UI issue', 'Saw a warning', 'Copy looks off', 'Something else'].map(chip => (
                          <button key={chip} className={`pass-chip ${passChips.includes(chip) ? 'selected' : ''}`} onClick={() => setPassChips(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip])}>
                            {chip}
                          </button>
                        ))}
                      </div>

                      {/* LIVE EVIDENCE IN PASS SHEET */}
                      {renderLiveEvidence(passMediaUrls)}

                      <textarea className="pass-notes" placeholder="Or write a quick note — short and sweet is fine" value={passNotes} onChange={e => setPassNotes(e.target.value)} />

                      <div className="pass-attach-row">
                        <label className={`pass-attach-btn ${passMediaUrls.length ? 'done' : ''}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          {isUploadingMedia ? 'Uploading...' : 'Screenshot / Video'}
                          <input type="file" accept="image/*,video/*" hidden multiple onChange={(e) => handleFileUpload(e, 'pass')} />
                        </label>
                        <button className="pass-attach-btn" onClick={() => openQrScanner('pass')}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                          From phone
                        </button>
                      </div>

                      <div className="pass-action-area">
                        <button className="pass-skip-btn" onClick={() => handlePassSkip(currentStep)}>
                          {isReviewing ? 'Keep as is' : 'Skip and continue'}
                          <span className="kbd">Esc</span>
                        </button>
                        <button className={`pass-submit-btn ${passSheetIsDirty ? 'visible' : ''}`} onClick={() => handlePassSubmit(currentStep)} disabled={!passSheetIsDirty}>
                          {isReviewing ? 'Save changes' : 'Add note'}
                          <span className="arrow">→</span>
                          <span className="kbd">⏎</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* FAIL PANEL */}
                  <div className={`fail-panel ${failPanelOpen ? 'open' : ''}`}>
                    <div className="fail-inner">
                      <div className="sheet-handle"></div>
                      <div className="fail-eyebrow">Failing</div>
                      <h2 className="fail-title">What went wrong?</h2>
                      <p className="fail-sub">Your feedback helps the team fix it fast.</p>

                      <div className="pass-field-label">Common reasons</div>
                      <div className="pass-chips">
                        {['Didn\'t load', 'Looks different', 'Broken/error', 'Slow', 'Unclear', 'Something else'].map(reason => (
                          <button key={reason} className={`pass-chip ${failChips.includes(reason) ? 'selected' : ''}`} onClick={() => setFailChips(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason])}>
                            {reason}
                          </button>
                        ))}
                      </div>

                      {/* LIVE EVIDENCE IN FAIL PANEL */}
                      {renderLiveEvidence(failMediaUrls)}

                      <div className="pass-field-label">Describe it</div>
                      <textarea className="pass-notes" placeholder="What did you expect? What happened instead?" value={failNotes} onChange={e => setFailNotes(e.target.value)}></textarea>

                      <div className="pass-attach-row">
                        <label className={`pass-attach-btn ${failMediaUrls.length ? 'done' : ''}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          {isUploadingMedia ? 'Uploading...' : 'Screenshot / Video'}
                          <input type="file" accept="image/*,video/*" hidden multiple onChange={(e) => handleFileUpload(e, 'fail')} />
                        </label>
                        <button className="pass-attach-btn" onClick={() => openQrScanner('fail')}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                          From phone
                        </button>
                      </div>

                      <div className="pass-action-area">
                        <button className="fail-submit-btn" onClick={() => handleFailSubmit(currentStep)}>Submit &amp; continue</button>
                        <button className="fail-cancel-btn" onClick={() => setFailPanelOpen(false)}>Cancel</button>
                      </div>
                    </div>
                  </div>

                  <div className={`flash-overlay ${flashConfig.show ? 'show' : ''}`}>
                    <div className="flash-content">
                      {flashConfig.type === 'pass' && (
                        <>
                          <div className="flash-tick"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                          <p className="flash-word">Nice.</p>
                          <div className="flash-sub">{flashConfig.sub || `Step ${String(currentIdx+1).padStart(2,'0')} passed`}</div>
                        </>
                      )}
                      {flashConfig.type === 'quiet' && (
                        <>
                          <div className="flash-tick quiet"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                          <div className="flash-sub" style={{marginTop: '16px', letterSpacing: '0.12em'}}>{flashConfig.sub || 'Changes saved'}</div>
                        </>
                      )}
                      {flashConfig.type === 'fail' && (
                        <>
                          <div className="flash-tick fail"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
                          <div className="flash-sub" style={{color: 'var(--rose)'}}>{flashConfig.sub || `Step ${String(currentIdx+1).padStart(2,'0')} failed`}</div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className={`qr-full ${qrModalOpen ? 'show' : ''}`} onClick={(e) => { if(e.target === e.currentTarget) setQrModalOpen(false); }}>
                    <div className="qr-full-card">
                      <div className="qr-full-eyebrow">Step {currentIdx + 1 < 10 ? '0'+(currentIdx+1) : currentIdx+1} · Evidence Upload</div>
                      <h3 className="qr-full-title">Scan to upload from phone</h3>
                      <div className="qr-full-img" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        {uploadUrl ? <QRCodeSVG value={uploadUrl} size={220} /> : <div className="qr-full-pattern"></div>}
                        <div className="qr-corner tl"></div><div className="qr-corner tr"></div><div className="qr-corner bl"></div>
                      </div>
                      <div className="qr-instructions">
                        <div className="qr-step-item"><div className="qr-step-num">1</div><div>Open your phone&apos;s camera and point it at the code</div></div>
                        <div className="qr-step-item"><div className="qr-step-num">2</div><div>Tap the notification to open the upload page</div></div>
                        <div className="qr-step-item"><div className="qr-step-num">3</div><div>Take photos or videos — they attach here automatically</div></div>
                      </div>
                      <div className="qr-waiting">Waiting for device...</div>
                      <button className="qr-close-btn" onClick={() => setQrModalOpen(false)}>Cancel</button>
                    </div>
                  </div>

                  {lightboxState && (
                    <Lightbox urls={lightboxState.urls} startIdx={lightboxState.startIdx} onClose={() => setLightboxState(null)} />
                  )}
                </>
              );
            })()}

            {/* COMPLETE STAGE */}
            {stage === 'COMPLETE' && (() => {
              const passedCount = visibleSteps.filter(s => runData.results?.[s.id]?.status === 'Passed').length;
              const failedCount = visibleSteps.filter(s => runData.results?.[s.id]?.status === 'Failed').length;
              const totalStepsCount = visibleSteps.length;
              const passPct = totalStepsCount > 0 ? (passedCount / totalStepsCount) * 100 : 0;
              const failPct = totalStepsCount > 0 ? (failedCount / totalStepsCount) * 100 : 0;
              const secTotal = Math.floor(cumulativeTimeMs / 1000);
              const finalMin = Math.floor(secTotal / 60);
              const finalSec = String(secTotal % 60).padStart(2, '0');

              let pct = 25;
              if (secTotal < 120) pct = 95;
              else if (secTotal < 180) pct = 88;
              else if (secTotal < 240) pct = 82;
              else if (secTotal < 360) pct = 65;
              else if (secTotal < 600) pct = 45;

              return (
                <>
                  <div className="wrap">
                    <div className="top-chip">
                      <span className="check-dot">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                      Test run complete
                    </div>

                    <div className="medal-wrap">
                      <div className="medal">
                        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </div>

                    <div className="hero">
                      <h1 className="hero-title">Thank you, <em>{(runData.testerName || 'Tester').split(' ')[0]}</em>.</h1>
                      <p className="hero-sub">You&apos;ve tested <b>{runData.projectName}</b> end to end. Your results are on their way to the PM right now.</p>
                    </div>

                    {threads.length > 0 && (
                      <div className="msg-banner complete-variant">
                        <div className="msg-banner-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                          </svg>
                        </div>
                        <div className="msg-banner-content">
                          <h3 className="msg-banner-title">
                            Your PM has <em>{unreadThreads.length > 0 ? `${unreadThreads.length} question${unreadThreads.length > 1 ? 's' : ''}` : 'been in touch'}</em>
                          </h3>
                          <p className="msg-banner-sub">{bannerSubtext(threads, unreadThreads)}</p>
                        </div>
                        <button className="msg-banner-btn" onClick={() => { setInboxOpen(true); setOpenMessageId(null); }}>
                          Read
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                          </svg>
                        </button>
                      </div>
                    )}

                    <div className="big-stats">
                      <div className="big-stat">
                        <div className="bs-value"><em>{totalStepsCount}</em></div>
                        <div className="bs-label">Steps tested</div>
                      </div>
                      <div className="stat-divider"></div>
                      <div className="big-stat">
                        <div className="bs-value">{finalMin}:{finalSec}</div>
                        <div className="bs-label">Time taken</div>
                      </div>
                    </div>

                    <div className="percentile">
                      <div className="pct-badge">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="13 2 13 13 21 13"/><path d="M13 2A10 10 0 103 12"/></svg>
                      </div>
                      <div className="pct-text">
                        <h3 className="pct-headline">Faster than <em>{pct}%</em> of testers</h3>
                        <p className="pct-sub">On projects this size · {runData.testCycle || 'UAT'} cycles</p>
                      </div>
                    </div>

                    <div className="results">
                      <div className="results-label">Your results</div>
                      <div className="results-bar">
                        <div className="seg pass" style={{flex: passPct}}></div>
                        <div className="seg fail" style={{flex: failPct}}></div>
                      </div>
                      <div className="results-legend">
                        <span className="legend-item"><span className="legend-dot pass"></span> {passedCount} passed</span>
                        {failedCount > 0 && <span className="legend-item"><span className="legend-dot fail"></span> {failedCount} needs attention</span>}
                      </div>
                    </div>

                    <div className="c-actions">
                      <button className="c-btn c-btn-primary" onClick={() => setStage('RESULTS')}>
                        View my results
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      </button>
                      <button className="c-btn c-btn-secondary" onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        alert("Link copied!");
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/></svg>
                        Copy a link to this run
                      </button>
                    </div>

                    <div className="thank-you">
                      Built with <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> for testers by QA Triage
                    </div>
                  </div>
                  <div className="confetti-layer" id="confetti-root" ref={confettiContainerRef}></div>
                </>
              );
            })()}

            {/* RESULTS STAGE */}
            {stage === 'RESULTS' && (
              <div style={{ paddingBottom: '80px', position: 'relative', zIndex: 2 }}>
                <div className="results-hero">
                  <h1 className="results-hero-title">Test <em>Report</em></h1>
                  <div className="results-hero-sub">{runData.projectName} · {runData.testCycle || 'UAT'}</div>
                </div>

                <div className="timeline">
                  {visibleSteps.map((step, index) => {
                    const res = runData.results?.[step.id];
                    const isPass = res?.status === 'Passed';
                    const isFail = res?.status === 'Failed';

                    return (
                      <div key={step.id} className={`timeline-card ${isPass ? 't-pass' : isFail ? 't-fail' : ''}`} style={{ animationDelay: `${index * 0.1}s` }}>
                        <div className="timeline-meta">
                          <span className="t-step-num">Step {index + 1 < 10 ? '0'+(index+1) : index+1}</span>
                          {isPass && <span className="t-status pass"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Passed</span>}
                          {isFail && <span className="t-status fail"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Failed</span>}
                        </div>

                        <h3 className="timeline-action">{step.action}</h3>
                        <p className="timeline-expected">{step.expectedResult}</p>

                        {isFail && res && (res.notes || (res.evidenceUrls && res.evidenceUrls.length > 0)) && (
                          <div className="timeline-notes">
                            {res.notes && (
                              <>
                                <div className="t-notes-label">Tester Notes</div>
                                <div className="t-notes-text">{res.notes}</div>
                              </>
                            )}

                            {res.evidenceUrls && res.evidenceUrls.length > 0 && (
                              <div className="t-evidence-row">
                                {res.evidenceUrls.map((url, i) => (
                                  <div key={i} onClick={() => window.open(url, '_blank')}>
                                    {getMediaType(url) === 'video' ? (
                                      <div className="t-evidence-vid"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
                                    ) : (
                                      <div className="t-evidence-item" style={{ backgroundImage: `url(${url})` }}></div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <button className="c-btn c-btn-secondary" style={{ display: 'inline-flex', margin: '0 auto' }} onClick={() => setStage('COMPLETE')}>
                    ← Back to summary
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* INBOX OVERLAYS (RENDERED AT ROOT) */}
        {inboxOpen && (
          <>
            <div className="msg-inbox-overlay" onClick={() => { setInboxOpen(false); setOpenMessageId(null); }} />
            {!openMessageId ? (
              <div className="msg-inbox">
                <div className="inbox-head">
                  <h3 className="inbox-title">
                    Messages{threads.length > 0 ? ` from ${threads[0].root.pmName}` : ''}
                  </h3>
                  <button className="inbox-close" onClick={() => setInboxOpen(false)} aria-label="Close">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>

                <div className="inbox-list">
                  {threads.length === 0 ? (
                    <div className="inbox-empty">No messages yet.</div>
                  ) : (
                    threads.map(thread => {
                      const latestMsg = thread.replies.length > 0 ? thread.replies[thread.replies.length - 1] : thread.root;
                      return (
                        <div
                          key={thread.root.id}
                          className={`inbox-item ${!thread.isRead ? 'unread' : ''}`}
                          onClick={() => {
                            setOpenMessageId(thread.root.id);
                            markThreadRead(thread.root.id);
                          }}
                        >
                          <div className="inbox-avatar">{initialsOf(thread.root.pmName)}</div>
                          <div className="inbox-body">
                            <div className="inbox-meta">
                              <span className="inbox-from">{thread.root.pmName} (PM)</span>
                              <span className={`inbox-step ${thread.root.stepId ? '' : 'general'}`}>
                                {thread.root.stepId ? `Step ${(thread.root.stepIndex ?? 0) + 1}` : 'General'}
                              </span>
                            </div>
                            <div className="inbox-preview">{latestMsg.body}</div>
                          </div>
                          <div className="inbox-right">
                            <span className="inbox-time">{formatRelativeTime(latestMsg.createdAt)}</span>
                            {!thread.isRead ? (
                              <span className="inbox-unread-dot"></span>
                            ) : thread.hasReply ? (
                              <span className="inbox-replied-tag">replied</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="inbox-foot">
                  {threads.length} message{threads.length === 1 ? '' : 's'}
                </div>
              </div>
            ) : (
              renderMessageDetail(openMessageId)
            )}
          </>
        )}
      </div>
    </div>
  );
}
