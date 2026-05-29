"use client";

import React, { useEffect, useMemo } from "react";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { ThemeMode, CornerStyle, SidebarStyle, FontPairing, BrandingSnapshot } from "@/types/workspace";

// BrandingProvider — applies workspace branding to the live document.
//
// Strategy: set CSS variables on <html> so existing components that use
// var(--accent), var(--ink) etc. automatically pick up the brand colours.
// We override a small set of "brand" variables and add a theme class to <body>.
//
// Two modes:
//  - Default: read settings via useWorkspaceSettings (signed-in users)
//  - Override: pass a snapshot directly (used on tester routes — branding
//    comes from the testRun doc, not the viewer's account)

interface BrandingProviderProps {
  children: React.ReactNode;
  snapshot?: BrandingSnapshot | null;
}

export function BrandingProvider({ children, snapshot }: BrandingProviderProps) {
  // If a snapshot is supplied, use it. Otherwise pull from current account.
  const { settings } = useWorkspaceSettings();

  const brand = useMemo(() => {
    if (snapshot) {
      return {
        primary: snapshot.brandColorPrimary,
        secondary: snapshot.brandColorSecondary,
        theme: snapshot.theme,
        logoUrl: snapshot.logoUrl,
        workspaceName: snapshot.workspaceName,
        cornerStyle: "default" as CornerStyle,
        sidebarStyle: "dark" as SidebarStyle,
        fontPairing: "classic" as FontPairing,
      };
    }
    if (!settings) return null;
    return {
      primary: settings.brandColorPrimary || settings.brandColor || "#2d4a3e",
      secondary: settings.brandColorSecondary || "#a6421f",
      theme: settings.theme || "light",
      logoUrl: settings.logoUrl,
      workspaceName: settings.workspaceName,
      cornerStyle: (settings.cornerStyle || "default") as CornerStyle,
      sidebarStyle: (settings.sidebarStyle || "dark") as SidebarStyle,
      fontPairing: (settings.fontPairing || "classic") as FontPairing,
    };
  }, [snapshot, settings]);

  // Apply CSS variables and theme class
  useEffect(() => {
    if (typeof window === "undefined" || !brand) return;

    const root = document.documentElement;
    const body = document.body;

    // Resolve "auto" theme to actual light/dark from OS preference
    let resolvedTheme: "light" | "dark" = "light";
    if (brand.theme === "dark") {
      resolvedTheme = "dark";
    } else if (brand.theme === "auto") {
      resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    // Apply theme class to <body>
    body.classList.remove("theme-light", "theme-dark");
    body.classList.add(`theme-${resolvedTheme}`);

    // Brand colour CSS vars — these override the defaults declared in
    // each page's <style> block when those styles use var(--brand-primary).
    root.style.setProperty("--brand-primary", brand.primary);
    root.style.setProperty("--brand-secondary", brand.secondary);

    // Derived translucent variants for backgrounds/borders
    root.style.setProperty(
      "--brand-primary-soft",
      hexToRgba(brand.primary, 0.12)
    );
    root.style.setProperty(
      "--brand-secondary-soft",
      hexToRgba(brand.secondary, 0.12)
    );

    // Page-level theme tokens (used by themed components)
    if (resolvedTheme === "dark") {
      root.style.setProperty("--bg", "#0f1410");
      root.style.setProperty("--surface", "#171d18");
      root.style.setProperty("--surface-alt", "#1d2420");
      root.style.setProperty("--ink", "#f4f3ef");
      root.style.setProperty("--ink-soft", "#c4c0b4");
      root.style.setProperty("--ink-mute", "#8a867f");
      root.style.setProperty("--line", "rgba(255,255,255,0.08)");
      root.style.setProperty("--line-strong", "rgba(255,255,255,0.15)");
    } else {
      root.style.setProperty("--bg", "#f4f3ef");
      root.style.setProperty("--surface", "#ffffff");
      root.style.setProperty("--surface-alt", "#fafaf7");
      root.style.setProperty("--ink", "#1a1a1a");
      root.style.setProperty("--ink-soft", "#55524d");
      root.style.setProperty("--ink-mute", "#8a867f");
      root.style.setProperty("--line", "#e5e2db");
      root.style.setProperty("--line-strong", "#d4d0c7");
    }

    // Override existing --accent so legacy components automatically rebrand
    root.style.setProperty("--accent", brand.primary);
    root.style.setProperty("--accent-soft", hexToRgba(brand.primary, 0.12));
    root.style.setProperty("--accent-ink", darken(brand.primary, 0.15));
    root.style.setProperty("--brand-primary", brand.primary);
    root.style.setProperty("--brand-secondary", brand.secondary);

    // Logo as a CSS var
    if (brand.logoUrl) {
      root.style.setProperty("--brand-logo", `url("${brand.logoUrl}")`);
    } else {
      root.style.removeProperty("--brand-logo");
    }

    // Browser tab title
    if (brand.workspaceName) {
      document.title = brand.workspaceName;
    }

    // ─── CORNER STYLE ──────────────────────────────────────────────────
    const cornerMap: Record<CornerStyle, [string, string, string, string, string]> = {
      sharp:   ["2px",  "1px",  "4px",  "6px",  "4px" ],
      default: ["6px",  "4px",  "10px", "16px", "10px"],
      soft:    ["10px", "6px",  "14px", "20px", "14px"],
      rounded: ["16px", "10px", "20px", "28px", "20px"],
    };
    const [rBase, rSm, rLg, rXl, rCard] = cornerMap[brand.cornerStyle];
    root.style.setProperty("--radius",      rBase);
    root.style.setProperty("--radius-sm",   rSm);
    root.style.setProperty("--radius-lg",   rLg);
    root.style.setProperty("--radius-xl",   rXl);
    root.style.setProperty("--radius-card", rCard);

    // ─── SIDEBAR STYLE ─────────────────────────────────────────────────
    const sidebarTokens = getSidebarTokens(brand.sidebarStyle, brand.primary);
    Object.entries(sidebarTokens).forEach(([k, v]) => root.style.setProperty(k, v));

    // ─── FONT PAIRING ──────────────────────────────────────────────────
    applyFontPairing(brand.fontPairing, root);

  }, [brand]);

  // Listen for OS theme changes if user picked "auto"
  useEffect(() => {
    if (typeof window === "undefined" || !brand || brand.theme !== "auto")
      return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // Trigger re-application
      const event = new Event("brandingThemeChange");
      window.dispatchEvent(event);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [brand]);

  return <>{children}</>;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// ─── SIDEBAR TOKENS ──────────────────────────────────────────────────────────

function getSidebarTokens(style: SidebarStyle, primary: string): Record<string, string> {
  switch (style) {
    case "brand":
      return {
        "--sidebar-bg":          primary,
        "--sidebar-ink":         "rgba(255,255,255,0.7)",
        "--sidebar-ink-bright":  "#ffffff",
        "--sidebar-ink-mute":    "rgba(255,255,255,0.4)",
        "--sidebar-border":      "rgba(255,255,255,0.12)",
        "--sidebar-hover-bg":    "rgba(255,255,255,0.1)",
        "--sidebar-active-bg":   "rgba(255,255,255,0.18)",
        "--sidebar-active-ink":  "#ffffff",
        "--sidebar-active-bar":  "#ffffff",
        "--sidebar-popover-bg":  darken(primary, 0.12),
        "--sidebar-popover-ink": "rgba(255,255,255,0.8)",
      };
    case "light":
      return {
        "--sidebar-bg":          "var(--surface, #ffffff)",
        "--sidebar-ink":         "rgba(26,26,26,0.55)",
        "--sidebar-ink-bright":  "#1a1a1a",
        "--sidebar-ink-mute":    "rgba(26,26,26,0.35)",
        "--sidebar-border":      "var(--line, #e5e2db)",
        "--sidebar-hover-bg":    "var(--surface-alt, #fafaf7)",
        "--sidebar-active-bg":   hexToRgba(primary, 0.1),
        "--sidebar-active-ink":  primary,
        "--sidebar-active-bar":  primary,
        "--sidebar-popover-bg":  "var(--surface-alt, #fafaf7)",
        "--sidebar-popover-ink": "rgba(26,26,26,0.75)",
      };
    default: // dark
      return {
        "--sidebar-bg":          "#0f1410",
        "--sidebar-ink":         "rgba(244,243,239,0.55)",
        "--sidebar-ink-bright":  "#f4f3ef",
        "--sidebar-ink-mute":    "rgba(244,243,239,0.3)",
        "--sidebar-border":      "rgba(255,255,255,0.06)",
        "--sidebar-hover-bg":    "rgba(255,255,255,0.04)",
        "--sidebar-active-bg":   "rgba(255,255,255,0.07)",
        "--sidebar-active-ink":  "#f4f3ef",
        "--sidebar-active-bar":  primary,
        "--sidebar-popover-bg":  "#1a2420",
        "--sidebar-popover-ink": "rgba(244,243,239,0.75)",
      };
  }
}

// ─── FONT PAIRING ─────────────────────────────────────────────────────────────

const FONT_PAIRINGS: Record<FontPairing, {
  display: string; body: string; mono: string; googleUrl: string;
}> = {
  classic: {
    display: "'Fraunces', Georgia, serif",
    body:    "'IBM Plex Sans', system-ui, sans-serif",
    mono:    "'JetBrains Mono', 'Fira Code', monospace",
    googleUrl: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap",
  },
  modern: {
    display: "'Plus Jakarta Sans', system-ui, sans-serif",
    body:    "'Inter', system-ui, sans-serif",
    mono:    "'Fira Code', monospace",
    googleUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&family=Fira+Code:wght@400;500&display=swap",
  },
  neutral: {
    display: "'DM Serif Display', Georgia, serif",
    body:    "'DM Sans', system-ui, sans-serif",
    mono:    "'DM Mono', monospace",
    googleUrl: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600&family=DM+Mono:wght@400;500&display=swap",
  },
};

function applyFontPairing(pairing: FontPairing, root: HTMLElement) {
  const p = FONT_PAIRINGS[pairing] || FONT_PAIRINGS.classic;

  // Swap the Google Fonts <link> element
  const linkId = "proofdeck-brand-fonts";
  let link = document.getElementById(linkId) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== p.googleUrl) link.href = p.googleUrl;

  // Set CSS vars so components using var(--font-display) etc. update instantly
  root.style.setProperty("--font-display", p.display);
  root.style.setProperty("--font-body",    p.body);
  root.style.setProperty("--font-mono",    p.mono);

  // Inject a scoped override that makes non-var font-family declarations
  // respect the pairing choice without needing !important on every rule.
  const styleId = "proofdeck-font-override";
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `
    body, .admin-page, .qa-home-wrapper, .triage-v2, .scripts-page, .app-container {
      font-family: ${p.body} !important;
    }
    h1, h2, h3, h4,
    .hero-title, .section-title, .resume-title, .launch-title, .pin-title,
    .brand-preview-name, .sidebar-brand-name, .stat-value {
      font-family: ${p.display} !important;
    }
    code, pre, .font-mono,
    .section-nav-label, .hero-eyebrow, .module-label, .field-label-name,
    .role-badge, .member-email, .invite-url, .invite-expiry,
    .sidebar-foot, .sidebar-popover-label {
      font-family: ${p.mono} !important;
    }
  `;
}

function darken(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const expanded = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  if (expanded.length !== 6) return hex;
  const r = Math.max(0, Math.round(parseInt(expanded.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(expanded.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(expanded.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (expanded.length !== 6) return `rgba(45, 74, 62, ${alpha})`; // fallback
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}