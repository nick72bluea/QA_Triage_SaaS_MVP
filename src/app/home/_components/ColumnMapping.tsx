"use client";

import React, { useState } from 'react';

interface ColumnMappingProps {
  file: File | null;
  headers: string[];
  rawData: any[];
  mapping: Record<string, string>;
  onMappingChange: (fieldId: string, colId: string) => void;
}

export function ColumnMapping({ file, headers, rawData, mapping, onMappingChange }: ColumnMappingProps) {
  const [hoveredMapper, setHoveredMapper] = useState<string | null>(null);

  const MAPPABLE_FIELDS = [
    { id: 'action', name: 'Action Column', required: true, accent: 1 },
    { id: 'expectedResult', name: 'Expected Result', required: true, accent: 2 },
    { id: 'area', name: 'Area / Module', required: false, accent: 3 },
    { id: 'scenario', name: 'Scenario', required: false, accent: 4 },
    { id: 'priority', name: 'Priority', required: false, accent: 5 },
  ];

  const getAccentForCol = (colId: string) => {
    const mappedFieldId = Object.keys(mapping).find(key => mapping[key] === colId);
    if (!mappedFieldId) return null;
    const field = MAPPABLE_FIELDS.find(f => f.id === mappedFieldId);
    return field ? field.accent : null;
  };

  const mappedCount = Object.values(mapping).filter(v => v !== '').length;

  return (
    <div id="s3-csv" className="s3-variant">
      <div className="auto-detect-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 12l2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <span><strong>We auto-detected {mappedCount} of 5 columns.</strong> Review and adjust — hover a mapping to highlight its source column.</span>
      </div>
      
      <div className="mapping-grid">
        <div className="csv-panel">
          <div className="csv-head">
            <span className="csv-head-title">{file ? file.name : 'uploaded-file.csv'} · {rawData.length} rows</span>
            <span className="csv-head-badge">Auto-detected</span>
          </div>
          <div className="csv-table-wrap">
            <table className="csv-table">
              <thead>
                <tr>
                  {headers.map((col, i) => {
                    const accent = getAccentForCol(col);
                    const isHovered = hoveredMapper && mapping[hoveredMapper] === col;
                    return (
                      <th key={col} className={`${accent ? 'mapped' : ''} ${isHovered ? 'highlight' : ''}`} data-accent={accent || undefined}>
                        <span className="col-letter">{String.fromCharCode(65 + i)}</span>{col}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rawData.slice(0, 6).map((row, idx) => (
                  <tr key={idx}>
                    {headers.map(col => {
                      const accent = getAccentForCol(col);
                      return <td key={col} data-accent={accent || undefined}>{row[col]}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mappers">
          {MAPPABLE_FIELDS.map(field => {
            const mappedColId = mapping[field.id];
            const isMapped = !!mappedColId;
            const previewValue = mappedColId && rawData.length > 0 ? rawData[0][mappedColId] : null;

            return (
              <div 
                key={field.id}
                className={`mapper ${isMapped ? 'mapped' : ''}`} 
                data-accent={field.accent}
                onMouseEnter={() => setHoveredMapper(field.id)}
                onMouseLeave={() => setHoveredMapper(null)}
              >
                <div className="mapper-label">
                  <span className="mapper-name">{field.name}</span>
                  {field.required ? <span className="mapper-required">Required</span> : <span className="mapper-optional">Optional</span>}
                </div>
                <select 
                  className="mapper-select" 
                  value={mappedColId || ''}
                  onChange={(e) => onMappingChange(field.id, e.target.value)}
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((h, i) => <option key={h} value={h}>{String.fromCharCode(65 + i)} — {h}</option>)}
                </select>
                {isMapped && previewValue && (
                  <div className="mapper-preview"><span className="arrow">↳</span><span className="sample">{previewValue}</span></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}