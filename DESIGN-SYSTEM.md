# Proofdeck Design System — Standards & Rules

This document codifies the patterns established across Proofdeck. Use it as the reference when building new pages, when reviewing existing pages for inconsistencies, and when onboarding new contributors.

---

## Save behavior — when to use which pattern

We have **two save patterns**. They are NOT interchangeable. The correct one depends on the failure mode of the surface, not on developer preference.

### Auto-save with status indicator
**Use for:** composition / creative surfaces where mistakes are recoverable.

- Scripts builder (`/scripts/[id]`)
- Cycle wizard (during edits, before launch)
- Any content editor

**Pattern:**
- Debounced save 1s after last edit
- Status indicator near the page header: "Saving..." → "Saved 2s ago"
- No explicit save button
- Edits feel instant; the user trusts the system

**Why:** Editing a step text and changing your mind is one keystroke away. Losing progress to a forgotten click is frustrating.

### Explicit save bar
**Use for:** configuration / destructive surfaces where mistakes have real consequences.

- Workspace settings (`/admin/settings`)
- User profile / account settings
- Integration credentials
- Permissions
- Anything touching billing

**Pattern:**
- Floating "Unsaved changes" bar at bottom-center of viewport
- Lists which sections have changed: "Changes in: Workspace identity, Integrations"
- "Discard" button (left) and "Save changes" button (right, with ⌘S keyboard shortcut)
- Bar slides in from bottom with `cubic-bezier(.2,.6,.2,1)` when `isDirty`
- After save: bar slides out, brief success toast slides in

**Why:** Pasting the wrong API token shouldn't instantly break Jira. Toggling notifications shouldn't fire emails to your team without confirmation. The cognitive overhead of clicking save is the feature, not a bug.

### Why this is OK to be inconsistent across the product
Users don't experience this as inconsistency — they experience it as the system doing the right thing in each context. The trick is being deliberate about which surface gets which pattern.

**Quick test:** if a wrong value would cause something destructive, surprising, or expensive to roll back → use the explicit save bar. Otherwise auto-save.

---

## Page typography

**Every top-level page** uses the `<PageHead>` component. It's at `src/components/PageHead.tsx`.

### Standard form
```tsx
<PageHead
  eyebrow={['Workspace', 'Settings']}
  title={<>Workspace <em>settings</em></>}
  sub="Configure how your agency works — integrations, AI, team, notifications, and more."
  actions={[<Button key="x">Action</Button>]}  // optional
/>
```

### Visual specs
- **Eyebrow** — JetBrains Mono 10px, uppercase, letter-spacing 0.14em, color `--ink-mute`. Multiple segments separated by `·` (middle dot at 0.4 opacity).
- **Title** — Fraunces 36px, weight 600, letter-spacing -0.025em, line-height 1.05. The styled word is wrapped in `<em>` and renders italic in `--accent` color.
- **Sub** — IBM Plex 14px, color `--ink-mute`, max-width 560px, line-height 1.5.
- **Layout** — Title block on the left, optional actions on the right, `align-items: flex-end` so the actions sit on the same baseline as the sub-text.
- **Bottom margin** — 32px.

### Mobile
- Title shrinks to 28px below 768px.
- Layout flips to column with actions below the title.

### When NOT to use PageHead
**Standalone editors** (script builder, cycle wizard) don't use `<PageHead>` because they have a different shape — an editable name input where the title would be, save status indicator, and a primary CTA in the corner. They use the `bt-eyebrow` + `bt-name-input` pattern instead. Different surface, different pattern; both are correct.

---

## Section structure within pages

For pages with multiple subsections (settings, scripts library, etc.):

- Each section has an `id` for scroll-spy and direct linking
- Section heading is Fraunces 22px, weight 600, letter-spacing -0.01em
- Section description is IBM Plex 13px, `--ink-mute`, line-height 1.5, just below the title
- Section content lives in a `.section-card` — white surface, 1px line border, 10px radius, overflow hidden so children with backgrounds get clipped properly
- 48px bottom margin between sections

If the page has 4+ sections AND scrollable content, add a sticky **section nav** on the left with scroll-spy. Active item gets a 2px accent inset shadow on the left and the icon opacity bumps to 1. See settings page for reference.

