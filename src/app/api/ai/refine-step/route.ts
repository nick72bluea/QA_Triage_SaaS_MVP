import { NextResponse } from 'next/server';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { requireMember, errorResponse } from '@/lib/server-auth';
import { getAccountSecrets } from '@/lib/secrets';
import {
  CLAUDE_MODEL, FALLBACK_BETA, ScriptStepSchema,
  claudeClient, claudeErrorMessage, assertUsableStop,
} from '@/lib/claude';

// Rewrites a single test step according to the PM's instruction.
export async function POST(req: Request) {
  const { step, instruction, accountId } = await req.json();

  try {
    await requireMember(req, accountId, 'member');
  } catch (err) {
    return errorResponse(err);
  }

  if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 2000) {
    return NextResponse.json({ error: 'Describe the change you want (up to 2000 characters).' }, { status: 400 });
  }
  if (!step || typeof step !== 'object') {
    return NextResponse.json({ error: 'Missing step.' }, { status: 400 });
  }

  let apiKey = process.env.ANTHROPIC_API_KEY || '';
  try {
    const { aiToken } = await getAccountSecrets(accountId);
    if (aiToken) apiKey = aiToken;
  } catch (err) {
    console.warn('Could not load workspace aiToken — using server env key', err);
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'No Anthropic API key configured. Add one in Settings → AI Configuration.' }, { status: 500 });
  }

  try {
    const response = await claudeClient(apiKey).beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(ScriptStepSchema) },
      system:
        'You refine a single manual QA test step according to the instruction. Keep one clear action and an observable expected result. ' +
        'Keep priority and area unless the instruction is about them.',
      messages: [{
        role: 'user',
        content: `Current step:\n${JSON.stringify({
          action: step.action,
          expectedResult: step.expectedResult,
          priority: step.priority,
          area: step.area,
        }, null, 2)}\n\nInstruction: ${instruction.trim()}`,
      }],
    });

    assertUsableStop(response.stop_reason);
    if (!response.parsed_output) throw new Error('The AI returned the step in an unexpected format.');

    return NextResponse.json({ step: { ...step, ...response.parsed_output } });
  } catch (error) {
    console.error('refine-step error:', error);
    return NextResponse.json({ error: claudeErrorMessage(error) }, { status: 502 });
  }
}
