"use client";

import React, { useEffect, useMemo } from "react";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { ThemeMode, BrandingSnapshot } from "@/types/workspace";

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
      };
    }
    if (!settings) return null;
    return {
      primary: settings.brandColorPrimary || settings.brandColor || "#2d4a3e",
      secondary: settings.brandColorSecondary || "#a6421f",
      theme: settings.theme || "light",
      logoUrl: settings.logoUrl,
      workspaceName: settings.workspaceName,
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

    // Logo as a CSS var (consumed by ::before pseudo-elements where needed)
    if (brand.logoUrl) {
      root.style.setProperty("--brand-logo", `url("${brand.logoUrl}")`);
    } else {
      root.style.removeProperty("--brand-logo");
    }

    // Browser tab title
    if (brand.workspaceName) {
      document.title = brand.workspaceName;
    }
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