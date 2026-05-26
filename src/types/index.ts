import type { Timestamp } from 'firebase/firestore';
import type { BrandingSnapshot } from './workspace';

export interface TestStep {
  id: string;
  action: string;
  expectedResult: string;
  area?: string;
  scenario?: string;
  priority?: string;
  objective?: string;
  preConditions?: string;
  mediaUrls?: string[];
  referenceLinks?: string[];
}

export interface TestResult {
  stepId?: string;
  status: 'Passed' | 'Failed';
  notes?: string;
  evidenceUrls?: string[];
  noteChips?: string[];
  isTriaged?: boolean;

  triageAction?: 'Ticketed' | 'Snoozed' | 'Reviewed' | 'Dismissed';
  triagePriority?: string;
  triagedAt?: number;
  linkedJiraTicket?: string;
  linkedJiraUrl?: string;
}

export interface DeviceInfo {
  device: string;
  os: string;
  browser: string;
}

export interface TestRunData {
  id?: string;
  projectName: string;
  testerName: string;
  testerEmail?: string;
  environment?: string;
  testCycle?: string;
  steps: TestStep[];
  results?: Record<string, TestResult>;
  createdAt?: any;
  completedAt?: any;
  isCompleted?: boolean;
  deviceInfo?: DeviceInfo;
  cumulativeTimeMs?: number;

  // Branding snapshot — embedded at run creation so unauthenticated testers
  // see workspace branding without needing to query workspace settings.
  branding?: BrandingSnapshot | null;
}

export interface TesterResultOnStep {
  runId: string;
  testerId: string;
  testerName: string;
  testerEmail?: string;
  deviceInfo?: DeviceInfo;
  result: TestResult | null;
  reviewKey: string;
}

export interface AggregatedStep {
  stepId: string;
  stepIndex: number;
  action: string;
  expectedResult: string;
  area?: string;
  results: TesterResultOnStep[];
  total: number;
  passedCount: number;
  failedCount: number;
  passNoteCount: number;
  pendingCount: number;
  consensus: 'pass' | 'fail' | 'mixed' | 'notes' | 'pending';
  suggestedPriority: 'Critical' | 'High' | 'Medium' | 'Low' | 'Enhancement';
}

export interface ProjectAggregate {
  projectName: string;
  testCycle?: string;
  runs: TestRunData[];
  testers: Array<{
    id: string;
    name: string;
    initials: string;
    color: string;
    runId: string;
    deviceInfo?: DeviceInfo;
    email?: string;
    failCount: number;
    passNoteCount: number;
    completedSteps: number;
    totalSteps: number;
  }>;
  steps: AggregatedStep[];
}

export interface TesterMessage {
  id: string;
  runId: string;
  projectName: string;
  testCycle?: string;
  testerId: string;
  testerName: string;
  pmName: string;
  direction: 'pm_to_tester' | 'tester_to_pm';
  body: string;
  createdAt: number;
  stepId: string | null;
  stepIndex: number | null;
  stepAction: string | null;
  contextNote?: string | null;
  contextStatus?: 'Passed' | 'Failed' | null;
  contextChips?: string[];
  parentMessageId?: string | null;
  readByTester: boolean;
  readByPm: boolean;
  hasReply: boolean;
}

export interface MessageThread {
  root: TesterMessage;
  replies: TesterMessage[];
  isRead: boolean;
  hasReply: boolean;
}

// ─── AI-drafted ticket ───
export interface AIDraftedTicket {
  // Identity
  id: string;                          // client-generated for tracking
  runIds: string[];                    // testRunData.id values for the source runs
  stepId: string;
  stepIndex: number;

  // Source data — what the AI was given
  sources: TicketSource[];

  // AI output
  title: string;
  description: string;                 // can contain inline citation markers like [c1]
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Enhancement';
  severityReasoning: string;           // AI's explanation
  environment: EnvironmentEntry[];
  evidenceUrls: string[];              // pulled from sources

  // Citations
  citations: TicketCitation[];

  // UI state
  status: 'queued' | 'drafting' | 'ready' | 'refining' | 'approved';
  approved: boolean;
  pushed: boolean;
  jiraKey?: string;                    // populated after push
  jiraUrl?: string;
}

export interface TicketSource {
  testerId: string;                    // run.id (since 1 run = 1 tester for now)
  testerName: string;
  deviceInfo: { device: string; os: string; browser: string };
  status: 'Passed' | 'Failed';
  notes: string;
  noteChips: string[];
  evidenceUrls: string[];
}

export interface EnvironmentEntry {
  device: string;
  os: string;
  browser: string;
  affected: boolean;
  testerCount: number;
}

export interface TicketCitation {
  id: string;                          // e.g. 'c1', 'c2'
  claim: string;                       // the synthesized claim text
  claimLocation: 'description' | 'actualBehavior' | 'severityReasoning';
  sourceTesterIds: string[];           // which testers' reports informed this
}

// Preset Refinements for the UI
export const REFINEMENT_CHIPS: Array<{ label: string; instruction: string }> = [
  { label: 'More technical', instruction: 'Make the description more technical. Use precise terms (HTTP status codes, browser APIs, etc.) where appropriate. Assume the reader is a developer.' },
  { label: 'More concise', instruction: 'Make the ticket more concise. Tighten the description to its essential points. Keep all citations.' },
  { label: 'Add reproduction details', instruction: 'Expand the steps to reproduce. Add any missing setup, prerequisites, or environment details that would help a developer reliably reproduce this.' },
  { label: 'Focus on iOS only', instruction: 'Focus the ticket only on the iOS Safari occurrences. Remove or downweight references to other platforms.' },
  { label: 'Translate to engineering language', instruction: 'Rewrite using engineering terminology. Replace user-facing language ("doesn\'t work") with technical descriptions ("returns 500", "fails to dispatch event").' },
];

// ─── Wizard state ───
export type ScriptPath = 'saved' | 'csv' | 'manual';

export interface WizardScriptStep {
  id: string;              // client-generated
  action: string;
  expectedResult: string;
  priority?: 'High' | 'Medium' | 'Low';
  area?: string;
}

export interface SavedScriptSummary {
  id: string;
  name: string;
  stepCount: number;
  estimatedMinutes: number;
  tags: string[];
  // Full steps loaded on demand when picked
}

// ─── Bulk paste parser output ───
export interface ParsedStep {
  action: string;
  expectedResult?: string;
  selected: boolean;       // toggles from the preview
}

export type BulkPasteFormat = 'numbered' | 'tab-separated' | 'plain-lines';

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