---

## Field layout

Inside a `.section-card`, each editable field uses a `.field-row`:

```
┌──────────────┬─────────────────────┐
│ Field name   │ <input>             │
│ Required     │                     │
│ Description  │                     │
└──────────────┴─────────────────────┘
```

- **Left column** — 260px fixed. Field name (13px, weight 500), optional "Required" tag (mono 9px, fail red, uppercase), description (12px, `--ink-mute`, line-height 1.5).
- **Right column** — flex. The actual input.
- **Padding** — 20px vertical, 24px horizontal.
- **Border** — 1px line at the bottom; last child gets no border.
- **Mobile** (<1100px) — collapses to single column with 12px gap.

This pattern is used in settings, project admin, member management, anything with editable fields.

### Input components
- `.input` — 38px tall, 12px horizontal padding, line-strong border, focus ring is 3px accent-12% on top of accent border
- `.input-prefix` — for inputs with a prefix label like `https://` or `USD $`. The prefix sits in `--surface-alt` separated by a 1px line.
- `.input-with-action` — inputs with a trailing icon button (show/hide password, etc).
- `.select` — same shape as `.input` but with a custom chevron SVG background.

Always use `--line-strong` for input borders, not `--line`. The stronger border distinguishes editable fields from card boundaries.

---

## Status indicators

Connection status (Jira connected, Slack disconnected, etc.) uses pill-shaped chips:

- **Connected** (green) — pass-soft background, pass text, glowing dot
- **Disconnected** (neutral) — surface background, ink-mute text, dim dot, 1px line border
- **Error** (red) — fail-soft background, fail text, dim dot

All chips use JetBrains Mono 10px uppercase with 0.1em letter-spacing.

---

## Color tokens

Always reference these tokens, never hardcode hex values.

### Neutrals (most of the UI)
- `--bg` `#f4f3ef` — page background (warm cream)
- `--surface` `#ffffff` — cards, inputs
- `--surface-alt` `#fafaf7` — slightly darker surface, for headers within cards
- `--ink` `#1a1a1a` — primary text
- `--ink-soft` `#55524d` — secondary text
- `--ink-mute` `#8a867f` — tertiary / metadata
- `--line` `#e5e2db` — subtle borders, dividers
- `--line-strong` `#d4d0c7` — input borders, prominent dividers

### Sidebar (dark)
- `--sidebar` `#121a17` — sidebar background
- `--sidebar-ink` `#e5e2db` — sidebar text
- `--sidebar-mute` `#7a7a72` — inactive nav items

### Brand / accent
- `--accent` `#2d4a3e` — primary brand color (forest green)
- `--accent-soft` `#e8f0eb` — accent backgrounds, hover states
- `--accent-ink` `#1d3329` — accent button hover

### Semantic
- `--pass` / `--pass-soft` — success states (green)
- `--fail` / `--fail-soft` — destructive / error states (rose-orange)
- `--warn` / `--warn-soft` — warnings (amber)
- `--info` / `--info-soft` — informational chips (blue)

### AI accent (purple)
- `--ai` `#7c4dff` — AI features primary color
- `--ai-soft` `#ede5ff` — AI feature backgrounds, hover
- `--ai-deep` `#5a32d9` — AI button hover

**Rule:** Anything AI-driven (Jira drafting, step generation, refinement, gap detection) uses the purple `--ai` accent. This visual cue tells users "this is AI" without needing labels.

---

## Typography tokens (the three-font stack)

All in `next/font/google` from the root layout.

- **Fraunces** — display serif. Used for: page titles, section headings, script names, large numerals, anywhere we want the editorial feel.
- **IBM Plex Sans** — body sans. Used for: default body text, form inputs, button labels, descriptions.
- **JetBrains Mono** — code/meta sans. Used for: timestamps, eyebrows, status pills, IDs, tags, button keyboard shortcuts, anywhere we want technical or telemetric feel.

**Italic Fraunces** is reserved for accent words inside titles (`Workspace <em>settings</em>`). Used sparingly. One italic word per title; never two.

---

## Spacing scale

