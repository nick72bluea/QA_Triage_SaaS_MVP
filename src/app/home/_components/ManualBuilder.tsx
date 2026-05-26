"use client";

import React from 'react';
import { WizardScriptStep } from '@/types';

interface ManualBuilderProps {
  steps: WizardScriptStep[];
  onStepsChange: (steps: WizardScriptStep[]) => void;
  onChangePath: () => void;
  onOpenBulkPaste: () => void;
}

export function ManualBuilder({ steps, onStepsChange, onChangePath, onOpenBulkPaste }: ManualBuilderProps) {
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

  return (
    <div id="path-picker-manual">
      <div className="path-substate">
        <div className="path-substate-head">
          <h3 className="path-substate-title">
            <span className="path-substate-title-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </span>
            Build steps inline
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="manual-bulk-paste" onClick={onOpenBulkPaste}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              Bulk paste
            </button>
            <button className="path-substate-back" onClick={onChangePath}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Change path
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
          {steps.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: '13px', border: '1px dashed var(--line)', borderRadius: '8px' }}>
              No steps drafted yet. Add one below or use bulk paste.
            </div>
          )}
        </div>

        <button className="manual-add-step" onClick={addStep}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add step {String(steps.length + 1).padStart(2, '0')}
        </button>
      </div>
    </div>
  );
}