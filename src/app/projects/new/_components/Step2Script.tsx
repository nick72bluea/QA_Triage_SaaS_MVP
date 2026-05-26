"use client";

import React from 'react';
import type { ScriptPath, WizardScriptStep, SavedScriptSummary } from '@/types';
import { PathPicker } from './PathPicker';
import { SavedScriptPicker } from './SavedScriptPicker';
import { CsvDropzone } from './CsvDropzone';
import { ManualBuilder } from './ManualBuilder';

interface Step2ScriptProps {
  scriptPath: ScriptPath | null;
  onPathChange: (path: ScriptPath | null) => void;
  // Saved script
  savedScripts: SavedScriptSummary[];
  selectedSavedScriptId: string | null;
  onSelectSavedScript: (id: string) => void;
  // CSV
  csvFile: File | null;
  onCsvUpload: (file: File) => void;
  onCsvReset: () => void;
  // Manual
  manualSteps: WizardScriptStep[];
  onManualStepsChange: (steps: WizardScriptStep[]) => void;
  onOpenBulkPaste: () => void;
}

export function Step2Script(props: Step2ScriptProps) {
  // No path picked yet → show the picker
  if (!props.scriptPath) {
    return (
      <PathPicker
        onPick={props.onPathChange}
        savedScriptCount={props.savedScripts.length}
        savedScriptPreview={props.savedScripts.slice(0, 3)}
      />
    );
  }

  // Path picked → render the matching sub-state with a "Change path" button
  const handleChangePath = () => props.onPathChange(null);

  if (props.scriptPath === 'saved') {
    return (
      <SavedScriptPicker
        scripts={props.savedScripts}
        selectedId={props.selectedSavedScriptId}
        onSelect={props.onSelectSavedScript}
        onChangePath={handleChangePath}
      />
    );
  }

  if (props.scriptPath === 'csv') {
    return (
      <CsvDropzone
        file={props.csvFile}
        onUpload={props.onCsvUpload}
        onReset={props.onCsvReset}
        onChangePath={handleChangePath}
      />
    );
  }

  return (
    <ManualBuilder
      steps={props.manualSteps}
      onStepsChange={props.onManualStepsChange}
      onChangePath={handleChangePath}
      onOpenBulkPaste={props.onOpenBulkPaste}
    />
  );
}