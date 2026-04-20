# UI Redesign — Ambient Glow Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire Lead Engine dashboard from inline styles to Tailwind + shadcn/ui with the "Ambient Glow" dark/light theme.

**Architecture:** Visual-only refactor. Every component gets a full JSX/style rewrite — inline `style={{}}` props replaced entirely with Tailwind classes. All API calls, state logic, event handlers, and server interactions remain identical. Theme toggling via `next-themes` with CSS variables.

**Tech Stack:** Tailwind CSS (already configured), shadcn/ui (Button already set up), next-themes (new dependency), Inter font (already loaded).

**Spec:** `docs/superpowers/specs/2026-04-19-ui-redesign-design.md`

**CRITICAL RULE:** This is a visual-only refactor. Do NOT change any API calls, state logic, event handlers, or server interactions. The behavior must remain identical. Only JSX markup and styling changes.

---

### Task 1: Foundation — next-themes + CSS variables + theme provider

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/theme-provider.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `package.json`

- [ ] **Step 1: Install next-themes**

Run:
```bash
npm install next-themes
```

- [ ] **Step 2: Create theme provider wrapper**

Create `src/components/theme-provider.tsx`:

```tsx
"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="lead-engine-theme"
    >
      {children}
    </NextThemesProvider>
  )
}
```

- [ ] **Step 3: Update globals.css with Ambient Glow palette**

Replace the existing CSS variable definitions in `src/app/globals.css`. Keep all Tailwind imports and the `@theme inline` block structure. Update the color values to match the Ambient Glow palette from the spec.

Key dark mode variables:
- `--background`: `#09090b`
- `--foreground`: `#e2e8f0`
- `--card`: `#111`
- `--primary`: `#6366f1`
- `--primary-foreground`: `#e0e7ff`
- `--muted`: `#1a1a2e`
- `--muted-foreground`: `#555`
- `--border`: `rgba(99,102,241,0.08)`
- `--accent`: `#06b6d4`

Key light mode variables:
- `--background`: `#fafafa`
- `--foreground`: `#1a1a2e`
- `--card`: `#fff`
- `--primary`: `#6366f1`
- `--primary-foreground`: `#fff`
- `--muted`: `#f8fafc`
- `--muted-foreground`: `#94a3b8`
- `--border`: `#e8ecf1`

Add a `.dark` selector block for dark mode variables (next-themes adds `.dark` class to html). The light mode values should be the default (no selector), dark mode under `.dark`.

Wait — the spec says dark-first. Since `defaultTheme="dark"` and `enableSystem={false}`, most users will be in dark mode. But CSS convention with next-themes `attribute="class"` is: root = light, `.dark` = dark. Follow that convention — light as default CSS, `.dark` overrides.

- [ ] **Step 4: Wrap app in ThemeProvider**

Modify `src/app/layout.tsx`. Read the file first. Add the import and wrap `{children}` in `<ThemeProvider>`. Do not change anything else — keep existing fonts, metadata, and structure.

```tsx
import { ThemeProvider } from "@/components/theme-provider"

// In the body:
<ThemeProvider>
  {children}
</ThemeProvider>
```

- [ ] **Step 5: Verify dev server loads**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run dev
```

Open `http://localhost:3000`. Page should load without errors. The theme will look broken (old inline styles + new CSS vars) — that's expected. We're just verifying the foundation works.

- [ ] **Step 6: Commit**

```bash
git add src/components/theme-provider.tsx src/app/globals.css src/app/layout.tsx package.json package-lock.json
git commit -m "feat: add next-themes provider and Ambient Glow CSS variables"
```

---

### Task 2: Theme toggle component

**Files:**
- Create: `src/components/theme-toggle.tsx`

- [ ] **Step 1: Create the toggle component**

Create `src/components/theme-toggle.tsx`:

