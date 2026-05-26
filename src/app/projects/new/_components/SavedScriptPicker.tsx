"use client";

import React from 'react';
import { SavedScriptSummary } from '@/types';

interface SavedScriptPickerProps {
  scripts: SavedScriptSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChangePath: () => void;
}

export function SavedScriptPicker({ scripts, selectedId, onSelect, onChangePath }: SavedScriptPickerProps) {
  return (
    <div id="path-picker-saved">
      <div className="path-substate">
        <div className="path-substate-head">
          <h3 className="path-substate-title">
            <span className="path-substate-title-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </span>
            Pick a saved script
          </h3>
          <button className="path-substate-back" onClick={onChangePath}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Change path
          </button>
        </div>

        <div className="saved-picker-grid">
          {scripts.map(script => {
            const isSelected = script.id === selectedId;
            return (
              <div 
                key={script.id} 
                className={`saved-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(script.id)}
              >
                <div>
                  <div className="saved-card-name">{script.name}</div>
                  <div className="saved-card-meta">
                    <span className="stat">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      {script.stepCount} steps
                    </span>
                    <span className="stat">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      ~{Math.ceil(script.stepCount * 0.95)} min
                    </span>
                  </div>
                  {script.tags && script.tags.length > 0 && (
                    <div className="saved-card-tags">
                      {script.tags.map(tag => (
                        <span key={tag} className={`saved-card-tag ${tag.toLowerCase() === 'regression' ? 'regression' : ''}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="saved-card-radio">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: '11.5px', color: 'var(--ink-mute)', fontStyle: 'italic', marginTop: '12px' }}>
          A copy is made for this cycle · later edits to your library don't affect a launched cycle.
        </div>
      </div>
    </div>
  );
}