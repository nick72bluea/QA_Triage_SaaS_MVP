"use client";

import React, { useState } from 'react';
import { WizardScriptStep, ParsedStep } from '@/types';
import { BulkPasteModal } from './BulkPasteModal';

interface ManualRefineProps {
  steps: WizardScriptStep[];
  onStepsChange: (steps: WizardScriptStep[]) => void;
}

export function ManualRefine({ steps, onStepsChange }: ManualRefineProps) {
  const [isBulkPasteOpen, setIsBulkPasteOpen] = useState(false);

  const addStep = () => {
    onStepsChange([...steps, {
      id: crypto.randomUUID(),
      action: '',
      expectedResult: '',
    }]);
  };

  const updateStep = (id: string, patch: Partial<WizardScriptStep>) => {
    onStepsChange(steps.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeStep = (id: string) => {
    onStepsChange(steps.filter(s => s.id !== id));
  };

  const handleBulkPasteConfirm = (parsedSteps: ParsedStep[]) => {
    const newSteps: WizardScriptStep[] = parsedSteps.map(ps => ({
      id: crypto.randomUUID(),
      action: ps.action,
      expectedResult: ps.expectedResult || '',
    }));
    onStepsChange([...steps, ...newSteps]);
    setIsBulkPasteOpen(false);
  };

  return (
    <div id="s3-manual" className="s3-variant" style={{ position: 'relative' }}>
      <div className="refine-head">
        <div className="refine-progress">
          <div className="refine-progress-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="refine-progress-text">
            Started in Step 2 · <strong>{steps.length} steps drafted</strong> · <em>need at least 3 to launch</em>
          </div>
        </div>
        <div className="refine-actions">
          <button className="refine-bulk-btn" onClick={() => setIsBulkPasteOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Bulk paste
          </button>
        </div>
      </div>

      <div className="manual-builder">
        {steps.map((step, i) => (
          <div key={step.id} className="manual-step">
            <span className="manual-step-num">{String(i + 1).padStart(2, '0')}</span>
            <div className="manual-step-body">
              <input
                className="manual-step-action"
                value={step.action}
                onChange={e => updateStep(step.id, { action: e.target.value })}
                placeholder="What should the tester do?"
              />
              <textarea
                className="manual-step-expected"
                value={step.expectedResult}
                onChange={e => updateStep(step.id, { expectedResult: e.target.value })}
                placeholder="What's the expected result?"
                rows={2}
              />
            </div>
            <button className="manual-step-remove" onClick={() => removeStep(step.id)} aria-label="Remove step">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button className="manual-add-step" onClick={addStep}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add step {String(steps.length + 1).padStart(2, '0')}
      </button>

      <BulkPasteModal 
        open={isBulkPasteOpen} 
        onClose={() => setIsBulkPasteOpen(false)} 
        onConfirm={handleBulkPasteConfirm}
        insertAfterStep={steps.length}
      />
    </div>
  );
}