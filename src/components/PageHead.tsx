"use client";

import React from 'react';

interface PageHeadProps {
  /**
   * Optional eyebrow segments. Renders as e.g. "Workspace · Settings"
   * with separator dots between segments.
   */
  eyebrow?: string | string[];

  /**
   * The main page title. To italicize a word using the accent treatment,
   * wrap it in `<em>` in JSX form, or pass as ReactNode:
   *   <PageHead title={<>Workspace <em>settings</em></>} />
   */
  title: React.ReactNode;

  /**
   * Optional subhead / description below the title.
   */
  sub?: React.ReactNode;

  /**
   * Optional right-side actions (buttons).
   */
  actions?: React.ReactNode;
}

/**
 * Canonical page-head typography for Proofdeck.
 *
 * Use this on every top-level page (Settings, Scripts library, Triage board, etc).
 * Standalone editors use a different head pattern (`bt-eyebrow` + `bt-name-input`)
 * because they have a different shape of meta — but list/dashboard pages all use this.
 */
export function PageHead({ eyebrow, title, sub, actions }: PageHeadProps) {
  const eyebrowSegments = Array.isArray(eyebrow)
    ? eyebrow
    : eyebrow
      ? [eyebrow]
      : null;

  return (
    <div className="pd-head">
      {/* Plain <style>: `<style jsx>` isn't compiled in this app, so the
          previous styles never applied. Class names are prefixed so pages
          that define their own .page-head rules can't clash. */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_HEAD_CSS }} />
      <div className="pd-head-text">
        {eyebrowSegments && (
          <div className="pd-head-eyebrow">
            {eyebrowSegments.map((segment, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="pd-head-sep">·</span>}
                <span>{segment}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 className="pd-head-title">{title}</h1>
        {sub && <p className="pd-head-sub">{sub}</p>}
      </div>
      {actions && <div className="pd-head-actions">{actions}</div>}
    </div>
  );
}

const PAGE_HEAD_CSS = `
  .pd-head { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
  .pd-head-text { min-width: 0; }
  .pd-head-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-weight: 500; }
  .pd-head-sep { opacity: 0.4; }
  .pd-head-title { font-family: var(--font-display, 'Fraunces', serif); font-size: 36px; font-weight: 600; letter-spacing: -0.025em; margin: 0 0 6px; line-height: 1.05; color: var(--ink); }
  .pd-head-title em { font-style: italic; color: var(--accent); font-weight: 500; }
  .pd-head-sub { color: var(--ink-mute); font-size: 14px; margin: 0; max-width: 560px; line-height: 1.5; }
  .pd-head-actions { display: flex; gap: 10px; flex-shrink: 0; flex-wrap: wrap; }
  @media (max-width: 768px) {
    .pd-head { flex-direction: column; align-items: flex-start; gap: 16px; }
    .pd-head-title { font-size: 28px; }
  }
`;
