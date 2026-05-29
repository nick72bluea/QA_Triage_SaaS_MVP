"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { SavedScript } from '@/types/scripts';

// Styles rendered outside any gate — identical on server and client, no flash
const ScriptsStyles = React.memo(() => (
  <style dangerouslySetInnerHTML={{__html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
    
    /* CSS tokens live in globals.css + BrandingProvider — no redeclaration needed */

    .scripts-page * { box-sizing: border-box; }
    .scripts-page { min-height: 100vh; background: var(--bg); font-family: 'IBM Plex Sans', system-ui, sans-serif; color: var(--ink); font-size: 14px; }

    /* MAIN AREA */
    .main { padding: 32px 40px 60px; max-width: 1400px; display: flex; flex-direction: column; margin: 0 auto; width: 100%; }
    .page-head { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-shrink: 0; }
    .page-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-weight: 600; }
    .page-title { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 6px; }
    .page-sub { font-size: 13px; color: var(--ink-soft); margin: 0; }
    
    .btn { padding: 0 16px; height: 38px; border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid transparent; transition: all 0.15s; }
    .btn.primary { background: var(--ink); color: var(--bg); }
    .btn.primary:hover { background: var(--accent); }
    .btn.ghost { background: var(--surface); border-color: var(--line-strong); color: var(--ink-soft); }
    .btn.ghost:hover { background: var(--bg); color: var(--ink); }

    /* TOOLBAR */
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .search { position: relative; flex: 1; min-width: 260px; max-width: 440px; }
    .search input { width: 100%; height: 38px; padding: 0 12px 0 36px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-family: inherit; font-size: 13px; color: var(--ink); transition: all 0.15s ease; }
    .search input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-mute); }
    
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
    .tab-chip { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: 999px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .tab-chip .count { background: var(--surface-alt); padding: 2px 6px; border-radius: 999px; font-size: 9px; font-weight: 600; }
    .tab-chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .tab-chip.active .count { background: rgba(255,255,255,0.15); color: #fff; }
    .tab-chip:hover:not(.active) { background: var(--surface-alt); }

    /* EMPTY STATE */
    .empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 60px 20px; }
    .empty-icon { width: 64px; height: 64px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--accent); margin-bottom: 20px; }
    .empty-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; margin: 0 0 8px; }
    .empty-sub { color: var(--ink-soft); font-size: 13px; max-width: 400px; margin: 0 0 32px; line-height: 1.5; }
    
    .path-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; max-width: 680px; width: 100%; text-align: left; margin-bottom: 20px; }
    .path-card { background: var(--surface); border: 1.5px solid var(--line); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.18s ease; display: flex; flex-direction: column; position: relative; }
    .path-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 12px 28px rgba(45,74,62,0.08); }
    .path-card.recommended { border-color: rgba(45,74,62,0.45); background: linear-gradient(180deg, var(--surface) 0%, var(--accent-soft) 240%); }
    .path-tag { position: absolute; top: 12px; right: 12px; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; background: var(--accent); color: #fff; padding: 3px 8px; border-radius: 999px; font-weight: 600; }
    .path-icon { width: 40px; height: 40px; background: var(--accent-soft); color: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
    .path-card.recommended .path-icon { background: var(--accent); color: #fff; }
    .path-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; margin: 0 0 6px; }
    .path-desc { font-size: 12.5px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 16px; flex: 1; }
    .path-meta { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); font-weight: 600; display: flex; align-items: center; padding-top: 14px; border-top: 1px solid var(--line); }
    .path-arrow { margin-left: auto; color: var(--accent); transition: transform 0.18s; }
    .path-card:hover .path-arrow { transform: translateX(3px); }
    .empty-hint { font-size: 12px; color: var(--ink-mute); font-style: italic; }

    /* TABLE VIEW */
    .scripts-list { display: flex; flex-direction: column; gap: 8px; }
    .script-row { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; display: grid; grid-template-columns: 1fr 100px 140px 140px 120px auto; gap: 16px; align-items: center; cursor: pointer; transition: all 0.15s; }
    .script-row:hover { border-color: var(--line-strong); box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
    .sr-name { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
    .sr-desc { font-size: 12px; color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sr-metric { display: flex; flex-direction: column; gap: 4px; }
    .sr-metric-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute); font-weight: 600; }
    .sr-metric-val { font-size: 13px; font-weight: 500; color: var(--ink); }
    .sr-tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .sr-tag { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 6px; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 4px; color: var(--ink-soft); font-weight: 500; }
    .sr-actions { opacity: 0; transition: opacity 0.15s; }
    .script-row:hover .sr-actions { opacity: 1; }

    @media (max-width: 900px) {
      .main { padding: 24px; }
      .path-grid { grid-template-columns: 1fr; }
      .script-row { grid-template-columns: 1fr; gap: 12px; }
      .sr-actions { opacity: 1; }
    }
  `}} />
));
ScriptsStyles.displayName = 'ScriptsStyles';

export default function ScriptsLibraryPage() {
  const router = useRouter();
  const { currentAccountId } = useAuth();

  // hydrated gates only locale-sensitive date formatting — NOT the whole UI
  const [hydrated, setHydrated] = useState(false);
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<'active' | 'draft' | 'archived'>('active');

  useEffect(() => {
    setHydrated(true);
    if (!currentAccountId) return;

    const scriptsRef = collection(db, `accounts/${currentAccountId}/scripts`);
    const q = query(scriptsRef, orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedScripts = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as SavedScript[];
      setScripts(loadedScripts);
    });
    return () => unsubscribe();
  }, [currentAccountId]);

  const filteredScripts = useMemo(() => {
    return scripts.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (s.tags && s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())));
      const matchesStatus = s.status === listFilter;
      return matchesSearch && matchesStatus;
    });
  }, [scripts, searchQuery, listFilter]);

  const activeCount = scripts.filter(s => s.status === 'active').length;
  const draftCount = scripts.filter(s => s.status === 'draft').length;

  // Locale-sensitive — returns '—' on server, real value after hydration
  const formatDate = (ts: any): string => {
    if (!hydrated || !ts) return '—';
    return new Date(ts.toMillis()).toLocaleDateString();
  };

  // Single stable render tree — no isMounted gate, no inline sidebar, no flash
  return (
    <div className="scripts-page" suppressHydrationWarning>
      <ScriptsStyles />

      <main className="main">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">Workspace · Scripts</div>
            <h1 className="page-title">Test scripts</h1>
            <p className="page-sub">Reusable test cases. Build once, run across cycles.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn ghost">Import CSV</button>
            <button className="btn primary" onClick={() => router.push('/scripts/new')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New script
            </button>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search scripts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="tabs">
            <button className={`tab-chip${listFilter === 'active' ? ' active' : ''}`} onClick={() => setListFilter('active')}>
              Active <span className="count">{activeCount}</span>
            </button>
            <button className={`tab-chip${listFilter === 'draft' ? ' active' : ''}`} onClick={() => setListFilter('draft')}>
              Drafts <span className="count">{draftCount}</span>
            </button>
            <button className={`tab-chip${listFilter === 'archived' ? ' active' : ''}`} onClick={() => setListFilter('archived')}>
              Archived
            </button>
          </div>
        </div>

        {scripts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
            </div>
            <h2 className="empty-title">Your scripts library is empty</h2>
            <p className="empty-sub">Create master test scripts here, then reuse them across multiple testing cycles without starting from scratch.</p>

            <div className="path-grid">
              <div className="path-card recommended" onClick={() => router.push('/scripts/new')}>
                <span className="path-tag">Recommended</span>
                <div className="path-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <h3 className="path-title">Build from scratch</h3>
                <p className="path-desc">Add steps inline or paste from any source. We split the text into steps automatically.</p>
                <div className="path-meta">
                  Includes AI generation
                  <svg className="path-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
              </div>
              <div className="path-card">
                <div className="path-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <h3 className="path-title">Import a CSV</h3>
                <p className="path-desc">Got a script in Sheets, Notion, or Excel? Upload the file and we&apos;ll structure it.</p>
                <div className="path-meta">
                  Works with most exports
                  <svg className="path-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
              </div>
            </div>
            <div className="empty-hint">Scripts you build inside a project cycle will also be saved here automatically.</div>
          </div>
        ) : (
          <div className="scripts-list">
            {filteredScripts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-mute)', fontStyle: 'italic' }}>
                No scripts match your filters.
              </div>
            ) : (
              filteredScripts.map(script => (
                <div className="script-row" key={script.id} onClick={() => router.push(`/scripts/${script.id}`)}>
                  <div>
                    <div className="sr-name">{script.name}</div>
                    <div className="sr-desc">{script.description || 'No description provided'}</div>
                  </div>
                  <div className="sr-metric">
                    <span className="sr-metric-label">Steps</span>
                    <span className="sr-metric-val">{script.stepCount || script.steps?.length || 0}</span>
                  </div>
                  <div className="sr-metric">
                    <span className="sr-metric-label">Last Edited</span>
                    <span className="sr-metric-val">{formatDate(script.updatedAt)}</span>
                  </div>
                  <div className="sr-tags">
                    {script.tags && script.tags.slice(0, 2).map(t => (
                      <span className="sr-tag" key={t}>{t}</span>
                    ))}
                    {script.tags && script.tags.length > 2 && (
                      <span className="sr-tag">+{script.tags.length - 2}</span>
                    )}
                  </div>
                  <div className="sr-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn primary" onClick={() => router.push(`/home?prefilledScriptId=${script.id}`)}>
                      Use in cycle
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}