// Workspace settings — stored at accounts/{accountId}/settings/workspace
// Branding fields drive the live theme (BrandingProvider) and tester surfaces.

export type ThemeMode = "light" | "dark" | "auto";
export type CornerStyle = "sharp" | "default" | "soft" | "rounded";
export type SidebarStyle = "dark" | "brand" | "light";
export type FontPairing = "classic" | "modern" | "neutral";

export interface WorkspaceSettings {
  // ─── IDENTITY ──────────────────────────────────────────────────────────
  workspaceName: string;
  timezone: string;
  supportEmail: string;

  // ─── BRANDING ──────────────────────────────────────────────────────────
  logoUrl: string | null; // Firebase Storage URL, null = use default mark
  brandColorPrimary: string; // main accent (hex)
  brandColorSecondary: string; // secondary accent (hex)
  theme: ThemeMode;
  cornerStyle: CornerStyle; // button/card border-radius
  sidebarStyle: SidebarStyle; // sidebar background treatment
  fontPairing: FontPairing; // heading + body + mono font set

  // Legacy single-colour field kept for backward compat with old data.
  // New code should use brandColorPrimary.
  brandColor?: string;

  // ─── INTEGRATIONS ──────────────────────────────────────────────────────
  jiraUrl: string;
  jiraEmail: string;
  jiraToken: string;
  slackConnected: boolean;
  slackChannel: string;
  figmaConnected: boolean;
  figmaFileName: string;
  figmaFrameCount: number;
  figmaSyncedAt: any;

  // ─── AI CONFIG ─────────────────────────────────────────────────────────
  aiProvider: string;
  aiToken: string;
  maxSpend: string;

  // ─── NOTIFICATIONS ─────────────────────────────────────────────────────
  notifyDigest: boolean;
  notifyAlerts: boolean;
  notifyComplete: boolean;
  notifyStuck: boolean;
  notifyWeekly: boolean;

  // ─── METADATA ──────────────────────────────────────────────────────────
  updatedAt?: any;
  updatedBy?: string;
  createdAt?: any;
}

// Defaults applied on first load and on missing fields
export const WORKSPACE_DEFAULTS: WorkspaceSettings = {
  workspaceName: "My Workspace",
  timezone: "Europe/London (GMT+0)",
  supportEmail: "",

  logoUrl: null,
  brandColorPrimary: "#2d4a3e",
  brandColorSecondary: "#a6421f",
  theme: "light",
  cornerStyle: "default",
  sidebarStyle: "dark",
  fontPairing: "classic",
  brandColor: "#2d4a3e", // legacy compat

  jiraUrl: "",
  jiraEmail: "",
  jiraToken: "",
  slackConnected: false,
  slackChannel: "#qa-alerts",
  figmaConnected: false,
  figmaFileName: "",
  figmaFrameCount: 0,
  figmaSyncedAt: null,

  aiProvider: "Anthropic · Claude Sonnet 4.5",
  aiToken: "",
  maxSpend: "50",

  notifyDigest: true,
  notifyAlerts: true,
  notifyComplete: true,
  notifyStuck: false,
  notifyWeekly: false,
};

// Snapshot of branding fields embedded into testRuns at creation time
// so testers see consistent branding even if the workspace is later edited.
export interface BrandingSnapshot {
  workspaceName: string;
  logoUrl: string | null;
  brandColorPrimary: string;
  brandColorSecondary: string;
  theme: ThemeMode;
}

export function brandingSnapshotFrom(
  settings: WorkspaceSettings
): BrandingSnapshot {
  return {
    workspaceName: settings.workspaceName,
    logoUrl: settings.logoUrl,
    brandColorPrimary: settings.brandColorPrimary,
    brandColorSecondary: settings.brandColorSecondary,
    theme: settings.theme,
  };
}

// Suggested colour swatches shown in the settings UI
export const BRAND_COLOR_PRESETS_PRIMARY = [
  "#2d4a3e", // forest (default)
  "#3d5a80", // slate blue
  "#6a4a7c", // plum
  "#a6421f", // rust
  "#b8860b", // amber
  "#1a1a1a", // near-black
];

export const BRAND_COLOR_PRESETS_SECONDARY = [
  "#a6421f", // rust (default)
  "#7c4dff", // violet
  "#0a8a6c", // teal
  "#d4793a", // burnt orange
  "#c2185b", // raspberry
  "#5a32d9", // deep purple
];
