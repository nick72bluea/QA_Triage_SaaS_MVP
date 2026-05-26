"use client";

import React from 'react';
import type { ScriptPath, WizardScriptStep, SavedScriptSummary } from '@/types';
import { ColumnMapping } from './ColumnMapping';
import { SavedScriptReview } from './SavedScriptReview';
import { ManualRefine } from './ManualRefine';

interface Step3ScriptProps {
  scriptPath: ScriptPath;
  // CSV
  csvFile: File | null;
  csvColumns: any; // Assuming you have an existing type/shape for this
  // Saved
  selectedSavedScript: SavedScriptSummary | null;
  savedScriptSteps: WizardScriptStep[];
  onSavedScriptStepsChange: (steps: WizardScriptStep[]) => void;
  // Manual
  manualSteps: WizardScriptStep[];
  onManualStepsChange: (steps: WizardScriptStep[]) => void;
}

export function Step3Script(props: Step3ScriptProps) {
  if (props.scriptPath === 'csv') {
    return <ColumnMapping file={props.csvFile} columns={props.csvColumns} />;
  }
  
  if (props.scriptPath === 'saved') {
    // Fallback if somehow state got out of sync, though validation should prevent this
    if (!props.selectedSavedScript) return null; 
    
    return (
      <SavedScriptReview
        script={props.selectedSavedScript}
        steps={props.savedScriptSteps}
        onStepsChange={props.onSavedScriptStepsChange}
      />
    );
  }
  
  return (
    <ManualRefine
      steps={props.manualSteps}
      onStepsChange={props.onManualStepsChange}
    />
  );
}