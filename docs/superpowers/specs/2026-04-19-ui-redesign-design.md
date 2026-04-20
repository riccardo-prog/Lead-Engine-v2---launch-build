# UI Redesign — Ambient Glow Theme

Date: 2026-04-19
Status: Approved

## Overview

Full UI redesign of the Lead Engine dashboard from inline-style prototype to a polished, production-ready interface. Dark-first "Ambient Glow" theme with toggleable light mode. Migrate from inline styles to Tailwind classes + shadcn/ui components.

First client: Joseph Pavone Real Estate.

## Visual Direction

**Ambient Glow** — indigo-to-cyan gradient accents with soft color bleed. Dark backgrounds (`#09090b` base) with subtle colored light bleeding through borders and shadows. Feels AI/futuristic without being garish. Light mode inverts to white backgrounds while keeping the same accent system.

### Color Palette

**Dark mode:**
- Background: `#09090b` (main), `#0f0f14` (sidebar), `#111` (elevated surfaces)
- Borders: `rgba(99,102,241,0.08)` (subtle), `rgba(99,102,241,0.15)` (active)
- Text: `#fff` (primary), `#ccc` (secondary), `#555` (muted), `#444` (disabled)
- Accent gradient: `linear-gradient(135deg, #6366f1, #06b6d4)` (indigo → cyan)
- Accent text: `#a5b4fc` (light indigo), `#e0e7ff` (near-white indigo)
- Active nav: `rgba(99,102,241,0.1)` bg + `rgba(99,102,241,0.12)` border

**Light mode:**
- Background: `#fafafa` (main), `#fff` (sidebar, cards)
- Borders: `#e8ecf1` (subtle), `rgba(99,102,241,0.1)` (accent)
- Text: `#1a1a2e` (primary), `#64748b` (secondary), `#94a3b8` (muted)
- Accent: same gradient, slightly more saturated
- Active nav: `rgba(99,102,241,0.08)` bg, `#4f46e5` text
- Buttons: gradient bg with `box-shadow: 0 2px 8px rgba(99,102,241,0.25)` instead of glow border

### Temperature Colors (same in both modes)
- Hot: `#ef4444` with `box-shadow: 0 0 6px rgba(239,68,68,0.4)`
- Warm: `#f59e0b` with `box-shadow: 0 0 6px rgba(245,158,11,0.4)`
- Cold: `#3b82f6` with `box-shadow: 0 0 6px rgba(59,130,246,0.3)`
- Booked: `#34d399` with `box-shadow: 0 0 6px rgba(52,211,153,0.4)`

### Stage Badge Colors (dark mode)
- New: `#818cf8` on `rgba(129,140,248,0.08)`
- Contacted: `#fbbf24` on `rgba(251,191,36,0.08)`
- Nurturing: `#a5b4fc` on `rgba(99,102,241,0.08)`
- Qualified: `#34d399` on `rgba(52,211,153,0.08)`
- Booked: `#06b6d4` on `rgba(6,182,212,0.08)`

### Typography
- Font: Inter (already loaded)
- Headings: 20px/600 (page titles), 14px/600 (section titles)
- Body: 13px/400
- Labels: 10-11px uppercase, `letter-spacing: 0.05em`, color muted
- Monospace: tabular-nums for scores, timestamps

## Components

### Sidebar (collapsible)

Two states:
- **Expanded** (220px): Logo + name, nav items with icons + labels, inbox badge count, user avatar + name, theme toggle
- **Collapsed** (56px): Logo icon only, nav icons only with tooltip on hover, inbox badge dot, user initials, theme toggle (compact)

Toggle: chevron button at the bottom of the sidebar, or keyboard shortcut. State persisted to localStorage.

Nav items:
- Pipeline (grid icon)
- Inbox (activity/pulse icon) — with gradient badge showing pending count
- Settings (sun/gear icon)

Active state: indigo tinted background + border in dark mode, indigo bg tint + indigo text in light mode.

User section: avatar with initials (indigo tinted circle), name, email. Sign out via dropdown or button.

Theme toggle: sun/moon pill toggle in the sidebar footer. Sun icon = light mode (toggle knob left), moon icon = dark mode (toggle knob right, knob glows indigo).

### Pipeline List

- Page header: "Pipeline" title + lead count + "+ New lead" gradient button
- Stage filter pills: horizontal row, active pill has indigo bg/border, inactive has subtle border. Each shows count.
- Search input: subtle border, placeholder "Search leads..."
- Table: rounded container with subtle border
  - Header row: uppercase labels, muted color, slight background tint
  - Data rows: temperature dot (glowing) + name/email, stage badge, source, relative time, score (tabular-nums)
  - Hover: subtle indigo tint `rgba(99,102,241,0.04)`
  - Click: navigate to lead detail

### Lead Detail

- Back link: "← Back to pipeline" in indigo
- Lead header: initials avatar (indigo circle) + name + email/phone/source. Temperature badge + stage badge on the right.
- AI Summary card: the hero element
  - Gradient top border (2px, indigo→cyan, 60% opacity)
  - AI icon + "AI SUMMARY" label
  - Summary paragraph
  - Attention alert (if applicable): amber-tinted box with warning icon
  - 2-column grid: Status, Next Action
  - Key Moments timeline: date + description rows
- Conversation: chat bubble layout
  - Inbound (from lead): left-aligned, neutral bg, rounded `12px 12px 12px 4px`
  - Outbound (from AI): right-aligned, indigo-tinted bg, rounded `12px 12px 4px 12px`
  - Each bubble: sender label + channel + timestamp, then content
- Score bar: label + progress bar (gradient fill) + numeric score

### Inbox (two-panel)