```tsx
"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — don't render until mounted
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className={compact ? "w-8 h-5" : "w-10 h-[22px]"} />

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`
        relative rounded-full border cursor-pointer transition-colors
        ${compact ? "w-8 h-5" : "w-10 h-[22px]"}
        ${isDark
          ? "bg-indigo-500/20 border-indigo-500/20"
          : "bg-indigo-500/12 border-indigo-500/15"
        }
      `}
    >
      <span
        className={`
          absolute top-[2px] flex items-center justify-center rounded-full text-[9px] transition-all
          ${compact ? "w-4 h-4" : "w-4 h-4"}
          ${isDark
            ? "right-[2px] left-auto bg-indigo-500 text-white shadow-[0_0_8px_rgba(99,102,241,0.4)]"
            : "left-[2px] right-auto bg-white text-gray-600 border border-black/8 shadow-sm"
          }
        `}
      >
        {isDark ? "☽" : "☀"}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/theme-toggle.tsx
git commit -m "feat: add theme toggle component"
```

---

### Task 3: Sidebar — full rewrite with collapsible + theme toggle

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Read existing sidebar.tsx and dashboard layout.tsx**

Read both files completely. Note all the behavioral code:
- `usePathname()` for active state
- `useRouter()` for navigation
- Supabase `signOut` call
- `NotificationBell` import and rendering
- User email display

All of this logic must be preserved exactly. Only the JSX markup and styles change.

- [ ] **Step 2: Rewrite sidebar.tsx**

Replace the entire component. Key changes:
- Add `useState` for collapsed state, persisted to `localStorage`
- Expanded = 220px, collapsed = 56px
- Nav items: Pipeline (grid icon), Inbox (pulse icon + badge), Settings (gear icon)
- Active state: indigo tinted bg + border in dark, indigo bg + text in light
- Collapsed: icon-only with tooltips
- Footer: user initials avatar, name (hidden when collapsed), ThemeToggle, sign out
- NotificationBell stays in the header area

Use Tailwind classes for all styling. Use `dark:` variants where light/dark differ. Use inline SVGs for the 3 nav icons (same ones from the mockups).

Preserve all behavior:
- `usePathname()` check for active nav item
- `supabase.auth.signOut()` on sign out click
- `router.push("/login")` after sign out
- `NotificationBell` component rendered in the same position

```tsx
"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { ThemeToggle } from "@/components/theme-toggle"
```

The collapsed state should be stored in localStorage key `"lead-engine-sidebar"` and read on mount.

- [ ] **Step 3: Update dashboard layout.tsx**

Read `src/app/(dashboard)/layout.tsx`. The layout currently sets the sidebar width to 240px fixed. Update it to use a flexible layout that responds to the sidebar's own width. The sidebar component manages its own width now.

Keep the auth check (redirect to `/login` if no user) and user email pass-through exactly as-is.

Replace inline styles with Tailwind:
```tsx
<div className="flex h-screen">
  <Sidebar userEmail={user.email || ""} />
  <main className="flex-1 overflow-y-auto bg-background p-8">
    {children}
  </main>
</div>
```

- [ ] **Step 4: Verify sidebar renders in both states**

