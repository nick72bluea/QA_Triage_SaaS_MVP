"use client";

import React from 'react';
import { ScriptPath, SavedScriptSummary } from '@/types';

interface PathPickerProps {
  onPick: (path: ScriptPath) => void;
  savedScriptCount: number;
  savedScriptPreview: SavedScriptSummary[];
}

export function PathPicker({ onPick, savedScriptCount, savedScriptPreview }: PathPickerProps) {
  const hasSaved = savedScriptCount > 0;
  
  // If they have saved scripts, recommend that path. Otherwise, recommend manual.
  const recommendedPath: ScriptPath = hasSaved ? 'saved' : 'manual';

  return (
    <div id="path-picker-default">
      <div className="path-picker-intro">
        <div className="path-picker-eyebrow">Step 2 · choose a script source</div>
        <h2 className="path-picker-title">How will you add the test script?</h2>
        <p className="path-picker-sub">
          Three ways — pick whichever fits how you work. You can edit anything inline before launching.
        </p>
      </div>

      <div className="path-grid">
        {/* 1. Saved Script Card */}
        <div
          className={`path-card ${recommendedPath === 'saved' ? 'recommended' : ''} ${!hasSaved ? 'path-card-empty' : ''}`}
          onClick={() => hasSaved && onPick('saved')}
          aria-disabled={!hasSaved}
          style={{ opacity: hasSaved ? 1 : 0.6, cursor: hasSaved ? 'pointer' : 'not-allowed' }}
        >
          {recommendedPath === 'saved' && <span className="path-tag">Faster</span>}
          <div className="path-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
            </svg>
          </div>
          <h3 className="path-title">Use a saved script</h3>
          <p className="path-sub">
            {hasSaved 
              ? `Pick from the ${savedScriptCount} scripts in your library. A copy will be made for this cycle.` 
              : "No saved scripts in your workspace yet."}
          </p>
          
          {hasSaved && savedScriptPreview.length > 0 && (
            <div className="path-mini-list">
              {savedScriptPreview.map((script, idx) => (
                <div key={script.id} className="path-mini-item">
                  <span className="path-mini-num">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="path-mini-name">{script.name}</span>
                  <span className="path-mini-steps">{script.stepCount}</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="path-meta">
            {hasSaved ? `Choose from ${savedScriptCount}` : 'Library empty'}
            <svg className="path-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
        </div>

        {/* 2. CSV Import Card */}
        <div className="path-card" onClick={() => onPick('csv')}>
          <div className="path-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h3 className="path-title">Import a CSV</h3>
          <p className="path-sub">Got a script in Sheets, Notion, or Excel? Drag the file here and we&apos;ll structure it.</p>
          <div className="path-meta" style={{ marginTop: 'auto' }}>
            Works with most exports
            <svg className="path-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
        </div>

        {/* 3. Manual Builder Card */}
        <div
          className={`path-card ${recommendedPath === 'manual' ? 'recommended' : ''}`}
          onClick={() => onPick('manual')}
        >
          {recommendedPath === 'manual' && <span className="path-tag">Recommended</span>}
          <div className="path-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <h3 className="path-title">Build from scratch</h3>
          <p className="path-sub">Add steps inline, or paste from any source &mdash; we split the text into steps automatically.</p>
          <div className="path-meta" style={{ marginTop: 'auto' }}>
            ~5 min for a small script
            <svg className="path-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}