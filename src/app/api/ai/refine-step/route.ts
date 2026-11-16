import { NextResponse } from 'next/server';
import { requireMember, errorResponse } from '@/lib/server-auth';
import { getAccountSecrets } from '@/lib/secrets';

export async function POST(req: Request) {
  const { step, instruction, accountId } = await req.json();

  try {
    await requireMember(req, accountId, 'member');
  } catch (err) {
    return errorResponse(err);
  }

  let apiKey = process.env.ANTHROPIC_API_KEY || '';
  try {
    const { aiToken } = await getAccountSecrets(accountId);
    if (aiToken) apiKey = aiToken;
  } catch (err) {
    console.warn('Could not load workspace aiToken — using server env key', err);
  }

  if (!apiKey) return NextResponse.json({ error: 'Missing API Key' }, { status: 500 });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 500,
        system: `You are refining a single QA test step. User feedback: "${instruction}". Output STRICTLY a JSON object: {"action": "...", "expectedResult": "...", "priority": "...", "area": "..."}. No other text.`,
        messages: [{ role: 'user', content: `Current Step: ${JSON.stringify(step)}` }]
      })
    });

    const data = await res.json();
    const refinedText = data.content[0].text;
    const refinedStep = JSON.parse(refinedText.match(/\{[\s\S]*\}/)[0]);

    return NextResponse.json({ step: { ...step, ...refinedStep } });
  } catch (error) {
    return errorResponse(error);
  }
}