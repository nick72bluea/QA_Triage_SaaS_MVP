// src/lib/platforms.ts

import { TestRunData, TestStep } from '@/types';

/** True if a step should be visible to a tester on this platform.
 *  Steps without appliesTo always show. Steps with appliesTo only show
 *  if the platform is in the list. */
export function stepAppliesToPlatform(step: TestStep, platform?: string): boolean {
  if (!step.appliesTo || step.appliesTo.length === 0) return true;
  if (!platform) return true; // Legacy/agnostic run sees everything
  return step.appliesTo.includes(platform);
}

/** Returns the deduped platform list for a project, derived from any
 *  run's denormalized platforms field. Returns empty array if project
 *  has no platforms configured. */
export function getProjectPlatforms(runs: TestRunData[]): string[] {
  for (const run of runs) {
    if (run.platforms && run.platforms.length > 0) {
      return [...run.platforms];
    }
  }
  return [];
}

/** Returns runs filtered to a specific platform. Runs without a platform
 *  field are excluded (they belong to legacy/non-platform projects). */
export function runsForPlatform(runs: TestRunData[], platform: string): TestRunData[] {
  return runs.filter(r => r.platform === platform);
}

/** True if any run in the project has platforms configured. Used to gate
 *  platform-specific UI (don't show platform chips on legacy projects). */
export function projectHasPlatforms(runs: TestRunData[]): boolean {
  return runs.some(r => r.platforms && r.platforms.length > 0);
}

/** Returns the platform-aware step count for a run. A run on iOS only
 *  counts steps that apply to iOS. */
export function platformStepCount(run: TestRunData): number {
  if (!run.platform) return run.steps?.length || 0;
  return (run.steps || []).filter(s => stepAppliesToPlatform(s, run.platform)).length;
}