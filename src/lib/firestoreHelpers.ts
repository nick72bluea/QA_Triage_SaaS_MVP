import { doc, deleteDoc, updateDoc, type DocumentData, type UpdateData } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Get a typed document reference, asserting that the id is defined.
 * Throws at call-time (not Firestore-time) if id is missing, which gives
 * a clearer stack trace than the deep Firestore error.
 */
function runDoc(runId: string | undefined) {
  if (!runId) throw new Error('runDoc called with undefined id — caller should filter first');
  return doc(db, 'testRuns', runId);
}

/**
 * Delete a testRun doc safely. No-ops if id is undefined.
 */
export async function deleteRunSafe(runId: string | undefined): Promise<void> {
  if (!runId) return;
  await deleteDoc(doc(db, 'testRuns', runId));
}

/**
 * Update a testRun doc safely. No-ops if id is undefined.
 * Returns whether the update was performed (helpful when you need to know).
 */
export async function updateRunSafe(
  runId: string | undefined,
  data: UpdateData<DocumentData>
): Promise<boolean> {
  if (!runId) return false;
  await updateDoc(doc(db, 'testRuns', runId), data);
  return true;
}

/**
 * Update many runs in parallel. Skips any with undefined id, returns the
 * count of runs actually updated (so callers can detect partial updates).
 */
export async function updateRunsBatch(
  runs: Array<{ id?: string }>,
  data: UpdateData<DocumentData>
): Promise<{ updated: number; skipped: number }> {
  const withIds = runs.filter((r): r is { id: string } => Boolean(r.id));
  await Promise.all(withIds.map(r => updateDoc(doc(db, 'testRuns', r.id), data)));
  return { updated: withIds.length, skipped: runs.length - withIds.length };
}