Most spacing uses one of these values (in pixels):
- 4, 6, 8 — within compact components (chip padding, gap between sibling icons)
- 10, 12, 14, 16 — within cards (padding, gap between field elements)
- 20, 24 — between cards, around section content
- 32, 48 — between sections, page padding
- 60+ — page-level top/bottom padding

We don't use a strict 4px or 8px grid — we use whatever number reads as most comfortable. But aim to reuse the values above rather than inventing new ones.

---

## Buttons

### Primary (`btn-primary`)
- Background `--accent`, color white
- Hover: background `--accent-ink`
- Use for the most important action on a card or section

### Secondary (`btn-secondary`)
- Background `--surface`, border `--line-strong`, color `--ink-soft`
- Hover: background `--surface-alt`, color `--ink`
- Use for non-destructive secondary actions

### Danger (`btn-danger`)
- Background `--surface`, border `rgba(166,66,31,0.3)`, color `--fail`
- Hover: background `--fail-soft`, border `--fail`
- Used for destructive actions in their default state. Becomes solid red (`--fail` background, white text) when the user is in a confirm flow.

### Sizing
- Height 36px standard
- Height 38px for primary actions on page heads (matches `--input` height)
- Padding 14-16px horizontal
- Border-radius 6px
- Border-radius 8px for slightly more important buttons

---

## Save behavior — implementation reference

### Auto-save (composition surfaces)
```tsx
const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
const [lastSavedAt, setLastSavedAt] = useState<number>(Date.now());

const debouncedSave = useDebouncedCallback(async (state) => {
  setSaveStatus('saving');
  try {
    await persistToFirestore(state);
    setSaveStatus('saved');
    setLastSavedAt(Date.now());
  } catch {
    setSaveStatus('error');
  }
}, 1000);

useEffect(() => { debouncedSave(state); }, [state]);
```

Status indicator near the title:
```tsx
<span className="bt-saved">
  {saveStatus === 'saving' ? 'Saving...' : `Saved ${formatRelative(lastSavedAt)} ago`}
</span>
```

### Explicit save bar (config surfaces)
```tsx
const [initialData, setInitialData] = useState(loadedData);
const [formData, setFormData] = useState(initialData);

const changedSections = computeChanged(initialData, formData);
const isDirty = changedSections.length > 0;

const handleSave = async () => {
  await persistToFirestore(formData);
  setInitialData(formData);  // becomes the new baseline
  showToast('Settings saved');
};

const handleDiscard = () => setFormData(initialData);
```

The bar appears via `.show` class when `isDirty`. ⌘S triggers `handleSave`. After successful save: toast slides in.

---

## Hydration safety checklist

Every page that uses any of these patterns must follow the corresponding rule:

1. **`<style>` tags with `@import` or `:root` → use `<style jsx>` instead.** Inline `<style dangerouslySetInnerHTML>` collides with Emotion (used by some shadcn components).

2. **Locale-dependent rendering → gate behind `hydrated` flag + use explicit locale.**
   ```tsx
   const [hydrated, setHydrated] = useState(false);
   useEffect(() => { setHydrated(true); }, []);

   const formatDate = (d: Date) => {
     if (!hydrated) return '—';
     return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
   };
   ```

3. **Browser-only APIs (`window`, `document`) → only call inside `useEffect`** with the `hydrated` flag, not at component top level.

4. **Floating UI elements that depend on client state (save bars, toasts) → conditionally render only after `hydrated`** so the SSR HTML matches the first client render.

5. **No wrapper `<div>` purely for style scoping.** Styled-jsx scopes automatically. A wrapper div is unnecessary and risks DOM ordering mismatches.

6. **Fonts via `next/font` in root layout, never `@import`.**

---

## When to deviate from this document

Sometimes the right thing is to deviate. The rules to follow:

1. **Name what's different.** If you're using auto-save on a config surface, document why in the component.
2. **Push back deliberately.** If a designer/PM asks for something that violates this document, raise it. "We have a rule that says X — here's the reasoning." If the case for deviating is strong, deviate; if not, stick to the rule.
3. **Update the document.** If a deliberate deviation becomes a new pattern across multiple surfaces, it's no longer a deviation — it's a new rule. Add it here.

The goal is consistency through deliberate choice, not consistency through cargo-culting.
