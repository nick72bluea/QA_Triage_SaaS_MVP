import { NextResponse } from 'next/server';
import { requireMember, errorResponse } from '@/lib/server-auth';
import { getAccountSecrets } from '@/lib/secrets';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  CLAUDE_MODEL, FALLBACK_BETA, TicketDraftSchema,
  claudeClient, claudeErrorMessage, assertUsableStop,
} from '@/lib/claude';

export async function POST(req: Request) {
  const { draft, refinement, accountId } = await req.json();

  // Only signed-in members of this workspace may spend its AI credits.
  try {
    await requireMember(req, accountId, 'member');
  } catch (err) {
    return errorResponse(err);
  }

  // Resolve API key: prefer per-workspace key, fall back to server env var
  let apiKey = process.env.ANTHROPIC_API_KEY || '';
  try {
    const { aiToken } = await getAccountSecrets(accountId);
    if (aiToken) apiKey = aiToken;
  } catch (err) {
    console.warn('Could not load workspace aiToken — using server env key', err);
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Anthropic API key configured. Add your key in Settings → AI Configuration.' },
      { status: 500 }
    );
  }

  if (typeof refinement !== 'string' || !refinement.trim() || refinement.length > 2000) {
    return NextResponse.json({ error: 'Describe the change you want (up to 2000 characters).' }, { status: 400 });
  }

  try {
    const systemPrompt = `You refine an existing Jira bug ticket draft according to the user's instruction, and return the complete ticket.

- Keep the [cN] citation markers and the citations array unless the instruction asks to remove them; every [cN] still in the text needs its citations entry.
- If the instruction asks to remove a section's content, keep the field but make it brief.
- Don't invent new sources or testers — work only with what's in the draft.
- Keep severity unchanged unless the instruction is about severity.`;

    const userMessage = `Current draft:\n${JSON.stringify({
      title: draft.title,
      description: draft.description,
      stepsToReproduce: draft.stepsToReproduce,
      expectedBehavior: draft.expectedBehavior,
      actualBehavior: draft.actualBehavior,
      severity: draft.severity,
      severityReasoning: draft.severityReasoning,
      environment: draft.environment,
      citations: draft.citations,
    }, null, 2)}\n\nInstruction: ${refinement.trim()}`;

    const response = await claudeClient(apiKey).beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(TicketDraftSchema) },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    assertUsableStop(response.stop_reason);
    const refined = response.parsed_output;
    if (!refined) throw new Error('The AI returned a ticket in an unexpected format.');

    // Merge refined fields back onto the original draft so we preserve
    // identity fields (id, runIds, stepId, sources, evidenceUrls, etc.)
    return NextResponse.json({
      draft: {
        ...draft,
        title: refined.title ?? draft.title,
        description: refined.description ?? draft.description,
        stepsToReproduce: refined.stepsToReproduce ?? draft.stepsToReproduce,
        expectedBehavior: refined.expectedBehavior ?? draft.expectedBehavior,
        actualBehavior: refined.actualBehavior ?? draft.actualBehavior,
        severity: refined.severity ?? draft.severity,
        severityReasoning: refined.severityReasoning ?? draft.severityReasoning,
        environment: refined.environment ?? draft.environment,
        citations: refined.citations ?? draft.citations,
      },
    });
  } catch (error) {
    console.error('Refine error:', error);
    return NextResponse.json({ error: claudeErrorMessage(error) }, { status: 502 });
  }
}
