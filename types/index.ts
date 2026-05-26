// src/types/index.ts

export type Orientation = 'portrait' | 'landscape';

export interface TestStep {
  id: string;
  action: string;
  expectedResult: string;
  visualAidUrl?: string;
  orientation: Orientation; 
}

export interface TestRun {
  id: string;
  projectName: string;
  testerName: string;
  steps: TestStep[];
}

export interface TestResult {
  stepId: string;
  status: 'Passed' | 'Failed' | 'Pending';
  notes?: string;
}