import { TestRunData, AggregatedStep, ProjectAggregate, TesterResultOnStep } from '@/types';

const AVATAR_COLORS = [
  '#a6421f', '#3d5a80', '#4a7c59', '#8a867f',
  '#b8860b', '#947011', '#2d4a3e', '#55524d',
];

export function colorForTester(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function groupRunsByProject(runs: TestRunData[]): Map<string, TestRunData[]> {
  const grouped = new Map<string, TestRunData[]>();
  for (const run of runs) {
    const key = `${run.projectName}::${run.testCycle || ''}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(run);
  }
  return grouped;
}

function classifyConsensus(step: Omit<AggregatedStep, 'consensus' | 'suggestedPriority'>): AggregatedStep['consensus'] {
  const { total, failedCount, passedCount, passNoteCount, pendingCount } = step;
  if (pendingCount === total) return 'pending';
  const decided = total - pendingCount;
  if (failedCount === 0 && passNoteCount === 0 && passedCount === decided) return 'pass';
  if (decided > 0 && failedCount / decided >= 0.7) return 'fail';
  if (failedCount === 0 && passNoteCount > 0) return 'notes';
  return 'mixed';
}

function suggestPriority(step: Omit<AggregatedStep, 'consensus' | 'suggestedPriority'>, consensus: AggregatedStep['consensus']): AggregatedStep['suggestedPriority'] {
  if (consensus === 'notes' || consensus === 'pass' || consensus === 'pending') return 'Low';
  const decided = step.total - step.pendingCount;
  if (decided === 0) return 'Medium';
  const failRate = step.failedCount / decided;
  if (failRate >= 0.7) return 'High';
  if (failRate >= 0.4) return 'Medium';
  return 'Low';
}

export function aggregateProject(runs: TestRunData[]): ProjectAggregate {
  if (runs.length === 0) throw new Error('No runs to aggregate');
  const first = runs[0];
  const canonicalSteps = first.steps;

  const testers = runs.map(run => {
    const failCount = canonicalSteps.filter(s => {
      const r = run.results?.[s.id];
      return r?.status === 'Failed' && !(r as any).isTriaged;
    }).length;
    const passNoteCount = canonicalSteps.filter(s => {
      const r = run.results?.[s.id];
      return r?.status === 'Passed' && (r.notes?.trim() || r.noteChips?.length) && !(r as any).isTriaged;
    }).length;
    const completedSteps = Object.keys(run.results || {}).length;
    return {
      id: run.id!,
      name: run.testerName,
      initials: initialsFor(run.testerName),
      color: colorForTester(run.testerName),
      runId: run.id!,
      deviceInfo: run.deviceInfo,
      email: run.testerEmail,
      failCount,
      passNoteCount,
      completedSteps,
      totalSteps: canonicalSteps.length,
    };
  });

  const steps: AggregatedStep[] = canonicalSteps.map((step, idx) => {
    const results: TesterResultOnStep[] = runs.map(run => ({
      runId: run.id!,
      testerId: run.id!,
      testerName: run.testerName,
      testerEmail: run.testerEmail,
      deviceInfo: run.deviceInfo,
      result: run.results?.[step.id] || null,
      reviewKey: `${run.id}_${step.id}`,
    }));
    const passedCount = results.filter(r => r.result?.status === 'Passed' && !(r.result.notes?.trim() || r.result.noteChips?.length)).length;
    const passNoteCount = results.filter(r => r.result?.status === 'Passed' && (r.result.notes?.trim() || r.result.noteChips?.length)).length;
    const failedCount = results.filter(r => r.result?.status === 'Failed').length;
    const pendingCount = results.filter(r => !r.result).length;
    const total = results.length;

    const stepBase = {
      stepId: step.id,
      stepIndex: idx,
      action: step.action,
      expectedResult: step.expectedResult,
      area: step.area,
      results,
      total, passedCount, failedCount, passNoteCount, pendingCount,
    };
    const consensus = classifyConsensus(stepBase);
    const suggestedPriority = suggestPriority(stepBase, consensus);
    return { ...stepBase, consensus, suggestedPriority };
  });

  return {
    projectName: first.projectName,
    testCycle: first.testCycle,
    runs,
    testers,
    steps,
  };
}