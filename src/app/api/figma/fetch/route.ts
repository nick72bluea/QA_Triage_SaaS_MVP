import { NextResponse } from 'next/server';
import { decryptToken } from '@/lib/figma-crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initAdmin } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { fileUrl } = await request.json();
    
    // Extract file key from URL (e.g., https://www.figma.com/file/abc123XYZ/...)
    const match = fileUrl.match(/file\/([a-zA-Z0-9]{22,})/);
    if (!match) return NextResponse.json({ error: 'Invalid Figma URL' }, { status: 400 });
    const fileKey = match[1];

    initAdmin();
    const db = getFirestore();
    const bucket = getStorage().bucket();

    // 1. Get decrypted token
    const integrationDoc = await db.doc(`workspaces/default_workspace/integrations/figma`).get();
    if (!integrationDoc.exists) return NextResponse.json({ error: 'Figma not connected' }, { status: 401 });
    const accessToken = decryptToken(integrationDoc.data()!.accessToken);

    // 2. Fetch Document Tree to get Top Level Frames
    const treeRes = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=2`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!treeRes.ok) throw new Error('Failed to fetch Figma document');
    const treeData = await treeRes.json();
    
    const topLevelFrames = treeData.document.children[0].children.filter((c: any) => c.type === 'FRAME' || c.type === 'SECTION');
    const frameIds = topLevelFrames.map((f: any) => f.id).join(',');

    // 3. Request Image Renders from Figma
    const imgRes = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${frameIds}&format=jpg&scale=2`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const imgData = await imgRes.json();

    // 4. Cache Images to Firebase Storage
    const cachedFrames = [];
    for (const frame of topLevelFrames) {
      const figmaImageUrl = imgData.images[frame.id];
      if (!figmaImageUrl) continue;

      // Download from Figma
      const imageBuffer = await fetch(figmaImageUrl).then(r => r.arrayBuffer());
      
      // Upload to Firebase Storage
      const storagePath = `figma_cache/${fileKey}/${frame.id.replace(':', '_')}.jpg`;
      const file = bucket.file(storagePath);
      await file.save(Buffer.from(imageBuffer), { contentType: 'image/jpeg' });
      await file.makePublic();
      
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      cachedFrames.push({
        id: frame.id,
        name: frame.name,
        imageUrl: publicUrl
      });
    }

    return NextResponse.json({ frames: cachedFrames, fileName: treeData.name });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}