import { AIDraftedTicket } from '@/types';

interface StreamCallbacks {
  onTicketStarted: (id: string) => void;
  onTicketReady: (id: string, draft: any) => void;
  onTicketError: (id: string, error: string) => void;
  onDone: () => void;
}

export async function streamDrafts(
  tickets: any[],
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch('/api/draft-tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickets }),
  });

  if (!res.body) throw new Error('No response stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events — split on double newline
    const events = buffer.split('\n\n');
    buffer = events.pop() || ''; // keep incomplete event in buffer

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue;
      const lines = eventBlock.split('\n');
      const eventType = lines.find(l => l.startsWith('event:'))?.slice(7).trim();
      const dataLine = lines.find(l => l.startsWith('data:'))?.slice(6).trim();
      if (!eventType || !dataLine) continue;

      try {
        const data = JSON.parse(dataLine);
        if (eventType === 'ticket-started') callbacks.onTicketStarted(data.id);
        if (eventType === 'ticket-ready') callbacks.onTicketReady(data.id, data.draft);
        if (eventType === 'ticket-error') callbacks.onTicketError(data.id, data.error);
        if (eventType === 'done') callbacks.onDone();
      } catch (e) {
        console.error('Failed to parse SSE data', e);
      }
    }
  }
}

export async function refineDraft(draft: AIDraftedTicket, refinement: string): Promise<AIDraftedTicket> {
  const res = await fetch('/api/refine-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, refinement }),
  });
  
  if (!res.ok) {
    throw new Error('Failed to refine draft');
  }

  const data = await res.json();
  return data.draft;
}