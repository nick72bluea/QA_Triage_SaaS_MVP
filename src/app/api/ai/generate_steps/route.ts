import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { frames, scriptName, description } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return NextResponse.json({ error: 'Missing Anthropic API Key' }, { status: 500 });

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const generate = async () => {
    try {
      // 1. Tell frontend we are reading designs
      await writer.write(encoder.encode(`event: status\ndata: reading-designs\n\n`));

      // 2. Fetch and convert cached images to Base64 for Claude
      const imageContents = await Promise.all(frames.map(async (frame: any) => {
        const res = await fetch(frame.imageUrl);
        const arrayBuffer = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
        };
      }));

      // 3. Tell frontend we are starting the stream
      await writer.write(encoder.encode(`event: status\ndata: streaming\n\n`));

      const systemPrompt = `You are an expert QA engineer. Analyze the provided design frames for the feature "${scriptName}". ${description ? `Context: ${description}` : ''}
      Generate a comprehensive list of manual testing steps (UI checks, interactions, edge cases).
      Output STRICTLY a JSON array of objects. Format: [{"action": "Click X", "expectedResult": "Y opens", "priority": "High", "area": "Auth", "frameId": "source_frame_id"}]. Do not output markdown code blocks or any other text.`;

      // 4. Call Anthropic
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 4000,
          temperature: 0.2,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                ...imageContents,
                { type: 'text', text: 'Generate the JSON array of test steps.' }
              ]
            }
          ],
          stream: true
        })
      });

      if (!anthropicRes.ok) throw new Error('Anthropic API Error');

      // 5. Robust Streaming JSON Parser (Backend side)
      const reader = anthropicRes.body?.getReader();
      let buffer = '';
      let stepIndex = 0;

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(5));
            if (data.type === 'content_block_delta') {
              buffer += data.delta.text;
              
              // Extract complete JSON objects as they form
              const stepMatches = buffer.match(/\{[^}]+\}/g);
              if (stepMatches) {
                for (const match of stepMatches) {
                  try {
                    const parsedStep = JSON.parse(match);
                    // Emit the completed step to the frontend
                    await writer.write(encoder.encode(`event: step\ndata: ${JSON.stringify({...parsedStep, id: `ai_${crypto.randomUUID()}`})}\n\n`));
                    // Remove the parsed portion from the buffer
                    buffer = buffer.replace(match, '');
                  } catch (e) {
                    // JSON not fully formed yet, ignore and keep buffering
                  }
                }
              }
            }
          }
        }
      }

      await writer.write(encoder.encode(`event: status\ndata: review\n\n`));
    } catch (error: any) {
      await writer.write(encoder.encode(`event: error\ndata: ${error.message}\n\n`));
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