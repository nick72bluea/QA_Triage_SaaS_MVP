/**
 * Date formatting helpers.
 *
 * Always uses an explicit locale ('en-GB') so server and client render
 * identical strings — eliminates a class of hydration mismatch errors.
 *
 * Don't import `toLocaleDateString` results from `Date` directly anywhere
 * in the app. Use these helpers instead.
 */

import type { Timestamp } from 'firebase/firestore';

/**
 * Accepts a Date, a Firestore Timestamp, a number (ms), or null/undefined.
 * Returns a normalised Date or null.
 */
function toDate(value: Date | Timestamp | number | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof (value as Timestamp).toMillis === 'function') {
    return new Date((value as Timestamp).toMillis());
  }
  return null;
}

/**
 * Format as "15 Jan 2026". Use for compact display in tables, lists.
 */
export function formatDate(value: Date | Timestamp | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format as "15 Jan 2026, 14:23". Use when time-of-day matters.
 */
export function formatDateTime(value: Date | Timestamp | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format as relative time ("just now", "5 min ago", "2 hr ago", "3 days ago").
 *
 * IMPORTANT: This depends on `Date.now()` at render time, which differs between
 * SSR and the first client render. Only call this from inside an effect or
 * after a `hydrated` flag is true — never directly in the initial render
 * branch of a component that is server-rendered.
 *
 * Returns "—" if value is null/undefined.
 */
export function formatRelative(value: Date | Timestamp | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;

  const diffDays = Math.round(diffHr / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  // Beyond a week, fall back to absolute date — relative loses meaning
  return formatDate(date);
}