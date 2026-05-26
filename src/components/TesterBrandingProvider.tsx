"use client";

import React, { useEffect } from "react";
import { BrandingSnapshot } from "@/types/workspace";

// TesterBrandingProvider — a slimmed-down theming wrapper used inside the
// tester page. Unlike the main BrandingProvider, this one:
//   • Keeps the dark "premium" tester aesthetic regardless of workspace theme
//     (so light-mode workspaces still get a focused dark tester experience)
//   • Only overrides the brand accent colour and logo
//   • Reads from a snapshot embedded in the testRun doc (testers aren't authed
//     and can't query workspace settings)
//
// Usage (in tester page):
//   <TesterBrandingProvider snapshot={runData?.branding}>
//     ... tester UI ...
//   </TesterBrandingProvider>

interface TesterBrandingProviderProps {
  snapshot?: BrandingSnapshot | null;
  children: React.ReactNode;
}

export function TesterBrandingProvider({
  snapshot,
  children,
}: TesterBrandingProviderProps) {
  useEffect(() => {
    if (typeof window === "undefined" || !snapshot) return;

    const root = document.documentElement;

    // Brand colours come from the snapshot. The tester page CSS uses
    // var(--accent), var(--accent-soft), var(--brand-secondary) — which we
    // override here. Untouched: --bg, --surface, --ink (those stay dark
    // for the focused tester aesthetic, regardless of workspace theme).
    const primary = snapshot.brandColorPrimary || "#7ab28a";
    const secondary = snapshot.brandColorSecondary || "#e8a385";

    root.style.setProperty("--accent", primary);
    root.style.setProperty("--accent-soft", hexToRgba(primary, 0.12));
    root.style.setProperty("--accent-ink", primary);
    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-primary-soft", hexToRgba(primary, 0.12));
    root.style.setProperty("--brand-secondary", secondary);
    root.style.setProperty("--brand-secondary-soft", hexToRgba(secondary, 0.12));
    // Tester page uses --coral for some warm accents — point it at secondary
    root.style.setProperty("--coral", secondary);
    root.style.setProperty("--coral-soft", hexToRgba(secondary, 0.12));

    if (snapshot.logoUrl) {
      root.style.setProperty("--brand-logo", `url("${snapshot.logoUrl}")`);
    }

    if (snapshot.workspaceName) {
      // Browser tab title for the tester page
      document.title = snapshot.workspaceName;
    }

    // Cleanup not strictly necessary — these vars get re-set on next mount.
  }, [snapshot]);

  return <>{children}</>;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (expanded.length !== 6) return `rgba(122, 178, 138, ${alpha})`;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── BRAND LOGO COMPONENT ────────────────────────────────────────────────────
// Use in the welcome and complete stages of the tester page to render the
// workspace's logo above the greeting. Falls back to nothing if no logo.

interface TesterBrandLogoProps {
  snapshot?: BrandingSnapshot | null;
  size?: number;
}

export function TesterBrandLogo({ snapshot, size = 56 }: TesterBrandLogoProps) {
  if (!snapshot?.logoUrl) return null;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        overflow: "hidden",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "grid",
        placeItems: "center",
        marginBottom: 20,
      }}
    >
      <img
        src={snapshot.logoUrl}
        alt={snapshot.workspaceName || "Workspace logo"}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
}