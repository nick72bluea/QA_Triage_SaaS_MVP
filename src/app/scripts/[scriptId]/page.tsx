"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, addDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

// --- Local Types ---
interface ScriptStep {
  id: string;
  action: string;
  expectedResult: string;
  priority?: string;
  area?: string;
  frameId?: string;
}

type AIState = 'idle' | 'reading-designs' | 'streaming' | 'review' | 'error';

// --- Bulk Paste Parser Helpers ---
function parseBulkText(text: string): ScriptStep[] {
  if (!text.trim()) return [];
  if (text.includes('\t')) {
    return text.split('\n').filter(l => l.trim()).map(line => {
      const cols = line.split('\t').map(c => c.trim());
      return { id: crypto.randomUUID(), action: cols[0] || '', expectedResult: cols[1] || '', priority: 'Medium' };
    }).filter(s => s.action);
  }
  const lines = text.split('\n');
  const steps: ScriptStep[] = [];
  let current: ScriptStep | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^\d+[.)\-]\s*(.+)/);
    if (match) {
      if (current) steps.push(current);
      current = { id: crypto.randomUUID(), action: match[1], expectedResult: '', priority: 'Medium' };
    } else if (current) {
      const expectedMatch = trimmed.match(/^(?:Expected|Expects?):\s*(.+)/i);
      if (expectedMatch) current.expectedResult = expectedMatch[1];
      else current.action += ' ' + trimmed;
    } else {
      steps.push({ id: crypto.randomUUID(), action: trimmed, expectedResult: '', priority: 'Medium' });
    }
  }
  if (current) steps.push(current);
  return steps;
}