Run dev server, open `http://localhost:3000`. Click the collapse toggle. Verify:
- Sidebar expands/collapses
- Nav items show icons + labels when expanded, icons only when collapsed
- Active state highlights correctly
- Theme toggle works
- NotificationBell still renders
- Sign out still works

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx src/app/(dashboard)/layout.tsx
git commit -m "feat: rewrite sidebar with collapsible layout and theme toggle"
```

---

### Task 4: Pipeline list view — full rewrite

**Files:**
- Modify: `src/components/pipeline/pipeline-view.tsx`

- [ ] **Step 1: Read existing pipeline-view.tsx**

Read the file completely. Note all behavioral code:
- `useState` for `activeStage` and `search` filters
- `useRouter()` for navigation to lead detail
- `config.funnelStages` mapping for stage pills
- `config.leadSources` for source label lookup
- Filter logic: stage filter + search (name/email)
- `timeAgo()` helper function
- Click handler: `router.push(`/pipeline/${lead.id}`)`

All of this must be preserved exactly.

- [ ] **Step 2: Rewrite pipeline-view.tsx**

Replace all inline styles with Tailwind classes. Key visual changes:
- Header: "Pipeline" title + lead count + "+ New lead" gradient button
- Stage filter pills: `rounded-md` pills with indigo active state, counts in each
- Search input: `bg-white/3 dark:bg-white/3 border border-border rounded-lg`
- Table container: `border border-indigo-500/[0.06] dark:border-indigo-500/[0.06] rounded-xl overflow-hidden`
- Header row: uppercase labels, muted, slight bg tint
- Data rows: temperature dot (colored + glowing via `shadow-[0_0_6px_...]`), name/email, stage badge (colored per stage), source, relative time, score (tabular-nums)
- Row hover: `hover:bg-indigo-500/[0.04]`

Temperature dot colors (from the lead summary `temperature` field if available, otherwise derive from score):
- score >= 70: hot (red dot)
- score >= 40: warm (amber dot)
- score < 40: cold (blue dot)
- stage === "booked": green dot

Stage badge Tailwind classes — use a helper function that maps `stage_id` to text color + bg color classes.

Preserve the `timeAgo()` function — just move it to the bottom of the file, unchanged.

- [ ] **Step 3: Verify pipeline renders**

Open `http://localhost:3000/pipeline`. Verify:
- Stage filter pills work
- Search filters correctly
- Table rows render with temperature dots and stage badges
- Clicking a row navigates to detail
- "+ New lead" button navigates to `/pipeline/new`

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline/pipeline-view.tsx
git commit -m "feat: restyle pipeline list view with Ambient Glow theme"
```

---

### Task 5: Lead detail view — full rewrite

**Files:**
- Modify: `src/components/pipeline/lead-detail-view.tsx`

- [ ] **Step 1: Read existing lead-detail-view.tsx**

Read completely. Note behavioral code:
- Props: `lead`, `messages`, `actions`, `config`, `summary`
- `useState` for `showMessages` toggle
- Back link to `/pipeline`
- Summary rendering (temperature badge, attention badge, status, next action, key moments)
- Message rendering loop with direction-based styling
- No API calls in this component — it's purely presentational from server-fetched data

- [ ] **Step 2: Rewrite lead-detail-view.tsx**

Replace all inline styles. Key visual changes:
- Back link: `text-indigo-500 hover:text-indigo-400`
- Lead header: initials avatar (indigo circle), name, contact info, temperature badge + stage badge on right
- AI Summary card: the hero element
  - Container: `bg-indigo-500/[0.03] border border-indigo-500/10 rounded-xl p-5 relative overflow-hidden`
  - Gradient top border: `absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-cyan-500 to-indigo-500 opacity-60`
  - AI icon + "AI SUMMARY" label in indigo
  - Summary text: `text-sm text-foreground leading-relaxed`
  - Attention alert: amber-tinted box `bg-amber-500/[0.08] border border-amber-500/12 rounded-lg`
  - Status / Next Action: 2-column grid
  - Key Moments: date + description timeline
- Conversation: chat bubble layout
  - Inbound: left-aligned, `bg-white/[0.04] dark:bg-white/[0.04] border border-white/[0.06] rounded-xl rounded-bl-sm`
  - Outbound: right-aligned, `bg-indigo-500/[0.06] border border-indigo-500/10 rounded-xl rounded-br-sm`
  - Each bubble: sender + channel + time header, then content
- Score bar: label + progress bar with gradient fill + numeric score

Preserve all rendering logic, conditional checks, and the `showMessages` toggle.

- [ ] **Step 3: Verify lead detail renders**

Navigate to a lead detail page. Verify:
- Summary card renders with gradient border
- Temperature and stage badges display correctly
- Conversation bubbles are directional (left/right)
- Score bar fills correctly
- "Show/hide messages" toggle works
- Back link navigates to pipeline

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline/lead-detail-view.tsx
git commit -m "feat: restyle lead detail view with AI summary card and chat bubbles"
```