- Left panel (240-300px): scrollable list of pending actions
  - "N Pending" header in indigo
  - Active item: indigo border + subtle bg
  - Each item: lead name, action type badge, reasoning excerpt (2-line clamp)
- Right panel: action detail
  - Lead info header: name, email, stage, channel badge
  - AI Reasoning box: indigo-tinted, "AI REASONING" label
  - Proposed Message box: neutral bg, "PROPOSED MESSAGE" label
  - Action buttons (bottom-right):
    - Regenerate: red-tinted outline
    - Edit: indigo outline
    - Approve & Send: gradient fill (primary CTA)
  - Edit mode: textarea replaces message box, Save/Cancel buttons
  - Reject mode: feedback textarea, "Send feedback and regenerate" button
- Empty state when no pending actions

### Settings

- Page header: "Settings" title + subtitle
- Integrations section:
  - Card per integration: icon, name, description, status
  - Connected: green glowing dot + "Connected" label + "Disconnect" outline button
  - Not connected: muted styling + connect CTA
  - Cal.com: "Configure via env" label (no OAuth flow)
- Configuration section: read-only 2-column grid in subtle card
  - Business, AI Persona, Jurisdiction, Approval mode

### Login

- Full-page centered, dark background
- Logo: gradient square with "L", large glow shadow (`box-shadow: 0 0 30px rgba(99,102,241,0.3)`)
- "Lead Engine" title + "Sign in to your dashboard" subtitle
- Form: email + password inputs (subtle border styling), gradient "Sign in" button
- "Powered by OperateAI" footer in muted text

### Notifications Dropdown

- Same bell icon + badge pattern
- Dropdown: dark card with border, max 420px height
- Unread items: subtle indigo background tint + blue dot
- Dismiss X button per item
- "Mark all read" in header
- Notification type styling (icon + accent color for at-a-glance scanning):
  - `message_sent`: green accent, checkmark icon
  - `message_failed`: red accent, alert-circle icon
  - `ai_failed`: amber accent, warning-triangle icon
  - `action_pending`: indigo accent, activity/pulse icon
  - `booking_confirmed`: green accent, calendar-check icon
  - `booking_cancelled`: red accent, calendar-x icon
- Notification routing:
  - `action_pending` → `/inbox`
  - `booking_confirmed` / `booking_cancelled` → `/pipeline/{lead_id}`
  - Others with `lead_id` → `/pipeline/{lead_id}`

## Theme Implementation

Use `next-themes` package:
- `ThemeProvider` wrapping the app in root layout
- `attribute="class"` mode (adds `.dark` class to html)
- `defaultTheme="dark"` (dark-first)
- `enableSystem={false}` — dark-by-default must stick on first visit, don't respect prefers-color-scheme
- `storageKey="lead-engine-theme"` persisted to localStorage

CSS variables in `globals.css` already have light/dark definitions. Update the OkLCH values to match the Ambient Glow palette. Tailwind's `dark:` variant handles component-level overrides.

## Migration Strategy

**CRITICAL: This is a visual-only refactor.** Do not change any API calls, state logic, event handlers, or server interactions. The behavior must remain identical. The review cycles that closed out fixed real bugs — timing-safe comparisons, atomic execute calls, regenerate-with-feedback flow, error mapping, client_id scoping. All of that logic stays untouched. Only the JSX markup and styling changes.

Replace inline styles **entirely** with Tailwind utility classes. This is a full rewrite of each component file's JSX/styling, not a surgical add-Tailwind pass. Every component currently uses inline `style={{}}` props with CSS variables — all of that gets replaced with Tailwind classes. Do not leave half-migrated files with both patterns.

Use shadcn/ui primitives where they exist (Button already set up). Don't introduce new shadcn/ui components where a simple styled div suffices — avoid over-abstracting.

Files to modify (full JSX/style rewrite, preserve all logic):
- `src/app/globals.css` — update CSS variables to Ambient Glow palette
- `src/app/layout.tsx` — add ThemeProvider
- `src/app/page.tsx` — already just a redirect, no changes
- `src/app/(auth)/login/page.tsx` — restyle
- `src/app/(dashboard)/layout.tsx` — update layout structure for collapsible sidebar
- `src/components/sidebar.tsx` — full rewrite: collapsible, icons, theme toggle
- `src/components/pipeline/pipeline-view.tsx` — restyle table, filters, badges
- `src/components/pipeline/lead-detail-view.tsx` — restyle summary card, chat bubbles, score bar
- `src/components/pipeline/new-lead-form.tsx` — restyle form
- `src/components/inbox/inbox-view.tsx` — restyle two-panel, action buttons
- `src/components/settings/settings-view.tsx` — restyle integration cards, config grid
- `src/components/notifications/notification-bell.tsx` — restyle dropdown

New files:
- `src/components/theme-toggle.tsx` — sun/moon toggle component
- `src/components/theme-provider.tsx` — next-themes provider wrapper

New dependency:
- `next-themes`

## What We Don't Build

- Mobile responsive layouts (desktop-first, Joseph uses a laptop/desktop)
- Animation/transitions (ship static first, add polish later)
- Custom icon library (inline SVGs for the 3 nav items + notification bell)
- Design tokens file (CSS variables in globals.css are sufficient)
- Storybook or component documentation

## Mockups

Visual mockups from the brainstorming session are saved in:
`.superpowers/brainstorm/6200-1776633462/content/`

Files:
- `visual-direction.html` — 3 theme directions (Ambient Glow selected)
- `inbox-layout.html` — 2 inbox layouts (Two-panel selected)
- `full-dashboard-pipeline.html` — Pipeline list with sidebar (dark)
- `lead-detail.html` — Lead detail with AI summary + conversation (dark)
- `settings-login.html` — Settings + Login side by side (dark)
- `light-mode.html` — Light vs dark comparison
