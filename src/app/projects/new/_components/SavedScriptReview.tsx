"use client";

import React, { useState, useMemo } from 'react';
import { WizardScriptStep, SavedScriptSummary } from '@/types';

interface SavedScriptReviewProps {
  script: SavedScriptSummary;
  steps: WizardScriptStep[];
  onStepsChange: (steps: WizardScriptStep[]) => void;
}

export function SavedScriptReview({ script, steps, onStepsChange }: SavedScriptReviewProps) {
  const [isEditing, setIsEditing] = useState(false);

  const updateStep = (id: string, patch: Partial<WizardScriptStep>) => {
    onStepsChange(steps.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const addStep = () => {
    onStepsChange([...steps, {
      id: crypto.randomUUID(),
      action: 'New action',
      expectedResult: 'Expected result'
    }]);
  };

  const stats = useMemo(() => ({
    total: steps.length,
    areas: new Set(steps.map(s => s.area).filter(Boolean)).size,
    high: steps.filter(s => s.priority === 'High').length,
  }), [steps]);

  return (
    <div id="s3-saved" className="s3-variant">
      <div className="review-head">
        <div className="review-head-left">
          <div className="review-head-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
            </svg>
          </div>
          <div className="review-head-text">
            <h3 className="review-head-title">{script.name}</h3>
            <div className="review-head-meta">
              <span className="stat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                {steps.length} steps
              </span>
              <span className="stat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                ~{Math.ceil(steps.length * 0.95)} min
              </span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Copied for this cycle</span>
            </div>
          </div>
        </div>
        <div className="review-head-actions">
          <button
            className={`review-toggle-edit ${isEditing ? 'editing' : ''}`}
            onClick={() => setIsEditing(e => !e)}
          >
            {isEditing ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Done editing
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit inline
              </>
            )}
          </button>
        </div>
      </div>

      <div className={`review-step-list ${isEditing ? 'editing' : ''}`} id="review-step-list">
        {steps.map((step, i) => (
          <div key={step.id} className="review-step">
            <span className="review-step-num">{String(i + 1).padStart(2, '0')}</span>
            
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                <input 
                  className="review-step-action" 
                  style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)', padding: '4px 8px', borderRadius: '4px', width: '100%' }}
                  value={step.action}
                  onChange={(e) => updateStep(step.id, { action: e.target.value })}
                />
                <input 
                  className="review-step-action" 
                  style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '4px 8px', borderRadius: '4px', fontSize: '11.5px', color: 'var(--ink-soft)', width: '100%' }}
                  value={step.expectedResult}
                  onChange={(e) => updateStep(step.id, { expectedResult: e.target.value })}
                />
              </div>
            ) : (
              <div className="review-step-action">
                {step.action}
                <small>{step.expectedResult}</small>
              </div>
            )}

            {step.priority && (
              <span className={`review-step-priority ${step.priority.toLowerCase()}`}>
                {step.priority}
              </span>
            )}
            {step.area && <span className="review-step-area">{step.area}</span>}
          </div>
        ))}
      </div>

      <div className="review-foot">
        <span>
          <strong>{stats.total} steps</strong> · <em>{stats.areas} areas</em> ·{' '}
          <strong>{stats.high} high priority</strong>
        </span>
        <div className="review-foot-actions">
          <button className="review-foot-btn" onClick={addStep}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add step
          </button>
          <button className="review-foot-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}