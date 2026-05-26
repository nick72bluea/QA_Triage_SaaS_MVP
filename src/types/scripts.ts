// src/types/scripts.ts (or append to your existing types file)
import type { Timestamp } from 'firebase/firestore';

// ─── Saved script ───
export interface SavedScript {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  tags: string[];
  steps: ScriptStep[];

  // Figma context (snapshotted from workspace's connection at fetch time)
  figmaContext?: FigmaContext;

  // Phase 2 stub — visual regression. Always empty array for v1.
  regressionRuns: any[];

  // Metadata
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'draft' | 'active' | 'archived';

  // Convenience metrics
  stepCount: number;
  highPriorityCount: number;
  estimatedMinutes: number; 
  lastUsedInCycle?: { cycleId: string; cycleName: string; usedAt: Timestamp };
}

export interface ScriptStep {
  id: string;
  action: string;
  expectedResult: string;
  priority?: 'High' | 'Medium' | 'Low';
  area?: string;

  // If AI-generated, citation to source frame
  aiCitation?: {
    frameId: string;
    frameName: string;
  };

  // For draft steps that haven't been accepted yet (mid-AI flow)
  pending?: boolean;
}

// ─── Figma integration ───
export interface FigmaConnection {
  workspaceId: string;
  userId: string;            
  accessToken: string;       
  refreshToken: string;
  expiresAt: Timestamp;
  fileKey?: string;          
  fileName?: string;
  lastSyncedAt?: Timestamp;
  connectedAt: Timestamp;
}

export interface FigmaContext {
  fileKey: string;
  fileName: string;
  frames: FigmaFrame[];
  lastSyncedAt: Timestamp;
}

export interface FigmaFrame {
  id: string;                
  name: string;
  imageUrl: string;          
  width: number;
  height: number;
  rawNode?: any;
}

// ─── AI streaming events ───
export type AIStreamEvent =
  | { type: 'reading-frame'; frameId: string; frameName: string }
  | { type: 'reading-complete' }
  | { type: 'step-streaming-start'; stepIndex: number }
  | { type: 'step-streaming-token'; stepIndex: number; field: 'action' | 'expectedResult'; token: string }
  | { type: 'step-complete'; stepIndex: number; step: ScriptStep }
  | { type: 'all-complete'; totalSteps: number }
  | { type: 'error'; message: string };