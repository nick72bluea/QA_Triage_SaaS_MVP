"use client";

import React, { useState, useEffect } from 'react';
import type { ParsedStep, BulkPasteFormat } from '@/types';

interface BulkPasteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (steps: ParsedStep[]) => void;
  insertAfterStep: number;
}

// ─── Parsing Logic ───
function detectFormat(text: string): BulkPasteFormat | null {
  if (!text.trim()) return null;

  const lines = text.split('\n').filter(l => l.trim());

  // Numbered list: lines start with "N." or "N)" or "N -"
  const numbered = lines.filter(l => /^\d+[.)\-\s]/.test(l));
  if (numbered.length / lines.length > 0.4) return 'numbered';

  // Tab-separated: contains tabs
  if (text.includes('\t')) return 'tab-separated';

  return 'plain-lines';
}

function parseNumbered(text: string): ParsedStep[] {
  const lines = text.split('\n');
  const steps: ParsedStep[] = [];
  let current: ParsedStep | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^\d+[.)\-]\s*(.+)/);
    if (match) {
      // New step
      if (current) steps.push(current);
      current = { action: match[1], selected: true };
    } else if (current) {
      // Continuation line — could be expected result
      const expectedMatch = trimmed.match(/^(?:Expected|Expects?):\s*(.+)/i);
      if (expectedMatch) {
        current.expectedResult = expectedMatch[1];
      } else {
        // Append to action if no expected result keyword
        current.action += ' ' + trimmed;
      }
    }
  }

  if (current) steps.push(current);
  return steps;
}

function parseTabSeparated(text: string): ParsedStep[] {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const cols = line.split('\t').map(c => c.trim());
    return {
      action: cols[0] || '',
      expectedResult: cols[1],
      selected: true,
    };
  }).filter(s => s.action);
}

function parsePlainLines(text: string): ParsedStep[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map(action => ({ action, selected: true }));
}

function parseSteps(text: string, format: BulkPasteFormat): ParsedStep[] {
  if (!text.trim()) return [];
  if (format === 'numbered') return parseNumbered(text);
  if (format === 'tab-separated') return parseTabSeparated(text);
  return parsePlainLines(text);
}

// ─── Component ───
export function BulkPasteModal({ open, onClose, onConfirm, insertAfterStep }: BulkPasteModalProps) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<BulkPasteFormat>('numbered');
  const [parsed, setParsed] = useState<ParsedStep[]>([]);
  const [autoDetectedFormat, setAutoDetectedFormat] = useState<BulkPasteFormat | null>(null);

  // Auto-detect format on text change
  useEffect(() => {
    const timer = setTimeout(() => {
      const detected = detectFormat(text);
      if (detected) {
        setAutoDetectedFormat(detected);
        setFormat(detected);
      }
    }, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [text]);

  // Re-parse when text or format changes
  useEffect(() => {
    setParsed(parseSteps(text, format));
  }, [text, format]);

  if (!open) return null;

  const toggleStep = (index: number) => {
    setParsed(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const handleConfirm = () => {
    onConfirm(parsed.filter(s => s.selected));
    setText('');
  };

  const selectedCount = parsed.filter(s => s.selected).length;

  return (
    <div className="bulk-paste-modal" id="bulk-paste-modal">
      <div className="bp-head">
        <div>
          <h3 className="bp-head-title">Bulk paste steps</h3>
          <div className="bp-head-sub">Paste numbered lists, sheet rows, or plain text · we&rsquo;ll split into steps</div>
        </div>
        <button className="bp-close" onClick={onClose} aria-label="Close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="bp-body">
        {/* Left Pane: Input */}
        <div className="bp-input-pane">
          <div className="bp-pane-head">
            <div className="bp-pane-label">Paste anywhere</div>
            <div className="bp-pane-hint">Auto-detects format. <strong>Toggle steps off</strong> on the right to skip.</div>
          </div>
          <textarea 
            className="bp-textarea" 
            placeholder="e.g.&#10;1. Login to the app&#10;Expected: Dashboard loads&#10;&#10;2. Navigate to settings..."
            value={text}
            onChange={e => setText(e.target.value)}
            autoFocus
          />
          <div className="bp-format-row">
            <span className="bp-format-label">Format:</span>
            <span 
              className={`bp-format-chip ${format === 'numbered' ? 'active' : ''}`}
              onClick={() => setFormat('numbered')}
            >
              Numbered list
            </span>
            <span 
              className={`bp-format-chip ${format === 'tab-separated' ? 'active' : ''}`}
              onClick={() => setFormat('tab-separated')}
            >
              Tab-separated
            </span>
            <span 
              className={`bp-format-chip ${format === 'plain-lines' ? 'active' : ''}`}
              onClick={() => setFormat('plain-lines')}
            >
              Plain lines
            </span>
          </div>
        </div>

        {/* Right Pane: Preview */}
        <div className="bp-preview-pane">
          <div className="bp-pane-head">
            <div className="bp-pane-label">Preview · <span style={{ color: 'var(--accent)' }}>{parsed.length} steps detected</span></div>
            <div className="bp-pane-hint">Will append after step {String(insertAfterStep).padStart(2, '0')} · existing steps stay</div>
          </div>
          <div className="bp-preview-list">
            {parsed.length === 0 ? (
              <div style={{ color: 'var(--ink-mute)', fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>
                Paste text on the left to see preview
              </div>
            ) : (
              parsed.map((step, idx) => (
                <div key={idx} className="bp-preview-item" style={{ opacity: step.selected ? 1 : 0.5 }}>
                  <span className="bp-preview-num">{String(insertAfterStep + idx + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="bp-preview-action">{step.action}</div>
                    {step.expectedResult && <div className="bp-preview-expected">{step.expectedResult}</div>}
                  </div>
                  <button 
                    className={`bp-preview-toggle ${step.selected ? 'active' : ''}`} 
                    onClick={() => toggleStep(idx)}
                    aria-label="Toggle step"
                  >
                    {step.selected && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bp-foot">
        <span className="bp-foot-summary">
          <strong>{selectedCount} of {parsed.length}</strong> selected · {parsed.length - selectedCount} toggled off
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={selectedCount === 0}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add {selectedCount} steps
          </button>
        </div>
      </div>
    </div>
  );
}