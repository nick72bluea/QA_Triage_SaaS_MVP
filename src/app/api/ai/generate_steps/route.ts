import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { requireMember, errorResponse } from '@/lib/server-auth';
import { getAccountSecrets } from '@/lib/secrets';
import {
  CLAUDE_MODEL, FALLBACK_BETA, GeneratedStepsSchema,
  claudeClient, claudeErrorMessage, assertUsableStop,
} from '@/lib/claude';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

// Generates manual test steps from Figma design frames, streaming each step
// to the browser as soon as Claude has written it (server-sent events):
//   event: status  data: reading-designs | streaming | review
//   event: step    data: { id, action, expectedResult, priority, area, aiCitation }
//   event: error   data: <message>

// Design images may only be fetched from these hosts (Figma exports and our
// own Firebase Storage). Stops this route being used to fetch arbitrary URLs.
const ALLOWED_IMAGE_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'figma-alpha-api.s3.us-west-2.amazonaws.com',
];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface Frame {
  id: string;
  name?: string;
  imageUrl: string;
}

function isAllowedImageUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_IMAGE_HOSTS.includes(url.hostname) || url.hostname.endsWith('.figma.com');
  } catch {
    return false;
  }
}

async function loadFrameImage(frame: Frame): Promise<Anthropic.Beta.BetaImageBlockParam> {
  const res = await fetch(frame.imageUrl, { redirect: 'error' });
  if (!res.ok) throw new Error(`Couldn't load the image for frame "${frame.name || frame.id}".`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim() as ImageType;
  if (!IMAGE_TYPES.includes(type)) throw new Error(`Frame "${frame.name || frame.id}" is not a PNG, JPEG, GIF or WebP image.`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`Frame "${frame.name || frame.id}" is larger than 5 MB.`);
  return { type: 'image', source: { type: 'base64', media_type: type, data: bytes.toString('base64') } };
}

export async function POST(req: Request) {
  const { frames, scriptName, description, accountId } = await req.json();

  try {
    await requireMember(req, accountId, 'member');
  } catch (err) {
    return errorResponse(err);
  }

  if (!Array.isArray(frames) || frames.length === 0 || frames.length > 20) {
    return NextResponse.json({ error: 'Select between 1 and 20 frames.' }, { status: 400 });
  }
  if (!frames.every((f: Partial<Frame>) => typeof f?.id === 'string' && isAllowedImageUrl(f.imageUrl))) {
    return NextResponse.json({ error: 'One or more frame images come from an unsupported address.' }, { status: 400 });
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

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  // SSE data must be one line, so error text is flattened.
  const send = (event: string, data: string) =>
    writer.write(encoder.encode(`event: ${event}\ndata: ${data.replace(/\n/g, ' ')}\n\n`));

  const frameNames = new Map<string, string>((frames as Frame[]).map((f) => [f.id, f.name || f.id]));
  const emitted = new Set<string>();

  // Sends a parsed step once, in the shape the scripts page expects.
  const emitStep = async (raw: unknown) => {
    const parsed = GeneratedStepsSchema.shape.steps.element.safeParse(raw);
    if (!parsed.success) return;
    const key = JSON.stringify(parsed.data);
    if (emitted.has(key)) return;
    emitted.add(key);
    const { frameId, ...step } = parsed.data;
    await send('step', JSON.stringify({
      ...step,
      id: `ai_${crypto.randomUUID()}`,
      aiCitation: frameNames.has(frameId) ? { frameId, frameName: frameNames.get(frameId) } : undefined,
    }));
  };

  const generate = async () => {
    try {
      await send('status', 'reading-designs');
      const images = await Promise.all((frames as Frame[]).map(loadFrameImage));

      // Label each image with its frame ID so Claude can cite the source frame.
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      (frames as Frame[]).forEach((frame, i) => {
        content.push({ type: 'text', text: `Frame ${frame.id} ("${frame.name || 'untitled'}"):` });
        content.push(images[i]);
      });
      content.push({
        type: 'text',
        text: [
          `Feature: ${scriptName || 'Untitled script'}`,
          description ? `Context from the PM: ${description}` : '',
          'Write the manual test steps for these designs.',
        ].filter(Boolean).join('\n'),
      });

      await send('status', 'streaming');
      const claudeStream = claudeClient(apiKey).beta.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 64000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: 'high', format: betaZodOutputFormat(GeneratedStepsSchema) },
        system:
          'You are an expert QA engineer. From the design frames provided, write a thorough list of manual test steps covering UI checks, interactions and edge cases. ' +
          'Each step has one clear action and an observable expected result. Set frameId to the ID of the frame the step is based on, and area to a short feature-area label such as "Auth" or "Checkout".',
        messages: [{ role: 'user', content }],
      });

      // Emit each step object as soon as it is complete in the streamed JSON.
      let text = '';
      let scanFrom = 0;
      for await (const event of claudeStream) {
        if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
        text += event.delta.text;
        const objectPattern = /\{[^{}]*\}/g;
        objectPattern.lastIndex = scanFrom;
        let match: RegExpExecArray | null;
        while ((match = objectPattern.exec(text))) {
          scanFrom = objectPattern.lastIndex;
          try {
            await emitStep(JSON.parse(match[0]));
          } catch {
            // Braces inside a string can produce a fragment; the final parse below catches up.
          }
        }
      }

      const final = await claudeStream.finalMessage();
      assertUsableStop(final.stop_reason);
      // Catch any step the incremental scan missed.
      const all = GeneratedStepsSchema.safeParse(JSON.parse(text || '{}'));
      if (all.success) for (const step of all.data.steps) await emitStep(step);

      await send('status', 'review');
    } catch (error) {
      console.error('generate_steps error:', error);
      await send('error', claudeErrorMessage(error));
    } finally {
      await writer.close();
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
