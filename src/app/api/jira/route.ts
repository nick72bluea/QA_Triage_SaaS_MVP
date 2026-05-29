import { NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bugs, accountId } = body;

    if (!bugs || !Array.isArray(bugs)) {
      return NextResponse.json({ error: 'Invalid data format.' }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json({ error: 'Missing accountId.' }, { status: 400 });
    }

    // 1. Fetch the API keys from the account-specific settings doc
    const settingsRef = doc(db, 'accounts', accountId, 'settings', 'workspace');
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      return NextResponse.json(
        { error: 'Workspace settings not configured. Please complete setup in the Admin Dashboard.' }, 
        { status: 400 }
      );
    }

    const settings = settingsSnap.data();
    const { openAiKey, jiraDomain, jiraEmail, jiraToken, jiraProjectKey } = settings;

    // Validate that all required keys are actually filled out
    if (!openAiKey || !jiraDomain || !jiraEmail || !jiraToken || !jiraProjectKey) {
      return NextResponse.json(
        { error: 'Missing API keys. Please complete the Jira and AI configuration in Settings.' }, 
        { status: 400 }
      );
    }

    const createdTickets = [];

    // Loop through each approved bug and process it
    for (const bug of bugs) {
      
      // 2. Send the raw data to OpenAI for formatting
      const aiPrompt = `
        You are an expert QA Engineer. Take these rough tester notes and format them into a professional bug report.
        Use formatting like "Steps to Reproduce", "Expected Result", and "Actual Result". Keep it concise.
        
        Action Taken: ${bug.action}
        Expected: ${bug.expectedResult}
        Tester Notes: ${bug.notes}
        Environment: ${bug.environment || 'Not specified'}
      `;

      let cleanDescription = bug.notes; // Fallback to raw notes if AI fails

      try {
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Use the dynamic key from the database!
            'Authorization': `Bearer ${openAiKey}` 
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: aiPrompt }],
            temperature: 0.3
          })
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          cleanDescription = aiData.choices[0].message.content;
        } else {
          console.warn("AI formatting failed, using raw notes.");
        }
      } catch (e) {
        console.warn("OpenAI API call failed. Using raw notes.", e);
      }

      // Append evidence URLs to the description if they exist
      if (bug.evidenceUrls && bug.evidenceUrls.length > 0) {
        cleanDescription += `\n\n*Evidence Attachments:*\n${bug.evidenceUrls.join('\n')}`;
      }

      // 3. Push the formatted bug to Jira
      const jiraPayload = {
        fields: {
          project: { key: jiraProjectKey },
          summary: `[UAT Bug] ${bug.projectName}: ${bug.action.substring(0, 50)}...`,
          description: cleanDescription,
          issuetype: { name: "Bug" } // Adjust if your Jira uses a different default issue type name
        }
      };

      // Base64 encode the email and token for Jira's Basic Auth
      const authString = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');

      try {
        const jiraResponse = await fetch(`https://${jiraDomain}/rest/api/2/issue`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authString}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(jiraPayload)
        });

        if (jiraResponse.ok) {
          const jiraData = await jiraResponse.json();
          createdTickets.push(jiraData.key);
        } else {
          const errData = await jiraResponse.text();
          console.error("Jira API Error:", errData);
          throw new Error("Failed to create Jira ticket");
        }
      } catch (e) {
        console.error("Jira request failed", e);
        // For local UI testing without real keys, you can uncomment the line below to fake a success
        // createdTickets.push("MOCK-123");
      }
    }

    // Return success to the frontend
    return NextResponse.json({ success: true, tickets: createdTickets });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}