---

### Task 6: New lead form — full rewrite

**Files:**
- Modify: `src/components/pipeline/new-lead-form.tsx`

- [ ] **Step 1: Read existing new-lead-form.tsx**

Read completely. Note behavioral code:
- Form state: `firstName`, `lastName`, `email`, `phone`, `sourceId`
- `handleSubmit`: POST to `/api/intake`, redirect on success
- Error state display
- Loading state on submit button
- Cancel navigates back to `/pipeline`
- Custom `Field` sub-component for input styling

- [ ] **Step 2: Rewrite new-lead-form.tsx**

Replace all inline styles. Key visual changes:
- Container: `max-w-lg` centered
- Input fields: `bg-white/[0.03] dark:bg-white/[0.03] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-indigo-500/30 focus:outline-none`
- Labels: `text-xs text-muted-foreground uppercase tracking-wide`
- Source dropdown: same input styling
- Submit button: gradient bg (primary CTA)
- Cancel button: subtle outline
- Error display: red-tinted box

Preserve all form state management, the `handleSubmit` function, loading state, error handling, and the POST to `/api/intake` exactly as-is.

- [ ] **Step 3: Verify form works**

Navigate to `/pipeline/new`. Fill in fields, verify:
- Inputs accept text
- Source dropdown populates from config
- Submit calls API (check network tab)
- Cancel navigates back
- Error state displays on failure

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline/new-lead-form.tsx
git commit -m "feat: restyle new lead form with Ambient Glow theme"
```

---

### Task 7: Inbox view — full rewrite

**Files:**
- Modify: `src/components/inbox/inbox-view.tsx`

- [ ] **Step 1: Read existing inbox-view.tsx**

Read completely. This is the most complex component. Note ALL behavioral code:
- Props: `actions`, `leadMap`
- `useState` for: `selectedId`, `mode` (view/edit/reject), `editContent`, `feedback`, `error`, `loading`
- `handleApprove`: POST to `/api/actions/execute` with optional `contentOverride`
- `handleRegenerate`: POST to `/api/actions/regenerate` with feedback
- Mode transitions: view → edit (textarea appears), view → reject (feedback textarea appears)
- `inferChannel` helper function
- `friendlyActionType` helper function
- Selected action highlighting in left panel
- Right panel conditional rendering based on mode

**Every single one of these must be preserved exactly.** This is the component where the review cycles fixed the most bugs.

- [ ] **Step 2: Rewrite inbox-view.tsx**

Replace all inline styles. Key visual changes:
- Two-panel layout: `flex h-full`
- Left panel (280px): `w-[280px] border-r border-border overflow-y-auto`
  - "N Pending" header in indigo uppercase
  - Action cards: selected has `bg-indigo-500/[0.08] border border-indigo-500/15`, unselected has `bg-white/[0.02] border border-white/[0.04]`
  - Card content: lead name, action type badge, reasoning excerpt (2-line clamp via `line-clamp-2`)
- Right panel: `flex-1 p-6 flex flex-col`
  - Lead info header with channel badge
  - AI Reasoning box: `bg-indigo-500/[0.04] border border-indigo-500/[0.08] rounded-lg`
  - Proposed message box: `bg-white/[0.02] border border-white/[0.05] rounded-lg`
  - Action buttons row (bottom-right):
    - Regenerate: `text-red-400 border border-red-400/15 rounded-md hover:bg-red-400/[0.06]`
    - Edit: `text-indigo-400 border border-indigo-500/15 rounded-md hover:bg-indigo-500/[0.06]`
    - Approve & Send: `bg-gradient-to-r from-indigo-500/30 to-cyan-500/30 border border-indigo-500/20 text-white rounded-md`
  - Edit mode: textarea with same input styling as new-lead-form, Save + Cancel buttons
  - Reject mode: feedback textarea, "Send feedback and regenerate" button
- Empty state: centered message when no pending actions

Preserve every handler, every state variable, every API call, every mode transition.

- [ ] **Step 3: Verify inbox works end-to-end**

Navigate to `/inbox`. If there are pending actions, verify:
- Left panel lists actions
- Clicking an action shows detail in right panel
- Approve button calls `/api/actions/execute`
- Edit mode shows textarea, save sends with `contentOverride`
- Regenerate mode shows feedback textarea, sends to `/api/actions/regenerate`
- Error messages display correctly
- Loading states work

- [ ] **Step 4: Commit**

```bash
git add src/components/inbox/inbox-view.tsx
git commit -m "feat: restyle inbox view with two-panel Ambient Glow layout"
```

---

### Task 8: Settings view — full rewrite

**Files:**
- Modify: `src/components/settings/settings-view.tsx`

- [ ] **Step 1: Read existing settings-view.tsx**

Read completely. Note behavioral code:
- Props: `config`, `connections`, `successMessage`, `errorMessage`
- `IntegrationRow` sub-component with connect/disconnect logic
- OAuth flow: `window.location.href = "/api/auth/microsoft/start"` (and meta)
- Disconnect: `fetch(`/api/connections/${id}`, { method: "DELETE" })`
- `useState` for disconnect loading state
- `router.refresh()` after disconnect
- Alert message display (success/error from query params)
- Config display grid (read-only)

- [ ] **Step 2: Rewrite settings-view.tsx**

Replace all inline styles. Key visual changes:
- Page header: "Settings" title + subtitle
- Success/error alerts: green/red tinted boxes with dismiss
- Integrations section: "INTEGRATIONS" label
  - Cards: `bg-indigo-500/[0.03] border border-indigo-500/[0.08] rounded-xl p-4`
  - Icon: colored circle with emoji/letter
  - Connected status: green glowing dot + "Connected" text
  - Disconnect button: subtle outline
  - Connect button: indigo outline
  - Cal.com: muted styling, "Configure via env" label
- Config section: "CONFIGURATION" label
  - Container: `bg-white/[0.02] border border-white/[0.04] rounded-xl p-4`
  - 2-column grid of label/value pairs
  - Labels: `text-[10px] text-muted-foreground uppercase tracking-wide`
  - Values: `text-sm text-secondary-foreground`

Preserve all OAuth redirect logic, disconnect API calls, router.refresh(), and alert handling.

- [ ] **Step 3: Verify settings works**

Navigate to `/settings`. Verify:
- Integration cards render with correct connected/disconnected state
- Connect buttons trigger OAuth redirect
- Disconnect button calls API and refreshes
- Config grid displays correctly
- Success/error messages from URL params display

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/settings-view.tsx
git commit -m "feat: restyle settings view with integration cards"
```