export default function ScriptBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const { currentAccountId } = useAuth();
  const routeId = params.scriptId as string;
  
  const [isMounted, setIsMounted] = useState(false);
  const [currentId, setCurrentId] = useState<string>(routeId);
  const [saveStatus, setSaveStatus] = useState<'Saved' | 'Saving...' | 'Unsaved'>('Saved');
  const [isInitialLoad, setIsInitialLoad] = useState(routeId !== 'new');

  // Script State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<ScriptStep[]>([]);

  // Modal States
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Figma States
  const [figmaConnected, setFigmaConnected] = useState<boolean>(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState('');
  const [isFetchingFigma, setIsFetchingFigma] = useState(false);
  const [figmaFrames, setFigmaFrames] = useState<any[]>([]);
  const [figmaFileName, setFigmaFileName] = useState('');
  const [selectedFrames, setSelectedFrames] = useState<string[]>([]);

  // AI Streaming States
  const [aiState, setAiState] = useState<AIState>('idle');
  const [aiSteps, setAiSteps] = useState<ScriptStep[]>([]);
  const [aiError, setAiError] = useState('');
  const [refiningStepId, setRefiningStepId] = useState<string | null>(null);
  const [refineText, setRefineText] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Set mounted
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Fetch Existing Script
  useEffect(() => {
    if (routeId === 'new') {
      setIsInitialLoad(false);
      return;
    }
    if (!currentAccountId) return;
    const fetchScript = async () => {
      try {
        const docRef = doc(db, `accounts/${currentAccountId}/scripts`, routeId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || '');
          setDescription(data.description || '');
          setSteps(data.steps || []);
        }
      } catch (e) { console.error(e); }
      finally { setIsInitialLoad(false); }
    };
    fetchScript();
  }, [routeId, currentAccountId]);

  // 2. Listen to Figma Connection Status (account-scoped)
  useEffect(() => {
    if (!currentAccountId) return;
    const unsub = onSnapshot(doc(db, `accounts/${currentAccountId}/integrations/figma`), (docSnap) => {
      setFigmaConnected(docSnap.exists() && docSnap.data().status === 'active');
    });
    return () => unsub();
  }, [currentAccountId]);

  // 3. Debounced Auto-Save
  useEffect(() => {
    if (isInitialLoad) return;
    if (!currentAccountId) return;
    if (currentId === 'new' && !name && !description && steps.length === 0) return;

    setSaveStatus('Unsaved');
    const timer = setTimeout(async () => {
      setSaveStatus('Saving...');
      const payload = { name: name || 'Untitled Script', description, steps, stepCount: steps.length, status: 'active', accountId: currentAccountId, updatedAt: serverTimestamp() };
      try {
        if (currentId === 'new') {
          const docRef = await addDoc(collection(db, `accounts/${currentAccountId}/scripts`), { ...payload, createdAt: serverTimestamp(), tags: [], regressionRuns: [] });
          setCurrentId(docRef.id);
          window.history.replaceState(null, '', `/scripts/${docRef.id}`);
        } else {
          await updateDoc(doc(db, `accounts/${currentAccountId}/scripts`, currentId), payload);
        }
        setSaveStatus('Saved');
      } catch (e) { setSaveStatus('Unsaved'); }
    }, 1200);
    return () => clearTimeout(timer);
  }, [name, description, steps, currentId, isInitialLoad, currentAccountId]);

  // --- Handlers ---
  const updateStep = (id: string, patch: Partial<ScriptStep>) => setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));
  const addManualStep = () => setSteps(prev => [...prev, { id: crypto.randomUUID(), action: '', expectedResult: '', priority: 'Medium' }]);
  
  const handleBulkPaste = () => {
    const parsed = parseBulkText(bulkText);
    if (parsed.length > 0) setSteps(prev => [...prev, ...parsed]);
    setBulkText(''); setIsBulkOpen(false);
  };

  const handleFetchFrames = async () => {
    if (!figmaUrl.trim()) return;
    setIsFetchingFigma(true);
    try {
      const res = await fetch('/api/figma/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileUrl: figmaUrl }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFigmaFrames(data.frames); setFigmaFileName(data.fileName); setSelectedFrames([]);
    } catch (e: any) { alert(e.message); } 
    finally { setIsFetchingFigma(false); }
  };

  const toggleFrame = (id: string) => {
    setSelectedFrames(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const handleAIForkClick = () => {
    if (!figmaConnected) {
      window.location.href = '/api/figma/auth';
    } else {
      setIsAIOpen(true);
    }
  };

  // --- AI GENERATION STREAMING ---
  const startAIGeneration = async () => {
    setIsAIOpen(false); // Close Figma modal
    setAiState('reading-designs');
    setAiSteps([]);
    setAiError('');

    abortControllerRef.current = new AbortController();
    const targetFrames = figmaFrames.filter(f => selectedFrames.includes(f.id));

    try {
      const res = await fetch('/api/ai/generate-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: targetFrames, scriptName: name, description }),
        signal: abortControllerRef.current.signal
      });

      if (!res.body) throw new Error('No stream returned');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const events = chunk.split('\n\n').filter(Boolean);
        
        for (const ev of events) {
          const lines = ev.split('\n');
          const eventType = lines.find(l => l.startsWith('event:'))?.replace('event: ', '');
          const eventData = lines.find(l => l.startsWith('data:'))?.replace('data: ', '');
          
          if (!eventType || !eventData) continue;

          if (eventType === 'status') {
            setAiState(eventData as AIState);
          } else if (eventType === 'step') {
            const step = JSON.parse(eventData);
            setAiSteps(prev => [...prev, step]);
          } else if (eventType === 'error') {
            throw new Error(eventData);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAiState('error');
        setAiError(err.message);
      }
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setAiState('review'); // Move to review with whatever we have so far
  };

  // --- AI REVIEW ACTIONS ---
  const acceptStep = (step: ScriptStep) => {
    setSteps(prev => [...prev, step]);
    setAiSteps(prev => prev.filter(s => s.id !== step.id));
    if (aiSteps.length === 1) setAiState('idle'); // Close if last one
  };

  const dismissStep = (id: string) => {
    setAiSteps(prev => prev.filter(s => s.id !== id));
    if (aiSteps.length === 1) setAiState('idle');
  };

  const handleRefine = async (step: ScriptStep) => {
    if (!refineText.trim()) return;
    try {
      setRefiningStepId(step.id);
      const res = await fetch('/api/ai/refine-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, instruction: refineText })
      });
      const data = await res.json();
      setAiSteps(prev => prev.map(s => s.id === step.id ? data.step : s));
      setRefiningStepId(null);
      setRefineText('');
    } catch (e) { alert("Refinement failed"); setRefiningStepId(null); }
  };

  const acceptAll = () => {
    setSteps(prev => [...prev, ...aiSteps]);
    setAiSteps([]);
    setAiState('idle');
  };

  return (
    <div suppressHydrationWarning style={{ minHeight: '100vh', background: '#f4f3ef' }}>
      {isMounted && (
        <div className="builder-container">
          <style dangerouslySetInnerHTML={{__html: `
            @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
            
            :root {
              --bg: #f4f3ef; --surface: #ffffff; --surface-alt: #fafaf7;
              --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f;
              --line: #e5e2db; --line-strong: #d4d0c7;
              --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329;
              --fail: #a6421f; --info: #3d5a80;
            }

            .builder-container * { box-sizing: border-box; }
            .builder-container { min-height: 100vh; background: var(--bg); font-family: 'IBM Plex Sans', system-ui, sans-serif; color: var(--ink); }

            /* HEADER */
            .builder-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 10; }
            .head-left { display: flex; align-items: center; gap: 16px; }
            .back-btn { width: 32px; height: 32px; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); transition: all 0.15s; }
            .back-btn:hover { background: var(--surface-alt); color: var(--ink); border-color: var(--line-strong); }
            .breadcrumb { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); display: flex; align-items: center; gap: 8px; }
            .breadcrumb span { color: var(--ink-soft); font-weight: 500; }
            
            .head-right { display: flex; align-items: center; gap: 16px; }
            .save-status { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 6px; }
            .save-status .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
            .save-status.saved .dot { background: #4a7c59; }
            .save-status.saving .dot { background: #b8860b; animation: pulse 1s infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

            /* MAIN CANVAS */
            .builder-main { max-width: 800px; margin: 0 auto; padding: 40px 24px 100px; }
            .title-input { width: 100%; font-family: 'Fraunces', serif; font-size: 38px; font-weight: 600; border: none; background: transparent; outline: none; color: var(--ink); margin-bottom: 12px; letter-spacing: -0.01em; }
            .title-input::placeholder { color: var(--ink-mute); opacity: 0.5; }
            .desc-input { width: 100%; font-family: inherit; font-size: 15px; border: none; background: transparent; outline: none; color: var(--ink-soft); margin-bottom: 40px; resize: none; line-height: 1.5; }
            .desc-input::placeholder { color: var(--ink-mute); opacity: 0.5; }

            /* STEPS */
            .steps-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
            .step-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: grid; grid-template-columns: 24px 1fr auto; gap: 14px; align-items: flex-start; transition: border-color 0.15s; }
            .step-card:focus-within { border-color: var(--accent); box-shadow: 0 4px 12px rgba(45,74,62,0.06); }
            .step-num { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: var(--ink-mute); background: var(--surface-alt); border: 1px solid var(--line); border-radius: 4px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; margin-top: 2px; }
            .step-inputs { display: flex; flex-direction: column; gap: 8px; }
            .step-act-input { width: 100%; font-family: inherit; font-size: 14px; font-weight: 500; border: none; background: transparent; outline: none; color: var(--ink); padding: 4px 0; }
            .step-act-input::placeholder { color: var(--ink-mute); font-weight: 400; }
            .step-exp-input { width: 100%; font-family: inherit; font-size: 13px; border: none; background: transparent; outline: none; color: var(--ink-soft); resize: none; padding: 0; line-height: 1.5; }
            .step-exp-input::placeholder { color: var(--ink-mute); }
            
            .step-actions { display: flex; align-items: center; gap: 8px; opacity: 0.4; transition: opacity 0.15s; }
            .step-card:hover .step-actions, .step-card:focus-within .step-actions { opacity: 1; }
            .s-btn { width: 28px; height: 28px; border: 1px solid var(--line); background: var(--surface); border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); transition: all 0.1s; }
            .s-btn:hover { background: var(--surface-alt); color: var(--ink); }
            .s-btn.danger:hover { background: var(--fail); color: #fff; border-color: var(--fail); }

            /* THE EMPTY FORK */
            .fork-section { border-top: 1px dashed var(--line-strong); padding-top: 32px; }
            .fork-title { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); font-weight: 600; margin-bottom: 16px; text-align: center; }
            .fork-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
            .fork-card { background: var(--surface-alt); border: 1px dashed var(--line-strong); border-radius: 10px; padding: 24px 16px; text-align: center; cursor: pointer; transition: all 0.15s ease; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
            .fork-card:hover { border-color: var(--accent); border-style: solid; background: var(--accent-soft); color: var(--accent); }
            .fork-icon { width: 40px; height: 40px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); margin-bottom: 12px; }
            .fork-card:hover .fork-icon { color: var(--accent); border-color: rgba(45,74,62,0.2); }
            .fork-name { font-weight: 500; font-size: 13.5px; margin-bottom: 4px; color: var(--ink); transition: color 0.15s; }
            .fork-desc { font-size: 11.5px; color: var(--ink-mute); line-height: 1.4; transition: color 0.15s; }
            
            .fork-card.connect-mode { background: var(--surface); border-style: solid; }
            .fork-card.connect-mode .fork-icon { background: #000; color: #fff; border: none; }
            .fork-card.connect-mode:hover { background: #000; border-color: #000; }
            .fork-card.connect-mode:hover .fork-name, .fork-card.connect-mode:hover .fork-desc { color: #fff; }
            .ai-badge { position: absolute; top: -10px; background: var(--surface); border: 1px solid var(--line-strong); padding: 4px 10px; border-radius: 999px; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }

            /* AI STREAMING & REVIEW PANEL */
            .ai-panel { background: var(--surface); border: 1px solid rgba(45,74,62,0.3); border-radius: 12px; padding: 24px; margin-bottom: 32px; box-shadow: 0 12px 32px rgba(45,74,62,0.06); animation: slideIn 0.3s cubic-bezier(.4,0,.2,1); position: relative; overflow: hidden; }
            .ai-panel::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #1d3329, #4a7c59, #1d3329); background-size: 200% 100%; animation: gradientMove 2s linear infinite; }
            @keyframes slideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes gradientMove { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
            
            .ai-panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .ai-status-pulse { display: flex; align-items: center; gap: 10px; font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; color: var(--ink); }
            .ai-status-pulse svg { color: var(--accent); animation: pulse 1.5s infinite; }
            
            .ai-step-list { display: flex; flex-direction: column; gap: 10px; }
            .ai-step-row { background: var(--surface-alt); border: 1px solid var(--line); border-radius: 8px; padding: 14px; display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; animation: fadeIn 0.3s ease; }
            .ai-step-row-num { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--ink-mute); font-weight: 600; padding: 3px 6px; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; }
            .ai-step-row-action { font-size: 13.5px; font-weight: 500; color: var(--ink); margin-bottom: 2px; }
            .ai-step-row-expect { font-size: 12px; color: var(--ink-soft); }
            .ai-step-row-meta { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 6px; }
            
            .ai-step-row-actions { display: flex; gap: 6px; opacity: 0.6; transition: opacity 0.15s; }
            .ai-step-row:hover .ai-step-row-actions { opacity: 1; }
            .ai-step-row-btn { width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-soft); transition: all 0.15s; }
            .ai-step-row-btn.accept { color: var(--pass); border-color: rgba(74,124,89,0.3); }
            .ai-step-row-btn.accept:hover { background: var(--pass); color: #fff; }
            .ai-step-row-btn.dismiss:hover { background: var(--fail); color: #fff; border-color: var(--fail); }
            .ai-step-row-btn:hover { background: var(--surface-alt); color: var(--ink); border-color: var(--line-strong); }
            
            .refine-box { margin-top: 10px; display: flex; gap: 8px; animation: fadeIn 0.2s; grid-column: 2 / -1; }
            .refine-box input { flex: 1; height: 32px; padding: 0 12px; font-size: 12px; border: 1px solid var(--accent); border-radius: 6px; background: var(--surface); }
            .refine-box input:focus { outline: none; box-shadow: 0 0 0 2px rgba(45,74,62,0.1); }
            
            .ai-panel-foot { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }

            /* MODALS */
            .modal-wrap { position: fixed; inset: 0; background: rgba(18,26,23,0.4); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px; animation: fadeIn 0.15s ease; }
            .modal { background: var(--surface); width: 600px; max-width: 100%; border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; }
            .modal-head { padding: 16px 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
            .modal-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; margin: 0; }
            .modal-body { padding: 20px; }
            .bulk-textarea { width: 100%; height: 240px; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink); background: var(--surface-alt); border: 1px solid var(--line-strong); border-radius: 6px; resize: none; line-height: 1.5; }
            .bulk-textarea:focus { outline: none; border-color: var(--accent); }
            .modal-foot { padding: 14px 20px; border-top: 1px solid var(--line); background: var(--surface-alt); display: flex; justify-content: flex-end; gap: 8px; }
            
            .btn { height: 36px; padding: 0 16px; border-radius: 6px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s ease; }
            .btn-primary { background: var(--accent); color: #fff; }
            .btn-primary:hover:not(:disabled) { background: var(--accent-ink); }
            .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
            .btn-ghost { background: transparent; color: var(--ink-soft); border-color: var(--line-strong); }
            .btn-ghost:hover { background: var(--surface); color: var(--ink); }

            /* FIGMA SPECIFIC MODAL */
            .figma-modal { width: 840px; max-height: 90vh; }
            .figma-paste-zone { text-align: center; padding: 60px 20px; }
            .fp-icon { font-size: 40px; margin-bottom: 16px; }
            .fp-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; margin: 0 0 8px; }
            .fp-sub { color: var(--ink-soft); font-size: 14px; margin: 0 0 24px; }
            .fp-input-row { display: flex; gap: 8px; max-width: 540px; margin: 0 auto; }
            .fp-input-row input { flex: 1; height: 42px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--line-strong); background: var(--surface-alt); font-family: inherit; font-size: 14px; }
            .fp-input-row input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
            .fp-input-row .btn { height: 42px; padding: 0 20px; }
            
            .figma-frames-zone { display: flex; flex-direction: column; height: 100%; max-height: 65vh; }
            .ff-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
            .ff-filename { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; margin: 0 0 4px; }
            .ff-sub { color: var(--ink-soft); font-size: 13px; margin: 0; }
            .frame-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; overflow-y: auto; padding: 4px; flex: 1; }
            .frame-card { border: 2px solid var(--line); border-radius: 10px; overflow: hidden; cursor: pointer; transition: all 0.15s ease; background: var(--surface); display: flex; flex-direction: column; position: relative;}
            .frame-card:hover { border-color: var(--line-strong); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
            .frame-card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
            .fc-img { height: 160px; background-size: contain; background-position: center; background-repeat: no-repeat; background-color: var(--surface-alt); border-bottom: 1px solid var(--line); position: relative; }
            .fc-name { padding: 12px; font-size: 12.5px; font-weight: 500; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink); }
            .fc-check { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 50%; background: var(--surface); border: 2px solid var(--line-strong); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.15s; color: #fff; }
            .frame-card:hover .fc-check { opacity: 1; }
            .frame-card.selected .fc-check { opacity: 1; background: var(--accent); border-color: var(--accent); }
          `}} />

          {/* TOP HEADER */}
          <header className="builder-head">
            <div className="head-left">
              <button className="back-btn" onClick={() => router.push('/scripts')} aria-label="Back to Library">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              </button>
              <div className="breadcrumb">
                Library <span>/</span> {name || 'Untitled script'}
              </div>
            </div>
            <div className="head-right">
              <div className={`save-status ${saveStatus === 'Saved' ? 'saved' : saveStatus === 'Saving...' ? 'saving' : ''}`}>
                <span className="dot"></span> {saveStatus}
              </div>
              <button className="btn btn-primary" onClick={() => router.push('/scripts')}>Done</button>
            </div>
          </header>

          {/* MAIN EDITOR */}
          <main className="builder-main">
            <input 
              className="title-input" 
              placeholder="Script Name..." 
              value={name} 
              onChange={e => setName(e.target.value)} 
              autoFocus={routeId === 'new'}
            />
            <textarea 
              className="desc-input" 
              placeholder="Add a description or preconditions for the testers..." 
              value={description} 
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />

            {/* STEPS LIST */}
            {steps.length > 0 && (
              <div className="steps-list">
                {steps.map((step, index) => (
                  <div className="step-card" key={step.id}>
                    <div className="step-num">{String(index + 1).padStart(2, '0')}</div>
                    <div className="step-inputs">
                      <input 
                        className="step-act-input" 
                        value={step.action} 
                        onChange={e => updateStep(step.id, { action: e.target.value })} 
                        placeholder="What should the tester do?"
                      />
                      <textarea 
                        className="step-exp-input" 
                        value={step.expectedResult} 
                        onChange={e => updateStep(step.id, { expectedResult: e.target.value })} 
                        placeholder="Expected result..."
                        rows={1}
                        onInput={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                        }}
                      />
                    </div>
                    <div className="step-actions">
                      <button className="s-btn danger" onClick={() => removeStep(step.id)} title="Delete step">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AI STREAMING / REVIEW PANEL */}
            {aiState !== 'idle' && (
              <div className="ai-panel">
                <div className="ai-panel-head">
                  <div className="ai-status-pulse">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    {aiState === 'reading-designs' ? `Analyzing ${selectedFrames.length} frames...` :
                     aiState === 'streaming' ? 'Writing test steps...' :
                     aiState === 'error' ? 'Generation failed' :
                     `Review ${aiSteps.length} generated steps`}
                  </div>
                  {aiState === 'streaming' && (
                    <button className="btn btn-ghost" style={{height: '30px'}} onClick={stopGeneration}>Stop</button>
                  )}
                  {aiState === 'review' && aiSteps.length > 0 && (
                    <button className="btn btn-ghost" style={{height: '30px'}} onClick={() => { setAiSteps([]); setAiState('idle'); }}>Dismiss All</button>
                  )}
                </div>

                <div className="ai-step-list">
                  {aiSteps.map((step, idx) => (
                    <div className="ai-step-row" key={step.id}>
                      <div className="ai-step-row-num">{String(idx + 1).padStart(2, '0')}</div>
                      <div>
                        <div className="ai-step-row-action">{step.action}</div>
                        <div className="ai-step-row-expect">{step.expectedResult}</div>
                        {(step.area || step.priority) && (
                          <div className="ai-step-row-meta">
                            {step.priority && <strong style={{color: 'var(--accent)'}}>{step.priority} Priority</strong>}
                            {step.priority && step.area && ' · '}
                            {step.area && `${step.area}`}
                          </div>
                        )}
                      </div>
                      <div className="ai-step-row-actions">
                        <button className="ai-step-row-btn accept" onClick={() => acceptStep(step)} title="Accept">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                        <button className="ai-step-row-btn" onClick={() => setRefiningStepId(refiningStepId === step.id ? null : step.id)} title="Refine">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button className="ai-step-row-btn dismiss" onClick={() => dismissStep(step.id)} title="Dismiss">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                      
                      {refiningStepId === step.id && (
                        <div className="refine-box">
                          <input 
                            type="text" 
                            placeholder="e.g. 'Make it focus only on the negative edge cases...'" 
                            value={refineText}
                            onChange={e => setRefineText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleRefine(step)}
                            autoFocus
                          />
                          <button className="btn btn-primary" style={{height: '32px', fontSize: '11px', padding: '0 12px'}} onClick={() => handleRefine(step)}>Update</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {aiState === 'review' && aiSteps.length > 0 && (
                  <div className="ai-panel-foot">
                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}><strong style={{ color: 'var(--accent)' }}>{aiSteps.length} of {aiSteps.length}</strong> selected</span>
                    <button className="btn btn-primary" onClick={acceptAll}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add {aiSteps.length} steps
                    </button>
                  </div>
                )}
                
                {aiState === 'error' && (
                  <div style={{ color: 'var(--fail)', fontSize: '13px', marginTop: '10px' }}>{aiError}</div>
                )}
              </div>
            )}

            {/* ADD STEP FORK */}
            {aiState === 'idle' && (
              <div className="fork-section">
                <div className="fork-title">Append Steps</div>
                <div className="fork-grid">
                  <div className="fork-card" onClick={addManualStep}>
                    <div className="fork-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </div>
                    <div className="fork-name">Manual Step</div>
                    <div className="fork-desc">Type out a single step</div>
                  </div>

                  <div className="fork-card" onClick={() => setIsBulkOpen(true)}>
                    <div className="fork-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </div>
                    <div className="fork-name">Bulk Paste</div>
                    <div className="fork-desc">Paste lines or sheets</div>
                  </div>

                  <div 
                    className={`fork-card ${!figmaConnected ? 'connect-mode' : ''}`} 
                    onClick={handleAIForkClick}
                  >
                    {!figmaConnected && <div className="ai-badge">Required for AI</div>}
                    <div className="fork-icon" style={figmaConnected ? { background: 'linear-gradient(135deg, #1d3329 0%, #2d4a3e 100%)', color: '#fff', border: 'none' } : {}}>
                      {figmaConnected ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"></path><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"></path><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"></path><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"></path><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"></path></svg>
                      )}
                    </div>
                    <div className="fork-name">{figmaConnected ? 'Generate with AI' : 'Connect Figma'}</div>
                    <div className="fork-desc">{figmaConnected ? 'Extract from designs' : 'Securely link your workspace'}</div>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* BULK PASTE MODAL */}
          {isBulkOpen && (
            <div className="modal-wrap" onClick={(e) => { if (e.target === e.currentTarget) setIsBulkOpen(false); }}>
              <div className="modal">
                <div className="modal-head">
                  <h3 className="modal-title">Bulk Paste Steps</h3>
                  <button className="back-btn" style={{border: 'none'}} onClick={() => setIsBulkOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div className="modal-body">
                  <div style={{fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '12px'}}>
                    Paste text from anywhere. We'll automatically split numbered lists, plain lines, or tab-separated spreadsheet cells into distinct steps.
                  </div>
                  <textarea 
                    className="bulk-textarea" 
                    placeholder="1. Login to app&#10;Expected: See dashboard&#10;&#10;2. Click settings..."
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="modal-foot">
                  <button className="btn btn-ghost" onClick={() => setIsBulkOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleBulkPaste} disabled={!bulkText.trim()}>Append Steps</button>
                </div>
              </div>
            </div>
          )}

          {/* FIGMA AI MODAL */}
          {isAIOpen && (
            <div className="modal-wrap" onClick={(e) => { if (e.target === e.currentTarget) setIsAIOpen(false); }}>
              <div className="modal figma-modal">
                <div className="modal-head">
                  <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    Generate with AI
                  </h3>
                  <button className="back-btn" style={{border: 'none'}} onClick={() => setIsAIOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                
                <div className="modal-body">
                  {figmaFrames.length === 0 ? (
                    <div className="figma-paste-zone">
                      <div className="fp-icon">🎨</div>
                      <h4 className="fp-title">Paste a Figma link</h4>
                      <p className="fp-sub">We'll scan the file and fetch your top-level frames so you can pick which ones to test.</p>
                      <div className="fp-input-row">
                        <input 
                          type="text" 
                          placeholder="https://www.figma.com/file/..." 
                          value={figmaUrl} 
                          onChange={e => setFigmaUrl(e.target.value)} 
                          onKeyDown={e => e.key === 'Enter' && handleFetchFrames()}
                          autoFocus
                        />
                        <button className="btn btn-primary" onClick={handleFetchFrames} disabled={!figmaUrl || isFetchingFigma}>
                          {isFetchingFigma ? 'Scanning...' : 'Fetch Frames'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="figma-frames-zone">
                      <div className="ff-header">
                        <div>
                          <h4 className="ff-filename">{figmaFileName}</h4>
                          <p className="ff-sub">Select the specific frame you want Claude to write test steps for.</p>
                        </div>
                        <button className="btn btn-ghost" onClick={() => { setFigmaFrames([]); setFigmaUrl(''); }}>Change File</button>
                      </div>
                      
                      <div className="frame-grid">
                        {figmaFrames.map(frame => (
                          <div 
                            key={frame.id} 
                            className={`frame-card ${selectedFrames.includes(frame.id) ? 'selected' : ''}`}
                            onClick={() => toggleFrame(frame.id)}
                          >
                            <div className="fc-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                            <div className="fc-img" style={{backgroundImage: `url(${frame.imageUrl})`}}></div>
                            <div className="fc-name" title={frame.name}>{frame.name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {figmaFrames.length > 0 && (
                  <div className="modal-foot">
                    <button className="btn btn-ghost" onClick={() => setIsAIOpen(false)}>Cancel</button>
                    <button className="btn btn-primary" disabled={selectedFrames.length === 0} style={{ gap: '6px' }} onClick={startAIGeneration}>
                      Generate Steps 
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}