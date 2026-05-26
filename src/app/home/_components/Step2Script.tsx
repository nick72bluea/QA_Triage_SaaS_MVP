"use client";

import React from 'react';
import { ScriptPath, SavedScriptSummary, WizardScriptStep } from '@/types';

interface Step2ScriptProps {
  scriptPath: ScriptPath | null;
  onPathChange: (path: ScriptPath) => void;
  
  savedScripts: SavedScriptSummary[];
  selectedSavedScriptId: string | null;
  onSelectSavedScript: (id: string) => void;
  
  csvFile: File | null;
  csvHeaders: string[];
  csvRawData: any[];
  onCsvUpload: (file: File) => void;
  onCsvReset: () => void;
  
  manualSteps: WizardScriptStep[];
  onManualStepsChange: (steps: WizardScriptStep[]) => void;
  onOpenBulkPaste: () => void;
}

export function Step2Script({
  scriptPath,
  onPathChange,
  savedScripts,
  selectedSavedScriptId,
  onSelectSavedScript,
  csvFile,
  onCsvUpload,
  onCsvReset,
}: Step2ScriptProps) {

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onCsvUpload(e.target.files[0]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <style dangerouslySetInnerHTML={{__html: `
        .path-card {
          border: 1px solid var(--line-strong);
          border-radius: 12px;
          padding: 20px;
          background: var(--surface);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }
        .path-card:hover {
          border-color: var(--accent);
          background: var(--surface-lift, var(--surface));
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .path-card.active {
          border-color: var(--accent);
          background: var(--accent-soft);
          box-shadow: 0 0 0 1px var(--accent);
        }
        .path-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: var(--surface-alt); border: 1px solid var(--line);
          display: flex; align-items: center; justify-content: center;
          color: var(--ink-soft); flex-shrink: 0; transition: all 0.2s;
        }
        .path-card.active .path-icon { background: var(--accent); color: #fff; border-color: var(--accent); }
        .path-content { flex: 1; }
        .path-title { font-size: 16px; font-weight: 600; color: var(--ink); margin: 0 0 4px; }
        .path-sub { font-size: 13px; color: var(--ink-mute); margin: 0; line-height: 1.5; }
        
        .sub-panel { margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--line-strong); animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        
        .upload-zone { border: 2px dashed var(--line-strong); border-radius: 10px; padding: 32px 20px; text-align: center; background: rgba(255,255,255,0.02); transition: all 0.2s; cursor: pointer; }
        .upload-zone:hover { border-color: var(--accent); background: var(--accent-soft); }
        .upload-title { font-size: 14px; font-weight: 500; color: var(--ink); margin-bottom: 4px; }
        .upload-sub { font-size: 12px; color: var(--ink-mute); }
        
        .file-success { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--pass-soft); border: 1px solid rgba(74,124,89,0.3); border-radius: 8px; }
        .file-name { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--pass); font-weight: 500; }
        .file-change { font-size: 12px; color: var(--ink-mute); background: transparent; border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; cursor: pointer; }
        .file-change:hover { background: var(--surface); color: var(--ink); }

        .saved-grid { display: grid; gap: 10px; }
        .saved-card { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); cursor: pointer; transition: all 0.15s; }
        .saved-card:hover { border-color: var(--line-strong); background: rgba(255,255,255,0.03); }
        .saved-card.selected { border-color: var(--accent); background: var(--accent-soft); }
        .saved-name { font-weight: 500; color: var(--ink); font-size: 14px; margin-bottom: 2px; }
        .saved-meta { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; }
        .saved-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line-strong); display: flex; align-items: center; justify-content: center; }
        .saved-card.selected .saved-radio { border-color: var(--accent); }
        .saved-card.selected .saved-radio::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
      `}} />

      {/* 1. SAVED SCRIPTS */}
      <div className={`path-card ${scriptPath === 'saved' ? 'active' : ''}`} onClick={() => onPathChange('saved')}>
        <div className="path-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div className="path-content">
          <h3 className="path-title">Saved Library</h3>
          <p className="path-sub">Pick a pre-written test script from your team's workspace repository.</p>
          
          {scriptPath === 'saved' && (
            <div className="sub-panel" onClick={e => e.stopPropagation()}>
              <div className="saved-grid">
                {savedScripts.map(script => (
                  <div key={script.id} className={`saved-card ${selectedSavedScriptId === script.id ? 'selected' : ''}`} onClick={() => onSelectSavedScript(script.id)}>
                    <div>
                      <div className="saved-name">{script.name}</div>
                      <div className="saved-meta">{script.stepCount} steps · ~{script.estimatedMinutes} mins</div>
                    </div>
                    <div className="saved-radio" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. CSV UPLOAD */}
      <div className={`path-card ${scriptPath === 'csv' ? 'active' : ''}`} onClick={() => onPathChange('csv')}>
        <div className="path-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </div>
        <div className="path-content">
          <h3 className="path-title">Upload CSV</h3>
          <p className="path-sub">Import tests from Zephyr, TestRail, or Excel. We'll map the columns next.</p>
          
          {scriptPath === 'csv' && (
            <div className="sub-panel" onClick={e => e.stopPropagation()}>
              {!csvFile ? (
                <label className="upload-zone">
                  <input type="file" accept=".csv" hidden onChange={handleFileChange} />
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{color: 'var(--accent)', marginBottom: '10px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <div className="upload-title">Click to browse or drag a CSV here</div>
                  <div className="upload-sub">Must contain headers</div>
                </label>
              ) : (
                <div className="file-success">
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--pass)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span className="file-name">{csvFile.name}</span>
                  </div>
                  <button className="file-change" onClick={onCsvReset}>Change file</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. BUILD MANUALLY */}
      <div className={`path-card ${scriptPath === 'manual' ? 'active' : ''}`} onClick={() => onPathChange('manual')}>
        <div className="path-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <div className="path-content">
          <h3 className="path-title">Build Manually</h3>
          <p className="path-sub">Start from scratch. You can paste bulk text or write steps one by one.</p>
          {scriptPath === 'manual' && (
            <div className="sub-panel">
              <div style={{fontSize: '13px', color: 'var(--accent)', background: 'var(--surface)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(122,178,138,0.3)'}}>
                ✓ Ready. Proceed to the next step to start building.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}