---

### Task 9: Notification bell — full rewrite with type-specific styling

**Files:**
- Modify: `src/components/notifications/notification-bell.tsx`

- [ ] **Step 1: Read existing notification-bell.tsx**

Read completely. Note behavioral code:
- `useNotifications()` hook: `items`, `unreadCount`, `markRead`, `markAllRead`, `dismiss`
- `useState` for `open` (dropdown visibility)
- `useRef` for outside click detection
- `useEffect` for outside click listener
- `handleItemClick`: marks read + navigates based on type
- `handleDismiss`: stops propagation + calls dismiss
- `timeAgo` helper function
- Routing logic: action_pending → inbox, booking types → pipeline, others → pipeline

- [ ] **Step 2: Rewrite notification-bell.tsx**

Replace all inline styles. Key visual changes:
- Bell button: `relative p-1.5 rounded-md text-muted-foreground hover:text-foreground`
- Badge: `absolute top-0.5 right-0.5 min-w-4 h-4 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-[10px] text-white font-semibold`
- Dropdown: `absolute top-[calc(100%+8px)] left-0 w-[340px] max-h-[420px] bg-card border border-border rounded-xl shadow-lg overflow-hidden`
- Header: title + "Mark all read" button
- Notification items: unread dot + title + body preview + time + dismiss X
- Unread items: `bg-indigo-500/[0.04]`

