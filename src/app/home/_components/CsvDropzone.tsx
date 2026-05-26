"use client";

import React, { useRef, useState } from 'react';

interface CsvDropzoneProps {
  file: File | null;
  headers: string[];
  rawData: any[];
  onUpload: (file: File) => void;
  onReset: () => void;
  onChangePath: () => void;
}

export function CsvDropzone({ file, headers, rawData, onUpload, onReset, onChangePath }: CsvDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div id="path-picker-csv">
      <div className="path-substate" style={{ padding: '14px 14px' }}>
        <div className="path-substate-head" style={{ marginBottom: '10px', paddingBottom: '10px' }}>
          <h3 className="path-substate-title">
            <span className="path-substate-title-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </span>
            Import a CSV
          </h3>
          <button className="path-substate-back" onClick={onChangePath}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Change path
          </button>
        </div>

        <div 
          className={`dropzone ${isDragOver ? 'dragover' : ''} ${file ? 'uploaded' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {!file ? (
            <div id="dz-empty">
              <div className="dz-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="dz-title">Drop your test script here</div>
              <div className="dz-sub">We'll preview the file and map columns on the next step.</div>
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>Browse Files</button>
              <input type="file" accept=".csv,.tsv" hidden ref={fileInputRef} onChange={handleFileChange} />
              <div className="dz-hint">CSV, TSV · max 10 MB · 1,000 tests supported</div>
            </div>
          ) : (
            <div id="dz-done">
              <div className="file-info">
                <div className="file-icon">CSV</div>
                <div>
                  <div className="file-name">{file.name}</div>
                  <div className="file-stat">{rawData.length} rows · {headers.length} columns</div>
                </div>
                <span className="file-replace" onClick={onReset}>Replace file</span>
              </div>
              
              {headers.length > 0 && rawData.length > 0 ? (
                <table className="preview-table">
                  <thead>
                    <tr>{headers.slice(0, 5).map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rawData.slice(0, 4).map((row, i) => (
                      <tr key={i}>{headers.slice(0, 5).map(h => <td key={h}>{row[h]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="preview-table" style={{ opacity: 0.6, pointerEvents: 'none' }}>
                  <thead>
                    <tr><th>Action</th><th>Expected</th><th>Area</th><th>Scenario</th><th>Priority</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td></tr>
                    <tr><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}