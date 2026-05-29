import { NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Atlassian Document Format helpers ───────────────────────────────────────
// Jira API v3 requires ADF for rich description fields.
// v2 (legacy cloud) accepts plain text in the description field.
// We try v3 first (ADF) and fall back to v2 (plain text) on 400/404.

function adfDoc(...content: any[]) {
  return { version: 1, type: 'doc', content };
}

function adfHeading(level: 1 | 2 | 3, text: string) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function adfParagraph(text: string) {
  return {
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : [],
  };
}

function adfBulletList(items: string[]) {
  return {
    type: 'bulletList',
    content: items.map(item => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
    })),
  };
}

function adfOrderedList(items: string[]) {
  return {
    type: 'orderedList',
    content: items.map(item => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
    })),
  };
}

function adfRule() {
  return { type: 'rule' };
}

// Strip inline citation markers like [c1], [c2] from AI-generated text
function stripCitations(text: string): string {
  return text.replace(/\[c\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

interface EnvironmentEntry {
  device: string;
  os: string;
  browser: string;
  affected: boolean;
  testerCount: number;
}

interface AIDraftedTicket {
  id: string;
  title: string;
  description: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  severity: string;
  severityReasoning: string;
  environment: EnvironmentEntry[];
  evidenceUrls: string[];
  platform?: string;
}

// Build the ADF description body from a drafted ticket
function buildAdfDescription(ticket: AIDraftedTicket) {
  const nodes: any[] = [];

  // Summary
  if (ticket.description) {
    nodes.push(adfParagraph(stripCitations(ticket.description)));
  }

  // Steps to reproduce
  if (ticket.stepsToReproduce?.length) {
    nodes.push(adfHeading(3, 'Steps to Reproduce'));
    nodes.push(adfOrderedList(ticket.stepsToReproduce));
  }

  // Expected / Actual
  if (ticket.expectedBehavior) {
    nodes.push(adfHeading(3, 'Expected Behaviour'));
    nodes.push(adfParagraph(stripCitations(ticket.expectedBehavior)));
  }
  if (ticket.actualBehavior) {
    nodes.push(adfHeading(3, 'Actual Behaviour'));
    nodes.push(adfParagraph(stripCitations(ticket.actualBehavior)));
  }

  // Environment
  const affectedEnvs = ticket.environment?.filter(e => e.affected);
  if (affectedEnvs?.length) {
    nodes.push(adfHeading(3, 'Affected Environments'));
    nodes.push(adfBulletList(
      affectedEnvs.map(e =>
        `${e.device} · ${e.os} · ${e.browser}${e.testerCount > 1 ? ` (${e.testerCount} testers)` : ''}`
      )
    ));
  }

  // Evidence
  if (ticket.evidenceUrls?.length) {
    nodes.push(adfHeading(3, 'Evidence'));
    nodes.push(adfBulletList(ticket.evidenceUrls));
  }

  // Severity reasoning (AI footnote)
  if (ticket.severityReasoning) {
    nodes.push(adfRule());
    nodes.push(adfParagraph(`Severity reasoning: ${stripCitations(ticket.severityReasoning)}`));
  }

  return adfDoc(...nodes);
}

// Fallback plain-text description for Jira API v2
function buildPlainDescription(ticket: AIDraftedTicket): string {
  const lines: string[] = [];

  if (ticket.description) lines.push(stripCitations(ticket.description), '');

  if (ticket.stepsToReproduce?.length) {
    lines.push('*Steps to Reproduce*');
    ticket.stepsToReproduce.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }

  if (ticket.expectedBehavior) {
    lines.push('*Expected Behaviour*', stripCitations(ticket.expectedBehavior), '');
  }
  if (ticket.actualBehavior) {
    lines.push('*Actual Behaviour*', stripCitations(ticket.actualBehavior), '');
  }

  const affectedEnvs = ticket.environment?.filter(e => e.affected);
  if (affectedEnvs?.length) {
    lines.push('*Affected Environments*');
    affectedEnvs.forEach(e =>
      lines.push(`- ${e.device} · ${e.os} · ${e.browser}${e.testerCount > 1 ? ` (${e.testerCount} testers)` : ''}`)
    );
    lines.push('');
  }

  if (ticket.evidenceUrls?.length) {
    lines.push('*Evidence*');
    ticket.evidenceUrls.forEach(url => lines.push(`- ${url}`));
    lines.push('');
  }

  return lines.join('\n').trim();
}

// Map our severity labels to Jira priority names
function toJiraPriority(severity: string): string {
  switch (severity) {
    case 'Critical': return 'Highest';
    case 'High':     return 'High';
    case 'Medium':   return 'Medium';
    case 'Low':      return 'Low';
    default:         return 'Low';
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tickets, accountId } = body as { tickets: AIDraftedTicket[]; accountId: string };

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
      return NextResponse.json({ error: 'No tickets provided.' }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json({ error: 'Missing accountId.' }, { status: 400 });
    }

    // Load workspace Jira settings from Firestore
    const settingsRef = doc(db, 'accounts', accountId, 'settings', 'workspace');
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      return NextResponse.json(
        { error: 'Workspace settings not found.' },
        { status: 400 }
      );
    }

    const settings = settingsSnap.data();
    const { jiraUrl, jiraEmail, jiraToken, jiraProjectKey } = settings;

    if (!jiraUrl || !jiraEmail || !jiraToken || !jiraProjectKey) {
      return NextResponse.json(
        { error: 'Jira is not fully configured. Please fill in the Jira URL, email, API token, and project key in Settings → Integrations.' },
        { status: 400 }
      );
    }

    // Normalise the domain — strip https:// if the user pasted the full URL
    const domain = jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}`;

    const results: { id: string; success: boolean; jiraKey?: string; jiraUrl?: string; error?: string }[] = [];

    for (const ticket of tickets) {
      try {
        // Try Jira API v3 first (ADF description)
        const adfDescription = buildAdfDescription(ticket);

        const payload = {
          fields: {
            project:     { key: jiraProjectKey },
            summary:     ticket.title,
            description: adfDescription,
            issuetype:   { name: 'Bug' },
            priority:    { name: toJiraPriority(ticket.severity) },
            labels:      ['uat', 'proofdeck'],
          },
        };

        let jiraRes = await fetch(`https://${domain}/rest/api/3/issue`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        // Fall back to API v2 with plain-text description if v3 fails
        if (!jiraRes.ok && (jiraRes.status === 400 || jiraRes.status === 404)) {
          const v2Payload = {
            fields: {
              project:     { key: jiraProjectKey },
              summary:     ticket.title,
              description: buildPlainDescription(ticket),
              issuetype:   { name: 'Bug' },
              priority:    { name: toJiraPriority(ticket.severity) },
            },
          };
          jiraRes = await fetch(`https://${domain}/rest/api/2/issue`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(v2Payload),
          });
        }

        if (jiraRes.ok) {
          const jiraData = await jiraRes.json();
          results.push({
            id:      ticket.id,
            success: true,
            jiraKey: jiraData.key,
            jiraUrl: `https://${domain}/browse/${jiraData.key}`,
          });
        } else {
          const errText = await jiraRes.text();
          console.error(`Jira error for ticket ${ticket.id}:`, jiraRes.status, errText);
          results.push({
            id:      ticket.id,
            success: false,
            error:   `Jira returned ${jiraRes.status}`,
          });
        }
      } catch (err: any) {
        console.error(`Failed to push ticket ${ticket.id}:`, err);
        results.push({ id: ticket.id, success: false, error: err.message });
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('push-to-jira error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