**Type-specific styling** (new — add a helper function):
```tsx
function notificationMeta(type: string): { icon: string; color: string } {
  switch (type) {
    case "message_sent": return { icon: "✓", color: "text-green-400" }
    case "message_failed": return { icon: "✕", color: "text-red-400" }
    case "ai_failed": return { icon: "⚠", color: "text-amber-400" }
    case "action_pending": return { icon: "●", color: "text-indigo-400" }
    case "booking_confirmed": return { icon: "✓", color: "text-green-400" }
    case "booking_cancelled": return { icon: "✕", color: "text-red-400" }
    default: return { icon: "●", color: "text-muted-foreground" }
  }
}
```

Render the icon + color before each notification title. This lets the operator scan types at a glance.

Preserve all event handlers, routing logic, outside click detection, and the `timeAgo` function.

- [ ] **Step 3: Verify notifications work**

Click the bell icon. Verify:
- Dropdown opens/closes
- Unread badge shows count
- Items have type-specific icons and colors
- Clicking navigates to correct page and marks read
- Dismiss X removes the item
- "Mark all read" works
- Outside click closes dropdown

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/notification-bell.tsx
git commit -m "feat: restyle notification bell with type-specific icons"
```

---

### Task 10: Login page — full rewrite

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Read existing login/page.tsx**

Read completely. Note behavioral code:
- `"use client"` directive
- `useState` for `email`, `password`, `error`, `loading`
- Supabase client creation: `createBrowserClient()`
- `handleSubmit`: `supabase.auth.signInWithPassword()`, redirect to `/pipeline`
- Enter key handler on password field
- Error display

- [ ] **Step 2: Rewrite login/page.tsx**

Replace all inline styles. Key visual changes:
- Full-page: `min-h-screen bg-background flex items-center justify-center`
- Card: `w-[340px]` centered, no visible card border (just the dark/light background)
- Logo: gradient square with "L", glow shadow `shadow-[0_0_30px_rgba(99,102,241,0.3)]`
- "Lead Engine" title + "Sign in to your dashboard" subtitle
- Input fields: same styling as new-lead-form inputs
- Submit button: gradient fill, full width
- Error: red text below button
- Footer: "Powered by OperateAI" in `text-[10px] text-muted-foreground`

Preserve all auth logic, state management, and Supabase calls exactly.

- [ ] **Step 3: Verify login works**

Navigate to `/login` (sign out first if needed). Verify:
- Logo renders with glow
- Form accepts input
- Submit authenticates and redirects
- Error state displays on wrong credentials
- Dark/light theme applies correctly

- [ ] **Step 4: Commit**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "feat: restyle login page with Ambient Glow theme"
```

---

### Task 11: Final pass — verify all pages in both themes

**Files:** None (verification only)

- [ ] **Step 1: Full walkthrough in dark mode**

With theme set to dark, verify every page:
1. Login → sign in
2. Pipeline list → filter by stage, search, click a lead
3. Lead detail → summary card, conversation, score, back link
4. Pipeline → click "+ New lead" → fill form → submit
5. Inbox → select action, approve/edit/regenerate
6. Settings → integration status, config display
7. Notifications → bell badge, dropdown, click item, dismiss, mark all read
8. Sidebar → collapse/expand, active states, sign out

- [ ] **Step 2: Full walkthrough in light mode**

Toggle to light mode. Repeat the same walkthrough. Verify:
- All text is readable (no white-on-white or dark-on-dark)
- Accent colors pop correctly
- Temperature dots and stage badges are visible
- Borders are visible but subtle
- Gradient button has box-shadow instead of glow border

- [ ] **Step 3: Fix any visual issues found**

Address any problems discovered during the walkthrough. Common issues:
- Missing `dark:` variants (text invisible in one mode)
- Borders too subtle or too harsh in light mode
- Gradient elements not adapting to light mode
- Focus states missing or invisible

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: visual polish from full theme walkthrough"
```
