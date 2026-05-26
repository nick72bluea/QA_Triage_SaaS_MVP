"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHead } from '@/components/PageHead';

export default function WorkspaceSettings() {
  const router = useRouter();

  // Hydration-safe flag — gates anything that depends on browser-only state
  // so SSR HTML matches first client render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  // ─── FORM STATE ───
  const [initialData, setInitialData] = useState({
    workspaceName: 'QA Triage Agency',
    timezone: 'Europe/London (GMT+0)',
    supportEmail: 'qa@yourcompany.com',
    jiraUrl: 'yourcompany.atlassian.net',
    jiraEmail: 'qa-bot@yourcompany.com',
    jiraToken: '',
    aiProvider: 'Anthropic · Claude Sonnet 4.5',
    aiToken: '',
    maxSpend: '50',
    notifyDigest: true,
    notifyAlerts: true,
    notifyComplete: true,
    notifyStuck: false,
    notifyWeekly: false,
    brandColor: '#2d4a3e',
  });

  const [formData, setFormData] = useState(initialData);

  // ─── UI STATES ───
  const [activeSection, setActiveSection] = useState('identity');
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [showAiToken, setShowAiToken] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Mock Figma connection state — in production, fetch from
  // `workspaces/{id}/figma/connection` doc.
  const [figmaConnection] = useState<{
    connected: boolean;
    fileName?: string;
    fileKey?: string;
    frameCount?: number;
    lastSyncedAt?: Date;
  }>({
    connected: false,
  });

  // Mock AI usage stats — in production, aggregate from a usage collection.
  const aiUsage = useMemo(() => ({
    requestsThisMonth: 247,
    estimatedCostUsd: 18.42,
    breakdown: [
      { feature: 'Jira drafting', requests: 142, costUsd: 8.20 },
      { feature: 'Step generation', requests: 87, costUsd: 9.15 },
      { feature: 'Step refinement', requests: 18, costUsd: 1.07 },
    ],
    monthlyBudgetUsd: parseFloat(formData.maxSpend) || 0,
  }), [formData.maxSpend]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  // ─── DIRTY TRACKING FOR SAVE BAR ───
  const changedSections: string[] = [];
  if (
    formData.workspaceName !== initialData.workspaceName ||
    formData.timezone !== initialData.timezone ||
    formData.supportEmail !== initialData.supportEmail
  ) changedSections.push('Workspace identity');
  if (
    formData.jiraUrl !== initialData.jiraUrl ||
    formData.jiraEmail !== initialData.jiraEmail ||
    formData.jiraToken !== initialData.jiraToken
  ) changedSections.push('Integrations');
  if (
    formData.aiProvider !== initialData.aiProvider ||
    formData.aiToken !== initialData.aiToken ||
    formData.maxSpend !== initialData.maxSpend
  ) changedSections.push('AI Configuration');
  if (
    formData.notifyDigest !== initialData.notifyDigest ||
    formData.notifyAlerts !== initialData.notifyAlerts ||
    formData.notifyComplete !== initialData.notifyComplete ||
    formData.notifyStuck !== initialData.notifyStuck ||
    formData.notifyWeekly !== initialData.notifyWeekly
  ) changedSections.push('Notifications');
  if (formData.brandColor !== initialData.brandColor) changedSections.push('Branding');

  const isDirty = changedSections.length > 0;

  const handleSave = () => {
    // In production: POST to `/api/workspace/settings`, await success, then update.
    setInitialData(formData);
    showToast('Settings saved');
  };

  const handleDiscard = () => {
    setFormData(initialData);
  };

  // ─── SCROLL SPY ───
  // Only attaches once hydrated to avoid SSR window references.
  useEffect(() => {
    if (!hydrated) return;

    const handleScroll = () => {
      const scrollPos = window.scrollY + 140;
      const sections = ['identity', 'integrations', 'ai', 'team', 'notifications', 'webhooks', 'branding', 'audit', 'danger'];
      let currentId = sections[0];
      for (const s of sections) {
        const el = document.getElementById(s);
        if (el && el.offsetTop <= scrollPos) currentId = s;
      }
      setActiveSection(currentId);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hydrated]);

  const scrollToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
  };

  // ─── ⌘S / Ctrl+S TO SAVE ───
  useEffect(() => {
    if (!hydrated) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hydrated, isDirty, formData]);

  // ─── DATE FORMATTER (locale-stable) ───
  const formatDate = (date: Date | undefined): string => {
    if (!hydrated || !date) return '—';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </div>
          <div className="brand-name">QA Triage</div>
        </div>
        <nav className="nav">
          <a className="nav-item" onClick={() => router.push('/home')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Home
          </a>
          <a className="nav-item" onClick={() => router.push('/admin')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/></svg>
            Project Admin
          </a>
          <a className="nav-item" onClick={() => router.push('/pm')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>
            Triage Board
          </a>
          <a className="nav-item" onClick={() => router.push('/scripts')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
            Scripts
          </a>
          <a className="nav-item active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/></svg>
            Workspace Settings
          </a>
        </nav>
        <div className="sidebar-foot">
          <div className="user-card">
            <div className="avatar">JD</div>
            <div>
              <div className="user-name">John Doe</div>
              <div className="user-role">Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        {/* SECTION NAV */}
        <aside className="section-nav">
          <div className="section-nav-label">On this page</div>
          <nav className="section-nav-list">
            <a className={`section-nav-item ${activeSection === 'identity' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'identity')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              Workspace identity
            </a>
            <a className={`section-nav-item ${activeSection === 'integrations' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'integrations')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/></svg>
              Integrations
            </a>
            <a className={`section-nav-item ${activeSection === 'ai' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'ai')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              AI Configuration
            </a>
            <a className={`section-nav-item ${activeSection === 'team' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'team')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Team & Permissions
            </a>
            <a className={`section-nav-item ${activeSection === 'notifications' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'notifications')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
              Notifications
            </a>
            <a className={`section-nav-item ${activeSection === 'webhooks' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'webhooks')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Webhooks
            </a>
            <a className={`section-nav-item ${activeSection === 'branding' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'branding')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.5-9-10-9z"/></svg>
              Branding
            </a>
            <div className="section-nav-divider"></div>
            <a className={`section-nav-item ${activeSection === 'audit' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'audit')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Audit Log
            </a>
            <a className={`section-nav-item danger-link ${activeSection === 'danger' ? 'active' : ''}`} onClick={(e) => scrollToSection(e, 'danger')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Danger Zone
            </a>
          </nav>
        </aside>

        {/* CONTENT */}
        <div className="content">
          <PageHead
            eyebrow={['Workspace', 'Settings']}
            title={<>Workspace <em>settings</em></>}
            sub="Configure how your agency works — integrations, AI, team, notifications, and more."
          />

          {/* WORKSPACE IDENTITY (was: General) */}
          <section className="section" id="identity">
            <div className="section-head">
              <h2 className="section-title">Workspace identity</h2>
              <p className="section-description">Basic information about your agency workspace. Shown in emails and tester dashboards.</p>
            </div>
            <div className="section-card">
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">Workspace name <span className="req">Required</span></div>
                  <div className="field-label-desc">Displayed in emails, tester dashboards, and exported reports.</div>
                </div>
                <div className="field-input">
                  <input className="input" type="text" value={formData.workspaceName} onChange={e => setFormData({ ...formData, workspaceName: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">Default timezone</div>
                  <div className="field-label-desc">Used for scheduling, reminders, and timestamps in reports.</div>
                </div>
                <div className="field-input">
                  <select className="input select" value={formData.timezone} onChange={e => setFormData({ ...formData, timezone: e.target.value })}>
                    <option>Europe/London (GMT+0)</option>
                    <option>America/New_York (GMT-5)</option>
                    <option>America/Los_Angeles (GMT-8)</option>
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">Support email</div>
                  <div className="field-label-desc">Testers will see this address in invitations and can reply for help.</div>
                </div>
                <div className="field-input">
                  <input className="input" type="email" value={formData.supportEmail} onChange={e => setFormData({ ...formData, supportEmail: e.target.value })} />
                </div>
              </div>
            </div>
          </section>

          {/* INTEGRATIONS */}
          <section className="section" id="integrations">
            <div className="section-head">
              <h2 className="section-title">Integrations</h2>
              <p className="section-description">Connect to the tools your team already uses for bug tracking, comms, and design.</p>
            </div>

            {/* JIRA */}
            <div className="section-card" style={{ marginBottom: 16 }}>
              <div className="integration-head">
                <div className="integration-logo jira">J</div>
                <div className="integration-meta">
                  <h3>Jira Software</h3>
                  <p>Push verified bugs directly to your Atlassian backlog.</p>
                </div>
                <span className="conn-status connected">Connected</span>
              </div>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">Workspace URL</div>
                  <div className="field-label-desc">Your company&apos;s Atlassian subdomain.</div>
                </div>
                <div className="field-input">
                  <div className="input-prefix">
                    <span className="prefix">https://</span>
                    <input type="text" value={formData.jiraUrl} onChange={e => setFormData({ ...formData, jiraUrl: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">Service account email</div>
                </div>
                <div className="field-input">
                  <input className="input" type="email" value={formData.jiraEmail} onChange={e => setFormData({ ...formData, jiraEmail: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">API token</div>
                  <div className="field-label-desc">Kept encrypted at rest.</div>
                </div>
                <div className="field-input">
                  <div className="input-with-action">
                    <input className="input" type={showJiraToken ? 'text' : 'password'} placeholder="••••••••••••••••••••••••" value={formData.jiraToken} onChange={e => setFormData({ ...formData, jiraToken: e.target.value })} />
                    <button className="input-action-btn" onClick={() => setShowJiraToken(!showJiraToken)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SLACK */}
            <div className="section-card" style={{ marginBottom: 16 }}>
              <div className="integration-head no-border-bottom">
                <div className="integration-logo slack">S</div>
                <div className="integration-meta">
                  <h3>Slack</h3>
                  <p>Receive alerts and daily digests in your team&apos;s channels.</p>
                </div>
                <span className="conn-status connected">Connected</span>
              </div>
              <div className="integration-foot">
                <span className="integration-foot-meta">Connected to #qa-alerts</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary">Configure channels</button>
                  <button className="btn btn-danger">Disconnect</button>
                </div>
              </div>
            </div>

            {/* FIGMA — expanded for connected/disconnected states */}
            <div className="section-card">
              <div className={`integration-head ${figmaConnection.connected ? '' : 'no-border-bottom'}`}>
                <div className="integration-logo figma">F</div>
                <div className="integration-meta">
                  <h3>Figma</h3>
                  <p>Reference design frames in scripts. Used by AI to suggest test steps grounded in your designs.</p>
                </div>
                <span className={`conn-status ${figmaConnection.connected ? 'connected' : 'disconnected'}`}>
                  {figmaConnection.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>

              {figmaConnection.connected ? (
                <>
                  <div className="field-row">
                    <div className="field-label">
                      <div className="field-label-name">Linked file</div>
                      <div className="field-label-desc">One Figma file per workspace for v1. Multi-file support is on the roadmap.</div>
                    </div>
                    <div className="field-input">
                      <div className="figma-file-card">
                        <div className="figma-file-info">
                          <div className="figma-file-name">{figmaConnection.fileName}</div>
                          <div className="figma-file-meta">
                            <span><strong>{figmaConnection.frameCount}</strong> frames</span>
                            <span className="dot">·</span>
                            <span>Synced {formatDate(figmaConnection.lastSyncedAt)}</span>
                          </div>
                        </div>
                        <button className="btn btn-secondary">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                          Resync frames
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="integration-foot">
                    <span className="integration-foot-meta">
                      Proofdeck can read any Figma file you have access to
                    </span>
                    <button className="btn btn-danger">Disconnect Figma</button>
                  </div>
                </>
              ) : (
                <div className="integration-foot">
                  <span className="integration-foot-meta">Required for AI step generation in the script builder</span>
                  <button className="btn btn-primary">Connect Figma</button>
                </div>
              )}
            </div>
          </section>

          {/* AI CONFIG */}
          <section className="section" id="ai">
            <div className="section-head">
              <h2 className="section-title">AI Configuration</h2>
              <p className="section-description">The model used for ticket drafting, step generation, and step refinement.</p>
            </div>

            {/* Provider settings */}
            <div className="section-card" style={{ marginBottom: 16 }}>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">Primary provider</div>
                  <div className="field-label-desc">Used for both Jira drafting and Script builder AI.</div>
                </div>
                <div className="field-input">
                  <select className="input select" value={formData.aiProvider} onChange={e => setFormData({ ...formData, aiProvider: e.target.value })}>
                    <option>Anthropic · Claude Sonnet 4.5</option>
                    <option>Anthropic · Claude Haiku 4.5</option>
                    <option>OpenAI · GPT-4o</option>
                    <option>Google · Gemini 1.5 Pro</option>
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">API key</div>
                  <div className="field-label-desc">Encrypted at rest.</div>
                </div>
                <div className="field-input">
                  <div className="input-with-action">
                    <input className="input" type={showAiToken ? 'text' : 'password'} placeholder="sk-ant-••••••••••••••••••••••••" value={formData.aiToken} onChange={e => setFormData({ ...formData, aiToken: e.target.value })} />
                    <button className="input-action-btn" onClick={() => setShowAiToken(!showAiToken)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">Monthly budget</div>
                  <div className="field-label-desc">AI features pause when usage approaches this limit. You&apos;ll get a warning at 80%.</div>
                </div>
                <div className="field-input">
                  <div className="input-prefix" style={{ maxWidth: 200 }}>
                    <span className="prefix">USD $</span>
                    <input type="number" value={formData.maxSpend} onChange={e => setFormData({ ...formData, maxSpend: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            {/* USAGE STATS — new */}
            <div className="section-card usage-card">
              <div className="usage-head">
                <div>
                  <h3 className="usage-title">Usage this month</h3>
                  <p className="usage-sub">Resets on the 1st. Estimated, not billed — actual API charges come from your provider.</p>
                </div>
                <div className="usage-totals">
                  <div className="usage-total">
                    <div className="usage-total-label">Requests</div>
                    <div className="usage-total-val">{aiUsage.requestsThisMonth}</div>
                  </div>
                  <div className="usage-total">
                    <div className="usage-total-label">Estimated cost</div>
                    <div className="usage-total-val">${aiUsage.estimatedCostUsd.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="usage-budget">
                <div className="usage-budget-row">
                  <span className="usage-budget-label">
                    <strong>${aiUsage.estimatedCostUsd.toFixed(2)}</strong> of <strong>${aiUsage.monthlyBudgetUsd.toFixed(2)}</strong> budget
                  </span>
                  <span className="usage-budget-pct">{Math.round((aiUsage.estimatedCostUsd / aiUsage.monthlyBudgetUsd) * 100)}%</span>
                </div>
                <div className="usage-budget-bar">
                  <div
                    className="usage-budget-fill"
                    style={{ width: `${Math.min((aiUsage.estimatedCostUsd / aiUsage.monthlyBudgetUsd) * 100, 100)}%` }}
                  />
                </div>
              </div>

              <div className="usage-breakdown">
                <div className="usage-breakdown-label">Breakdown by feature</div>
                {aiUsage.breakdown.map((item) => (
                  <div className="usage-breakdown-row" key={item.feature}>
                    <div className="usage-breakdown-name">{item.feature}</div>
                    <div className="usage-breakdown-stats">
                      <span className="usage-breakdown-requests">{item.requests} requests</span>
                      <span className="usage-breakdown-cost">${item.costUsd.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* TEAM */}
          <section className="section" id="team">
            <div className="section-head">
              <div className="section-head-top">
                <h2 className="section-title">Team & Permissions</h2>
                <button className="btn btn-primary">Invite member</button>
              </div>
              <p className="section-description">Team members with access to this workspace.</p>
            </div>
            <div className="section-card">
              <div className="member-row">
                <div className="member-avatar" style={{ background: '#2d4a3e' }}>JD</div>
                <div className="member-info">
                  <div className="member-name">John Doe <span className="you-chip">You</span></div>
                  <div className="member-email">john@qatriage.com</div>
                </div>
                <select className="role-select" disabled style={{ opacity: 0.6 }}>
                  <option>Owner</option>
                </select>
                <button className="icon-ghost" disabled style={{ opacity: 0.3 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
                </button>
              </div>
              <div className="member-row">
                <div className="member-avatar" style={{ background: '#3d5a80' }}>AM</div>
                <div className="member-info">
                  <div className="member-name">Alex Morgan</div>
                  <div className="member-email">alex.m@qatriage.com</div>
                </div>
                <select className="role-select">
                  <option>Admin</option>
                  <option>Editor</option>
                </select>
                <button className="icon-ghost">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
                </button>
              </div>
            </div>
          </section>

          {/* NOTIFICATIONS */}
          <section className="section" id="notifications">
            <div className="section-head">
              <h2 className="section-title">Notifications</h2>
              <p className="section-description">Choose how and when the team gets notified about test events.</p>
            </div>
            <div className="section-card">
              <div className="toggle-row">
                <div>
                  <div className="toggle-row-label">Daily digest email <span className="chip-mini">Email</span></div>
                  <div className="toggle-row-desc">One summary per day at 9:00 local time.</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={formData.notifyDigest} onChange={e => setFormData({ ...formData, notifyDigest: e.target.checked })} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <div className="toggle-row">
                <div>
                  <div className="toggle-row-label">Real-time failure alerts <span className="chip-mini">Slack</span></div>
                  <div className="toggle-row-desc">Ping #qa-alerts the moment a tester reports a failure.</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={formData.notifyAlerts} onChange={e => setFormData({ ...formData, notifyAlerts: e.target.checked })} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </section>

          {/* WEBHOOKS */}
          <section className="section" id="webhooks">
            <div className="section-head">
              <div className="section-head-top">
                <h2 className="section-title">Webhooks</h2>
                <button className="btn btn-primary">Add webhook</button>
              </div>
            </div>
            <div className="section-card">
              <div className="webhook-row">
                <div className="webhook-url">https://hooks.yourcompany.com/qa-events</div>
                <div className="webhook-events">
                  <span className="event-chip">run.pass</span>
                  <span className="event-chip">run.fail</span>
                </div>
                <span className="conn-status connected">Active</span>
                <button className="icon-ghost">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
                </button>
              </div>
            </div>
          </section>

          {/* BRANDING */}
          <section className="section" id="branding">
            <div className="section-head">
              <h2 className="section-title">Branding</h2>
              <p className="section-description">Customise how your workspace appears to testers.</p>
            </div>
            <div className="section-card">
              <div className="brand-layout">
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <div className="field-label-name" style={{ marginBottom: 8 }}>Logo</div>
                    <div className="brand-logo-upload">
                      <div className="logo-preview">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      </div>
                      <div className="logo-upload-text">
                        <div className="upload-main">Drop a PNG or SVG</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="field-label-name" style={{ marginBottom: 4 }}>Primary colour</div>
                    <div className="color-swatches">
                      {['#2d4a3e', '#3d5a80', '#6a4a7c', '#a6421f', '#b8860b', '#1a1a1a'].map(color => (
                        <div
                          key={color}
                          className={`color-swatch ${formData.brandColor === color ? 'selected' : ''}`}
                          style={{ background: color }}
                          onClick={() => setFormData({ ...formData, brandColor: color })}
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="brand-preview-card">
                  <div className="brand-preview-label">Email preview</div>
                  <div className="brand-preview-email">
                    <div className="brand-preview-email-head">
                      <div className="brand-preview-email-logo" style={{ background: formData.brandColor }}></div>
                      <div className="brand-preview-email-title">{formData.workspaceName}</div>
                    </div>
                    Hey Sarah,<br/><br/>
                    You&apos;ve been invited to test <b style={{ color: 'var(--ink)' }}>annabels9</b>.
                    <div className="brand-preview-button" style={{ background: formData.brandColor }}>Start testing →</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* AUDIT LOG */}
          <section className="section" id="audit">
            <div className="section-head">
              <div className="section-head-top">
                <h2 className="section-title">Audit log</h2>
                <button className="btn btn-secondary">Export CSV</button>
              </div>
            </div>
            <div className="section-card">
              <div className="audit-row">
                <div className="audit-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z"/></svg></div>
                <div className="audit-text"><b>John Doe</b> updated <span className="action-name">jira.workspace_url</span></div>
                <div className="audit-time">2 min ago</div>
              </div>
            </div>
          </section>

          {/* DANGER ZONE */}
          <section className="section" id="danger">
            <div className="section-head">
              <h2 className="section-title danger-title">Danger zone</h2>
              <p className="section-description">Irreversible actions. Pause and think before you click anything here.</p>
            </div>
            <div className="danger-card">
              <div className="danger-head">
                <div className="danger-head-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <span className="danger-head-title">Proceed with caution</span>
              </div>
              <div className="field-row">
                <div className="field-label">
                  <div className="field-label-name">Delete workspace</div>
                  <div className="field-label-desc">Permanently deletes all projects, testers, scripts, and integrations.</div>
                </div>
                <div className="field-input row">
                  <button className="btn btn-danger danger-btn-solid">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                    Delete workspace
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* SAVE BAR — only renders post-hydration to avoid SSR mismatch */}
      {hydrated && (
        <div className={`save-bar ${isDirty ? 'show' : ''}`}>
          <div className="save-bar-status">
            <div className="save-bar-title">Unsaved changes</div>
            <div className="save-bar-changes">Changes in: {changedSections.join(', ')}</div>
          </div>
          <button className="btn-discard" onClick={handleDiscard}>Discard</button>
          <button className="btn-save" onClick={handleSave}>
            Save changes <kbd>⌘S</kbd>
          </button>
        </div>
      )}

      {/* TOAST */}
      {hydrated && (
        <div className={`toast ${toastMsg ? 'show' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* STYLES — styled-jsx, scoped, SSR-safe. Fonts loaded via next/font in root layout. */}
      <style jsx>{`
        .app {
          --bg: #f4f3ef; --surface: #ffffff; --surface-alt: #fafaf7;
          --ink: #1a1a1a; --ink-soft: #55524d; --ink-mute: #8a867f;
          --line: #e5e2db; --line-strong: #d4d0c7;
          --accent: #2d4a3e; --accent-soft: #e8f0eb; --accent-ink: #1d3329;
          --sidebar: #121a17; --sidebar-ink: #e5e2db; --sidebar-mute: #7a7a72;
          --pass: #4a7c59; --pass-soft: #e8f0eb;
          --fail: #a6421f; --fail-soft: #f7e8e2;
          --warn: #b8860b; --warn-soft: #f9f0da;
          --info: #3d5a80; --info-soft: #e5ecf2;
          --ai: #7c4dff; --ai-soft: #ede5ff; --ai-deep: #5a32d9;
          --rose-soft: rgba(166,66,31,0.1);

          display: grid;
          grid-template-columns: 240px 1fr;
          min-height: 100vh;
          background: var(--bg);
          font-family: 'IBM Plex Sans', system-ui, sans-serif;
          color: var(--ink);
          font-size: 14px;
          -webkit-font-smoothing: antialiased;
        }
        .app :global(*) { box-sizing: border-box; }

        /* SIDEBAR */
        .sidebar { background: var(--sidebar); color: var(--sidebar-ink); display: flex; flex-direction: column; padding: 20px 16px; position: sticky; top: 0; height: 100vh; }
        .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 16px; }
        .brand-mark { width: 32px; height: 32px; background: var(--accent); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #fff; }
        .brand-name { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
        .nav { display: flex; flex-direction: column; gap: 2px; }
        .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; color: var(--sidebar-mute); text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
        .nav-item:hover { color: var(--sidebar-ink); background: rgba(255,255,255,0.04); }
        .nav-item.active { background: rgba(255,255,255,0.08); color: var(--sidebar-ink); }
        .sidebar-foot { margin-top: auto; }
        .user-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.04); border-radius: 6px; }
        .avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #fff; }
        .user-name { font-size: 13px; font-weight: 500; color: var(--sidebar-ink); }
        .user-role { font-size: 10px; color: var(--sidebar-mute); font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; }

        /* MAIN LAYOUT */
        .main { display: grid; grid-template-columns: 220px 1fr; max-width: 1280px; }

        /* SECTION NAV */
        .section-nav { padding: 40px 16px 40px 24px; position: sticky; top: 0; height: 100vh; overflow-y: auto; border-right: 1px solid var(--line); }
        .section-nav-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 12px; font-weight: 500; padding: 0 8px; }
        .section-nav-list { display: flex; flex-direction: column; gap: 1px; }
        .section-nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; color: var(--ink-soft); text-decoration: none; border-radius: 5px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; position: relative; }
        .section-nav-item:hover { background: var(--surface); color: var(--ink); }
        .section-nav-item.active { background: var(--surface); color: var(--accent); box-shadow: inset 2px 0 0 var(--accent); padding-left: 12px; }
        .section-nav-item :global(svg) { flex-shrink: 0; opacity: 0.6; }
        .section-nav-item.active :global(svg) { opacity: 1; }
        .section-nav-item.danger-link { color: var(--fail); }
        .section-nav-item.danger-link.active { color: var(--fail); box-shadow: inset 2px 0 0 var(--fail); }
        .section-nav-divider { height: 1px; background: var(--line); margin: 10px 8px; }

        /* CONTENT */
        .content { padding: 40px 48px 140px; max-width: 880px; width: 100%; }
        .section { margin-bottom: 48px; scroll-margin-top: 24px; }
        .section-head { margin-bottom: 20px; }
        .section-head-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 4px; }
        .section-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 6px; }
        .section-title.danger-title { color: var(--fail); }
        .section-description { color: var(--ink-mute); font-size: 13px; margin: 0; line-height: 1.5; }
        .section-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }

        /* FIELD ROW */
        .field-row { display: grid; grid-template-columns: 260px 1fr; gap: 32px; padding: 20px 24px; border-bottom: 1px solid var(--line); align-items: flex-start; }
        .field-row:last-child { border-bottom: none; }
        .field-label { padding-top: 8px; }
        .field-label-name { font-size: 13px; font-weight: 500; color: var(--ink); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
        .field-label-name .req { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--fail); text-transform: uppercase; letter-spacing: 0.08em; }
        .field-label-desc { font-size: 12px; color: var(--ink-mute); line-height: 1.5; }
        .field-input { display: flex; flex-direction: column; gap: 8px; position: relative; }
        .field-input.row { flex-direction: row; align-items: center; }

        .input { width: 100%; height: 38px; padding: 0 12px; font-family: inherit; font-size: 13px; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 6px; transition: all 0.15s ease; }
        .input::placeholder { color: var(--ink-mute); }
        .input:hover { border-color: #b8b3a8; }
        .input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.12); }
        .input-prefix { display: flex; align-items: stretch; border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; transition: all 0.15s ease; background: var(--surface); }
        .input-prefix:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.12); }
        .input-prefix .prefix { padding: 0 12px; display: flex; align-items: center; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-mute); background: var(--surface-alt); border-right: 1px solid var(--line); }
        .input-prefix input { flex: 1; height: 36px; padding: 0 12px; border: none; font-family: inherit; font-size: 13px; color: var(--ink); background: transparent; }
        .input-prefix input:focus { outline: none; }
        .input-with-action { position: relative; display: flex; align-items: center; }
        .input-with-action input { padding-right: 40px; }
        .input-action-btn { position: absolute; right: 6px; width: 28px; height: 28px; border: none; background: transparent; border-radius: 4px; color: var(--ink-mute); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .input-action-btn:hover { background: var(--surface-alt); color: var(--ink); }
        .select { appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2355524d' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; cursor: pointer; }

        /* INTEGRATION CARDS */
        .integration-head { display: grid; grid-template-columns: 44px 1fr auto; gap: 14px; align-items: center; padding: 18px 24px; background: var(--surface-alt); border-bottom: 1px solid var(--line); }
        .integration-head.no-border-bottom { border-bottom: none; }
        .integration-logo { width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px; color: #fff; }
        .integration-logo.jira { background: #0052cc; }
        .integration-logo.slack { background: linear-gradient(135deg, #4a154b 0%, #e01e5a 100%); }
        .integration-logo.figma { background: linear-gradient(135deg, #f24e1e 0%, #a259ff 100%); }
        .integration-meta h3 { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; margin: 0 0 2px; letter-spacing: -0.01em; }
        .integration-meta p { font-size: 12px; color: var(--ink-mute); margin: 0; line-height: 1.4; }
        .conn-status { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500; }
        .conn-status.connected { background: var(--pass-soft); color: var(--pass); }
        .conn-status.connected::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--pass); box-shadow: 0 0 8px var(--pass); }
        .conn-status.disconnected { background: var(--surface); color: var(--ink-mute); border: 1px solid var(--line); }
        .conn-status.disconnected::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--ink-mute); }
        .integration-foot { padding: 14px 24px; background: var(--surface-alt); border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 14px; }
        .integration-foot-meta { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; }

        /* FIGMA file card — connected state */
        .figma-file-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 12px 14px;
          background: var(--surface-alt);
          border: 1px solid var(--line);
          border-radius: 8px;
        }
        .figma-file-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 2px;
        }
        .figma-file-meta {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--ink-mute);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .figma-file-meta strong { color: var(--ai); font-weight: 700; }
        .figma-file-meta .dot { opacity: 0.5; }

        /* AI USAGE CARD — new */
        .usage-card {
          padding: 0;
        }
        .usage-head {
          padding: 18px 24px;
          background: linear-gradient(180deg, var(--surface) 0%, var(--ai-soft) 240%);
          border-bottom: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }
        .usage-title {
          font-family: 'Fraunces', serif;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -0.01em;
          margin: 0 0 4px;
        }
        .usage-sub {
          font-size: 12px;
          color: var(--ink-mute);
          margin: 0;
          max-width: 380px;
          line-height: 1.45;
        }
        .usage-totals {
          display: flex;
          gap: 24px;
          flex-shrink: 0;
        }
        .usage-total {
          text-align: right;
        }
        .usage-total-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--ink-mute);
          font-weight: 600;
          margin-bottom: 3px;
        }
        .usage-total-val {
          font-family: 'Fraunces', serif;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.015em;
          color: var(--ai);
          line-height: 1;
        }

        .usage-budget {
          padding: 16px 24px;
          background: var(--surface-alt);
          border-bottom: 1px solid var(--line);
        }
        .usage-budget-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 12px;
          color: var(--ink-soft);
        }
        .usage-budget-label strong { color: var(--ink); font-weight: 600; }
        .usage-budget-pct {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          color: var(--ai);
        }
        .usage-budget-bar {
          height: 6px;
          background: var(--line);
          border-radius: 999px;
          overflow: hidden;
        }
        .usage-budget-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--ai) 0%, var(--ai-deep) 100%);
          border-radius: 999px;
          transition: width 0.3s cubic-bezier(.2,.6,.2,1);
        }

        .usage-breakdown { padding: 14px 24px 18px; }
        .usage-breakdown-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--ink-mute);
          font-weight: 600;
          margin-bottom: 10px;
        }
        .usage-breakdown-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px dashed var(--line);
        }
        .usage-breakdown-row:last-child { border-bottom: none; }
        .usage-breakdown-name { font-size: 13px; font-weight: 500; color: var(--ink); }
        .usage-breakdown-stats { display: flex; gap: 16px; align-items: baseline; }
        .usage-breakdown-requests { font-size: 12px; color: var(--ink-mute); font-family: 'JetBrains Mono', monospace; }
        .usage-breakdown-cost {
          font-family: 'Fraunces', serif;
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          letter-spacing: -0.01em;
          min-width: 56px;
          text-align: right;
        }

        /* BUTTONS */
        .btn { height: 36px; padding: 0 14px; font-family: inherit; font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer; transition: all 0.15s ease; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
        .btn-primary { background: var(--accent); color: #fff; }
        .btn-primary:hover { background: var(--accent-ink); }
        .btn-secondary { background: var(--surface); border-color: var(--line-strong); color: var(--ink-soft); }
        .btn-secondary:hover { background: var(--surface-alt); color: var(--ink); }
        .btn-danger { background: var(--surface); border-color: rgba(166,66,31,0.3); color: var(--fail); }
        .btn-danger:hover { background: var(--fail-soft); border-color: var(--fail); }
        .danger-btn-solid { background: var(--fail); color: #fff; border-color: var(--fail); }
        .danger-btn-solid:hover { background: #8a3618; border-color: #8a3618; }

        /* TOGGLE */
        .toggle { position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; }
        .toggle input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; inset: 0; background: var(--line-strong); transition: 0.2s cubic-bezier(.2,.6,.2,1); border-radius: 999px; }
        .toggle-slider::before { position: absolute; content: ''; height: 16px; width: 16px; left: 3px; top: 3px; background: var(--surface); border-radius: 50%; transition: 0.2s cubic-bezier(.2,.6,.2,1); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .toggle input:checked + .toggle-slider { background: var(--accent); }
        .toggle input:checked + .toggle-slider::before { transform: translateX(16px); }
        .toggle-row { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; padding: 16px 24px; border-bottom: 1px solid var(--line); }
        .toggle-row:last-child { border-bottom: none; }
        .toggle-row-label { font-size: 13px; font-weight: 500; color: var(--ink); margin-bottom: 3px; display: flex; align-items: center; gap: 8px; }
        .toggle-row-desc { font-size: 12px; color: var(--ink-mute); line-height: 1.5; }
        .toggle-row-label .chip-mini { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; padding: 1px 6px; background: var(--info-soft); color: var(--info); border-radius: 3px; }

        /* TEAM ROWS */
        .member-row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 14px; align-items: center; padding: 14px 24px; border-bottom: 1px solid var(--line); }
        .member-row:last-child { border-bottom: none; }
        .member-avatar { width: 36px; height: 36px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; }
        .member-info { min-width: 0; }
        .member-name { font-weight: 500; font-size: 13px; color: var(--ink); display: flex; align-items: center; gap: 8px; }
        .member-name .you-chip { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; padding: 1px 6px; background: var(--accent-soft); color: var(--accent); border-radius: 3px; font-weight: 500; }
        .member-email { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-mute); margin-top: 2px; }
        .role-select { height: 30px; padding: 0 28px 0 10px; border: 1px solid var(--line); background: var(--surface); border-radius: 5px; font-family: inherit; font-size: 12px; color: var(--ink-soft); appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2355524d' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 8px center; cursor: pointer; }
        .icon-ghost { width: 30px; height: 30px; border: none; background: transparent; border-radius: 5px; color: var(--ink-mute); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .icon-ghost:hover { background: var(--surface-alt); color: var(--ink); }

        /* WEBHOOKS */
        .webhook-row { display: grid; grid-template-columns: 1fr 120px 80px auto; gap: 16px; align-items: center; padding: 14px 24px; }
        .webhook-url { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .webhook-events { display: flex; gap: 4px; flex-wrap: wrap; }
        .event-chip { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 6px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 3px; color: var(--ink-soft); }

        /* BRANDING */
        .brand-layout { display: grid; grid-template-columns: 1fr 300px; gap: 24px; padding: 24px; }
        .brand-logo-upload { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px dashed var(--line-strong); border-radius: 8px; background: var(--surface-alt); cursor: pointer; transition: all 0.15s ease; }
        .brand-logo-upload:hover { border-color: var(--accent); background: var(--accent-soft); }
        .logo-preview { width: 56px; height: 56px; background: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
        .logo-upload-text .upload-main { font-size: 13px; font-weight: 500; color: var(--ink); }
        .color-swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 10px; }
        .color-swatch { aspect-ratio: 1; border-radius: 6px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s ease; }
        .color-swatch.selected { border-color: var(--ink); box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
        .color-swatch:hover { transform: translateY(-2px); }
        .brand-preview-card { background: var(--surface-alt); border: 1px solid var(--line); border-radius: 10px; padding: 18px; position: sticky; top: 24px; }
        .brand-preview-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute); margin-bottom: 10px; font-weight: 500; }
        .brand-preview-email { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px; font-size: 12px; color: var(--ink-soft); line-height: 1.5; }
        .brand-preview-email-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
        .brand-preview-email-logo { width: 20px; height: 20px; background: var(--accent); border-radius: 4px; }
        .brand-preview-email-title { font-weight: 500; font-size: 12px; color: var(--ink); }
        .brand-preview-button { display: inline-block; padding: 6px 10px; background: var(--accent); color: #fff; border-radius: 4px; font-size: 11px; font-weight: 500; margin-top: 6px; }

        /* AUDIT */
        .audit-row { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; padding: 14px 24px; }
        .audit-icon { width: 32px; height: 32px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--ink-mute); flex-shrink: 0; }
        .audit-text { font-size: 13px; color: var(--ink-soft); line-height: 1.5; }
        .audit-text :global(b) { color: var(--ink); font-weight: 500; }
        .audit-text :global(.action-name) { font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 1px 6px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 3px; color: var(--ink-soft); }
        .audit-time { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-mute); white-space: nowrap; }

        /* DANGER */
        .danger-card { background: var(--surface); border: 1px solid rgba(166,66,31,0.25); border-radius: 10px; overflow: hidden; }
        .danger-card .field-row { border-bottom-color: rgba(166,66,31,0.15); }
        .danger-head { padding: 16px 24px; background: var(--rose-soft); border-bottom: 1px solid rgba(166,66,31,0.2); display: flex; align-items: center; gap: 10px; }
        .danger-head-icon { width: 28px; height: 28px; background: var(--fail); color: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
        .danger-head-title { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; color: var(--fail); letter-spacing: -0.01em; }

        /* SAVE BAR */
        .save-bar { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(calc(100% + 40px)); background: var(--ink); border-radius: 10px; padding: 10px 14px 10px 18px; display: flex; align-items: center; gap: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.1); transition: transform 0.35s cubic-bezier(.2,.6,.2,1); z-index: 30; min-width: 400px; }
        .save-bar.show { transform: translateX(-50%) translateY(0); }
        .save-bar-status { display: flex; flex-direction: column; color: #fff; min-width: 0; flex: 1; }
        .save-bar-title { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
        .save-bar-changes { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.08em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .btn-discard { height: 36px; background: transparent; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.15); padding: 0 14px; border-radius: 6px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
        .btn-discard:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .btn-save { height: 36px; background: var(--accent); color: #fff; border: none; padding: 0 16px; border-radius: 6px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-save:hover { background: #3a5d4f; }
        .btn-save :global(kbd) { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 1px 5px; background: rgba(255,255,255,0.15); border-radius: 3px; color: rgba(255,255,255,0.8); margin-left: 4px; }

        /* TOAST */
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--pass); color: #fff; padding: 10px 16px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); transition: transform 0.3s cubic-bezier(.4,0,.2,1); z-index: 100; }
        .toast.show { transform: translateX(-50%) translateY(0); }

        @media (max-width: 1100px) {
          .main { grid-template-columns: 1fr; }
          .section-nav { display: none; }
          .content { padding: 32px 24px 120px; }
          .field-row { grid-template-columns: 1fr; gap: 12px; }
          .brand-layout { grid-template-columns: 1fr; }
          .brand-preview-card { position: static; }
          .webhook-row { grid-template-columns: 1fr auto; }
          .webhook-events { display: none; }
          .usage-head { flex-direction: column; gap: 14px; }
          .usage-totals { width: 100%; justify-content: space-between; }
        }
        @media (max-width: 768px) {
          .app { grid-template-columns: 1fr; }
          .sidebar { display: none; }
          .save-bar { min-width: 0; left: 16px; right: 16px; transform: translateY(calc(100% + 40px)); }
          .save-bar.show { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
