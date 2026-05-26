import { NextResponse } from 'next/server';

export const runtime = 'edge';

interface InboundTicket {
  id: string;
  runIds: string[];
  stepId: string;
  stepIndex: number;
  stepAction: string;
  expectedResult: string;
  platform?: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low' | 'Enhancement';
  sources: Array<{
    testerId: string;
    testerName: string;
    deviceInfo: { device: string; os: string; browser: string };
    status: 'Passed' | 'Failed';
    notes: string;
    noteChips: string[];
    evidenceUrls: string[];
  }>;
}

export async function POST(req: Request) {
  const { tickets } = await req.json() as { tickets: InboundTicket[] };
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing Anthropic API Key' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper to send an SSE event
  const send = async (event: string, data: any) => {
    await writer.write(
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    );
  };

  // Run draft generation in the background, return the stream immediately
  const generate = async () => {
    try {
      // Process tickets sequentially. Could parallelize but sequential
      // gives the PM a nice "progress" feel as each ticket completes.
      for (const ticket of tickets) {
        await send('ticket-started', { id: ticket.id });

        try {
          const draft = await draftOneTicket(ticket, apiKey);
          await send('ticket-ready', { id: ticket.id, draft });
        } catch (err: any) {
          console.error(`Draft failed for ${ticket.id}:`, err);
          await send('ticket-error', {
            id: ticket.id,
            error: err.message || 'Draft failed',
          });
        }
      }

      await send('done', {});
    } catch (err: any) {
      console.error('Draft stream fatal error:', err);
      await send('error', { error: err.message });
    } finally {
      writer.close();
    }
  };

  generate();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function draftOneTicket(ticket: InboundTicket, apiKey: string) {
  // Build a clean source summary the LLM can read.
  // We label each tester [t1], [t2]... so the AI can cite them in its output.
  const sourcesForPrompt = ticket.sources.map((s, i) => ({
    label: `t${i + 1}`,
    testerId: s.testerId,
    testerName: s.testerName,
    device: `${s.deviceInfo.device} · ${s.deviceInfo.os} · ${s.deviceInfo.browser}`,
    status: s.status,
    notes: s.notes || '(no written note)',
    noteChips: s.noteChips || [],
  }));

  const platformContext = ticket.platform
    ? `\nThis ticket is specifically for the **${ticket.platform}** platform. The title MUST clearly indicate the platform (e.g., "[${ticket.platform}] ..." prefix). Steps to reproduce should reference platform-specific UI, gestures, or browsers where relevant.`
    : '';

  const systemPrompt = `You are an expert QA engineer drafting a Jira bug ticket from multiple tester reports.

Your job: read all tester reports for ONE failed/noted test step, then produce a single high-quality bug ticket that synthesises the reports faithfully.

The test step that failed:
- Step ${ticket.stepIndex + 1}: ${ticket.stepAction}
- Expected result: ${ticket.expectedResult}
- Suggested priority: ${ticket.priority}${platformContext}

You will be given a list of tester reports. Each report has a label like [t1], [t2]. Use these labels to cite which testers support each claim in your output.

Output STRICTLY a JSON object with this exact shape, no markdown, no commentary:

{
  "title": "Concise bug title, max 100 chars. Imperative. Include platform prefix if applicable.",
  "description": "2-4 sentence summary of the bug. Use inline citation markers like [c1], [c2] to reference specific claims. Each [cN] must have a corresponding entry in the citations array.",
  "stepsToReproduce": ["Step 1", "Step 2", "Step 3"],
  "expectedBehavior": "What should happen.",
  "actualBehavior": "What actually happens. Use [c1], [c2] etc. for cited claims.",
  "severity": "Critical|High|Medium|Low|Enhancement",
  "severityReasoning": "1-2 sentence justification. Reference how many testers were affected and the impact. Use [cN] citations.",
  "environment": [
    { "device": "iPhone 14 Pro", "os": "iOS 17.2", "browser": "Safari", "affected": true, "testerCount": 2 }
  ],
  "citations": [
    {
      "id": "c1",
      "claim": "the page hangs after submit",
      "claimLocation": "description",
      "sourceTesterIds": ["<actual testerId from input>"]
    }
  ]
}

Rules:
- Every [cN] you write in description, actualBehavior, or severityReasoning MUST have a matching entry in citations.
- citation.sourceTesterIds must contain the actual testerId values (not the [tN] labels) of testers who reported that claim.
- citation.claim should be a short paraphrase of what's being claimed (5-12 words).
- citation.claimLocation tells the UI where the [cN] appears.
- Don't invent details not in the source reports.
- If only one tester reported something, you can still cite it — citations aren't only for multi-tester claims.
- Severity should usually match the suggested priority unless the reports clearly indicate a different severity.
- Group environment entries by device+os+browser — don't list each tester separately.`;

  const userMessage = `Tester reports:\n${JSON.stringify(sourcesForPrompt, null, 2)}\n\nDraft the Jira ticket as JSON.`;

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

  // Extract the JSON object from the response (handles stray whitespace/preamble)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in response');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${(e as Error).message}`);
  }

  // Aggregate evidence URLs from all sources for the front-end
  const evidenceUrls = ticket.sources.flatMap(s => s.evidenceUrls || []);

  return {
    title: parsed.title || '',
    description: parsed.description || '',
    stepsToReproduce: parsed.stepsToReproduce || [],
    expectedBehavior: parsed.expectedBehavior || '',
    actualBehavior: parsed.actualBehavior || '',
    severity: parsed.severity || ticket.priority,
    severityReasoning: parsed.severityReasoning || '',
    environment: parsed.environment || [],
    citations: parsed.citations || [],
    evidenceUrls,
  };
}