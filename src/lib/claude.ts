// Shared Claude setup for the AI routes (server-only).
//
// Every route uses the official Anthropic SDK with:
//   • one model, set here, so upgrading is a one-line change
//   • structured outputs (a zod schema) so responses are guaranteed-valid JSON
//     instead of regex-scraping text
//   • server-side fallbacks: if the model's safety classifier declines a
//     request, Anthropic automatically re-runs it on a recommended fallback model

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const CLAUDE_MODEL = 'claude-opus-5-5';

// Beta header that enables `fallbacks: "default"`.
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01' as const;

export function claudeClient(apiKey: string) {
  return new Anthropic({ apiKey, maxRetries: 2 });
}

// Turns SDK errors into a short message we can show a PM.
export function claudeErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'The Anthropic API key was rejected. Check it in Settings → AI Configuration.';
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'This Anthropic API key does not have access to the model.';
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'The AI service is busy (rate limited). Please try again in a minute.';
  }
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(err.message)) {
      return 'The Anthropic account is out of credits.';
    }
    return `The AI request was invalid: ${err.message}`;
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the AI service. Please try again.';
  }
  if (err instanceof Anthropic.APIError) {
    return `AI service error (${err.status}). Please try again.`;
  }
  return err instanceof Error ? err.message : 'AI request failed.';
}

// Thrown when even the fallback model declines, or the output was cut off.
export class ClaudeOutputError extends Error {}

export function assertUsableStop(stopReason: string | null) {
  if (stopReason === 'refusal') {
    throw new ClaudeOutputError('The AI declined to process this content.');
  }
  if (stopReason === 'max_tokens') {
    throw new ClaudeOutputError('The AI response was too long and got cut off. Try fewer items.');
  }
}

// ─── Schemas ────────────────────────────────────────────────────────────────

export const TicketDraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  stepsToReproduce: z.array(z.string()),
  expectedBehavior: z.string(),
  actualBehavior: z.string(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low', 'Enhancement']),
  severityReasoning: z.string(),
  environment: z.array(
    z.object({
      device: z.string(),
      os: z.string(),
      browser: z.string(),
      affected: z.boolean(),
      testerCount: z.number().int(),
    })
  ),
  citations: z.array(
    z.object({
      id: z.string(),
      claim: z.string(),
      claimLocation: z.enum(['description', 'actualBehavior', 'severityReasoning']),
      sourceTesterIds: z.array(z.string()),
    })
  ),
});
export type TicketDraft = z.infer<typeof TicketDraftSchema>;

export const ScriptStepSchema = z.object({
  action: z.string(),
  expectedResult: z.string(),
  priority: z.enum(['High', 'Medium', 'Low']),
  area: z.string(),
});

export const GeneratedStepsSchema = z.object({
  steps: z.array(ScriptStepSchema.extend({ frameId: z.string() })),
});
