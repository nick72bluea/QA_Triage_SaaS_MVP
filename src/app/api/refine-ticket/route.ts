import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { draft, refinement } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API Key' }, { status: 500 });
  }

  try {
    const systemPrompt = `You are refining an existing Jira bug ticket draft based on user feedback.

User's refinement instruction: "${refinement}"

You will be given the current draft as JSON. Apply the requested change and return the FULL ticket JSON with the same shape — do not omit any fields.

Output STRICTLY a JSON object with this exact shape, no markdown:

{
  "title": "...",
  "description": "...",
  "stepsToReproduce": ["..."],
  "expectedBehavior": "...",
  "actualBehavior": "...",
  "severity": "Critical|High|Medium|Low|Enhancement",
  "severityReasoning": "...",
  "environment": [...],
  "citations": [...]
}

Rules:
- Preserve any [cN] citation markers and the citations array structure unless the refinement specifically asks to remove them.
- If the refinement asks to remove a section's content, keep the field but make it brief — don't drop the field entirely.
- Don't invent new sources or testers — work with what's in the draft.
- Keep severity unchanged unless the refinement is specifically about severity.`;

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
    }, null, 2)}\n\nReturn the refined ticket as JSON.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 2000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error: ${res.status} ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text;
    if (!rawText) throw new Error('No content in Anthropic response');

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');

    const refined = JSON.parse(jsonMatch[0]);

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
  } catch (error: any) {
    console.error('Refine error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}