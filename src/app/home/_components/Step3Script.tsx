"use client";

import React from 'react';
import { ScriptPath, SavedScriptSummary, WizardScriptStep } from '@/types';

interface Step3ScriptProps {
  scriptPath: ScriptPath;
  
  // CSV props
  csvFile: File | null;
  csvHeaders: string[];
  csvRawData: any[];
  csvMapping: Record<string, string>;
  onCsvMappingChange: (fieldId: string, colId: string) => void;
  
  // Saved props
  selectedSavedScript: SavedScriptSummary | null;
  savedScriptSteps: WizardScriptStep[];
  onSavedScriptStepsChange: (steps: WizardScriptStep[]) => void;
  
  // Manual props
  manualSteps: WizardScriptStep[];
  onManualStepsChange: (steps: WizardScriptStep[]) => void;
}

export function Step3Script({
  scriptPath,
  csvHeaders,
  csvRawData,
  csvMapping,
  onCsvMappingChange,
  selectedSavedScript,
  savedScriptSteps,
  onSavedScriptStepsChange,
  manualSteps,
  onManualStepsChange,
}: Step3ScriptProps) {

  // --- STYLES ---
  const sharedStyles = (
    <style dangerouslySetInnerHTML={{__html: `
      .map-grid { display: flex; flex-direction: column; gap: 12px; }
      .map-row { display: grid; grid-template-columns: 200px 1fr; gap: 20px; align-items: center; padding: 14px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
      .map-req { display: inline-block; padding: 2px 6px; background: var(--fail-soft); color: var(--fail); font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; border-radius: 4px; margin-left: 8px; }
      .map-opt { display: inline-block; padding: 2px 6px; background: var(--surface-alt); color: var(--ink-mute); font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; border-radius: 4px; margin-left: 8px; }
      .map-label { font-size: 14px; font-weight: 500; color: var(--ink); }
      .map-select { width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface-alt); color: var(--ink); font-family: inherit; font-size: 13px; outline: none; transition: all 0.2s; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a7a72' stroke-width='2' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
      .map-select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); background: var(--surface); }
      .map-select.mapped { border-color: var(--pass); background: var(--pass-soft); }
      
      .preview-snippet { margin-top: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

      .builder-row { display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; align-items: start; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 12px; transition: border-color 0.2s; }
      .builder-row:focus-within { border-color: var(--accent); }
      .b-num { width: 24px; height: 24px; border-radius: 50%; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-soft); font-weight: 500; margin-top: 4px; }
      .b-inputs { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .b-input { width: 100%; padding: 8px 12px; font-family: inherit; font-size: 14px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink); outline: none; transition: background 0.2s; }
      .b-input:hover { background: var(--surface-alt); }
      .b-input:focus { background: var(--surface-alt); border-color: var(--line-strong); }
      .b-input.expected { font-size: 12px; color: var(--ink-soft); }
      .b-remove { width: 32px; height: 32px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--ink-mute); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
      .b-remove:hover { background: var(--fail-soft); color: var(--fail); }
      .add-step-btn { width: 100%; padding: 14px; border: 1px dashed var(--line-strong); border-radius: 10px; background: transparent; color: var(--ink-mute); cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; }
      .add-step-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    `}} />
  );

  // --- CSV MAPPING PATH ---
  if (scriptPath === 'csv') {
    return (
      <div className="map-grid">
        {sharedStyles}
        <div style={{marginBottom: '10px', fontSize: '13px', color: 'var(--ink-soft)'}}>
          We found <strong>{csvHeaders.length} columns</strong> and <strong>{csvRawData.length} rows</strong>. Map your columns to the required fields below.
        </div>

        {[
          { id: 'action', label: 'Step Action', req: true, desc: 'What the tester needs to do.' },
          { id: 'expectedResult', label: 'Expected Result', req: true, desc: 'What should happen.' },
          { id: 'area', label: 'Area / Module', req: false, desc: 'e.g. Login, Checkout' },
          { id: 'scenario', label: 'Scenario', req: false, desc: 'e.g. Invalid password' },
          { id: 'priority', label: 'Priority', req: false, desc: 'High, Medium, Low' },
        ].map(field => (
          <div key={field.id} className="map-row">
            <div>
              <div className="map-label">
                {field.label}
                {field.req ? <span className="map-req">Required</span> : <span className="map-opt">Optional</span>}
              </div>
            </div>
            <div>
              <select 
                className={`map-select ${csvMapping[field.id] ? 'mapped' : ''}`}
                value={csvMapping[field.id] || ''}
                onChange={e => onCsvMappingChange(field.id, e.target.value)}
              >
                <option value="">-- Ignore this field --</option>
                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              {csvMapping[field.id] && csvRawData.length > 0 && (
                <div className="preview-snippet">
                  Sample: "{csvRawData[0][csvMapping[field.id]]}"
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // --- MANUAL / SAVED SCRIPT INLINE EDITOR ---
  const activeSteps = scriptPath === 'saved' ? savedScriptSteps : manualSteps;
  const onChange = scriptPath === 'saved' ? onSavedScriptStepsChange : onManualStepsChange;

  const updateStep = (id: string, field: 'action' | 'expectedResult', val: string) => {
    onChange(activeSteps.map(s => s.id === id ? { ...s, [field]: val } : s));
  };
  const removeStep = (id: string) => {
    onChange(activeSteps.filter(s => s.id !== id));
  };
  const addStep = () => {
    onChange([...activeSteps, { id: `new_${Date.now()}`, action: '', expectedResult: '' }]);
  };

  return (
    <div>
      {sharedStyles}
      {scriptPath === 'saved' && selectedSavedScript && (
        <div style={{padding: '12px 16px', background: 'var(--info-soft)', border: '1px solid rgba(61,90,128,0.2)', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: 'var(--info)'}}>
          Loaded <strong>{selectedSavedScript.name}</strong>. Feel free to tweak the steps for this specific test run.
        </div>
      )}
      
      <div style={{display: 'flex', flexDirection: 'column'}}>
        {activeSteps.map((step, idx) => (
          <div key={step.id} className="builder-row">
            <div className="b-num">{idx + 1}</div>
            <div className="b-inputs">
              <input 
                className="b-input" 
                placeholder="What should the tester do?" 
                value={step.action} 
                onChange={e => updateStep(step.id, 'action', e.target.value)} 
              />
              <input 
                className="b-input expected" 
                placeholder="What is the expected result?" 
                value={step.expectedResult} 
                onChange={e => updateStep(step.id, 'expectedResult', e.target.value)} 
              />
            </div>
            <button className="b-remove" onClick={() => removeStep(step.id)} aria-label="Remove step">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        ))}
        
        <button className="add-step-btn" onClick={addStep}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Step
        </button>
      </div>
    </div>
  );
}