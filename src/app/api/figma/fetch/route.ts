import { NextResponse } from 'next/server';
import { adminBucket } from '@/lib/firebase-admin';
import { requireMember, errorResponse } from '@/lib/server-auth';
import { getAccountSecrets } from '@/lib/secrets';

// Lists the top-level frames of a Figma file and caches a PNG of each in
// Firebase Storage, so AI step generation can look at them.
// Body: { accountId, fileUrl }. Uses the workspace's Figma access token.

const MAX_FRAMES = 40;
const FRAME_TYPES = new Set(['FRAME', 'SECTION', 'COMPONENT', 'COMPONENT_SET']);

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
}

function fileKeyFrom(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]{10,})/);
  return match ? match[1] : null;
}

async function figmaGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': token } });
  if (res.status === 403 || res.status === 401) {
    throw new Error('Figma rejected the access token, or it cannot open this file. Check the token in Settings → Integrations.');
  }
  if (res.status === 404) throw new Error('Figma file not found. Check the link.');
  if (!res.ok) throw new Error(`Figma returned an error (${res.status}).`);
  return res.json() as Promise<T>;
}

export async function POST(req: Request) {
  try {
    const { fileUrl, accountId } = await req.json();
    await requireMember(req, accountId, 'member');

    const fileKey = fileKeyFrom(fileUrl);
    if (!fileKey) {
      return NextResponse.json({ error: 'That doesn’t look like a Figma file link.' }, { status: 400 });
    }

    const { figmaToken } = await getAccountSecrets(accountId);
    if (!figmaToken) {
      return NextResponse.json(
        { error: 'Figma isn’t connected. Add a Figma access token in Settings → Integrations.' },
        { status: 400 }
      );
    }

    // 1. Top-level frames from every page of the file.
    const file = await figmaGet<{ name: string; document: FigmaNode }>(`files/${fileKey}?depth=2`, figmaToken);
    const frames = (file.document.children || [])
      .flatMap((page) => page.children || [])
      .filter((node) => FRAME_TYPES.has(node.type))
      .slice(0, MAX_FRAMES);
    if (frames.length === 0) {
      return NextResponse.json({ error: 'No frames found at the top level of this file.' }, { status: 400 });
    }

    // 2. Ask Figma to render each frame as a PNG.
    const ids = frames.map((f) => f.id).join(',');
    const renders = await figmaGet<{ images: Record<string, string | null> }>(
      `images/${fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=1`,
      figmaToken
    );

    // 3. Cache each render in this workspace's Storage folder.
    const bucket = adminBucket();
    const cached = await Promise.all(
      frames.map(async (frame) => {
        const renderUrl = renders.images[frame.id];
        if (!renderUrl) return null;
        const image = await fetch(renderUrl);
        if (!image.ok) return null;

        const path = `accounts/${accountId}/figma/${fileKey}/${frame.id.replace(/[^a-zA-Z0-9-]/g, '_')}.png`;
        const downloadToken = crypto.randomUUID();
        await bucket.file(path).save(Buffer.from(await image.arrayBuffer()), {
          contentType: 'image/png',
          metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
        });
        return {
          id: frame.id,
          name: frame.name,
          imageUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`,
        };
      })
    );

    return NextResponse.json({ fileName: file.name, frames: cached.filter(Boolean) });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Figma')) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return errorResponse(err);
  }
}
