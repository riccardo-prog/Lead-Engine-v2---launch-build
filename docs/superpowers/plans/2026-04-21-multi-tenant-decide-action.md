# Multi-Tenant decide-action.ts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all hardcoded Joseph-specific references from the shared decision engine so it works correctly for any client config, including OperateAI.

**Architecture:** The system prompt in `decide-action.ts` currently has 4 hardcodes that break multi-tenant: (1) "call Joseph directly" in script rules, (2) `leadType` locked to seller/buyer/investor, (3) form submission detection locked to "realtor-email", (4) Realtor.ca-specific form submission prompt text. All four get replaced with config-driven equivalents. The pipeline filter UI also hardcodes lead type pills — that gets derived from config instead.

**Tech Stack:** TypeScript, Next.js App Router, Supabase

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/config/schema.ts` | Modify | Add optional `formSourceIds` and `operatorName` to `ClientConfig` |
| `src/config/joseph.config.ts` | Modify | Add `operatorName` and `formSourceIds` fields |
| `src/config/operateai.config.ts` | Modify | Add `operatorName` field |
| `src/engine/nurture/decide-action.ts` | Modify | Replace 4 hardcodes with config-driven logic |
| `src/components/pipeline/pipeline-view.tsx` | Modify | Derive lead type filter pills from config |
| `src/app/(dashboard)/pipeline/page.tsx` | Modify | Pass config to PipelineView |

---

### Task 1: Add `operatorName` and `formSourceIds` to schema and configs

**Files:**
- Modify: `src/config/schema.ts:62-77`
- Modify: `src/config/joseph.config.ts:1-10`
- Modify: `src/config/operateai.config.ts:1-10`

- [ ] **Step 1: Add fields to ClientConfig type**

In `src/config/schema.ts`, add two optional fields to `ClientConfig`:

```typescript
export type ClientConfig = {
  clientId: string
  businessName: string
  industry: string
  jurisdiction: ComplianceJurisdiction
  operatorName?: string
  formSourceIds?: string[]
  funnelStages: FunnelStage[]
  // ... rest unchanged
}
```

`operatorName` — the human's name the AI references when suggesting a call (e.g., "Joseph", "Riccardo"). Optional because not all businesses want leads calling a named person.

`formSourceIds` — source IDs where the first inbound "message" is structured form data, not a personal message. The AI needs to know this to avoid responding with "thanks for your message" to a form fill.

- [ ] **Step 2: Add fields to Joseph's config**

In `src/config/joseph.config.ts`, add after `operatorEmail`:

```typescript
  operatorEmail: process.env.OPERATOR_EMAIL || "",
  operatorName: "Joseph",
  formSourceIds: ["realtor-email"],
```

This preserves Joseph's existing behavior: the AI will still suggest calling Joseph, and will still detect Realtor.ca form submissions.

- [ ] **Step 3: Add fields to OperateAI config**

In `src/config/operateai.config.ts`, add after `operatorEmail`:

```typescript
  operatorEmail: process.env.OPERATEAI_OPERATOR_EMAIL || "",
  operatorName: "Riccardo",
```

No `formSourceIds` needed — OperateAI doesn't have form-based lead sources.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (fields are optional, so existing code won't break)

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts src/config/joseph.config.ts src/config/operateai.config.ts
git commit -m "feat: add operatorName and formSourceIds to ClientConfig schema"
```

---

### Task 2: Make system prompt config-driven — remove "call Joseph" hardcode

**Files:**
- Modify: `src/engine/nurture/decide-action.ts:99-107`

- [ ] **Step 1: Replace hardcoded script rules block**

In `src/engine/nurture/decide-action.ts`, replace lines 99-107 (the `CONVERSATION SCRIPTS:` section through the `IMPORTANT RULES` block) with:

```typescript
CONVERSATION SCRIPTS:
You must follow these qualification scripts based on the lead type. Determine the lead type from their messages, source, and context, then follow the appropriate script.

IMPORTANT RULES FOR ALL SCRIPTS:
- Ask ONE question at a time. Never dump multiple questions in a single message.
- Track which questions have already been answered from prior messages — don't re-ask.
${config.operatorName
  ? `- When appropriate, offer the lead the option to speak directly with ${config.operatorName} instead of continuing over text. If they prefer text/email, continue the qualification over message.`
  : `- Continue qualification over message unless the lead requests a phone call.`}
- Follow the branching logic in each step (e.g., if a step has conditional instructions, follow them based on context).
- When a step says "prompt booking calendar" or mentions dropping the booking link, use the book_appointment action with bookingMode "send_link".
```

This replaces:
- "call Joseph directly" → config-driven `operatorName`
- "buyer who wants to buy & sell → switch to seller script" → generic branching instruction

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/engine/nurture/decide-action.ts
git commit -m "fix: replace hardcoded Joseph reference in system prompt with config.operatorName"
```

---

### Task 3: Make leadType config-driven — remove seller/buyer/investor hardcode

**Files:**
- Modify: `src/engine/nurture/decide-action.ts:6-19` (NurtureDecision type)
- Modify: `src/engine/nurture/decide-action.ts:124-138` (RESPONSE FORMAT in prompt)

- [ ] **Step 1: Change leadType from union to string in NurtureDecision**

In `src/engine/nurture/decide-action.ts`, change line 14 from:

```typescript
  leadType?: "seller" | "buyer" | "investor"
```

to:

```typescript
  leadType?: string
```

This allows any client's script `leadType` values (e.g., "cold-reply", "ora-engaged", "inbound-inquiry") to be stored.

- [ ] **Step 2: Update RESPONSE FORMAT in system prompt to use config script types**

In `src/engine/nurture/decide-action.ts`, find the RESPONSE FORMAT block (around line 124-138). Replace the `leadType` line:

From:
```
  "leadType": "seller" | "buyer" | "investor" (optional — set this once you can determine it from context),
```

To:
```
  "leadType": "${config.conversationScripts.map(s => `"${s.leadType}"`).join(" | ")} (optional — set this when you identify which script applies to this lead)",
```

This makes the prompt show the actual script types from the current client's config.

The full RESPONSE FORMAT block becomes:
```typescript
RESPONSE FORMAT:
Respond with a JSON object matching this shape:
{
  "action": "send_message" | "advance_stage" | "book_appointment" | "disqualify" | "wait" | "flag_human",
  "reasoning": "string - explain your decision clearly, 1-3 sentences",
  "channel": "${config.channels.map(c => `"${c}"`).join(" | ")} (only if action is send_message)",
  "message": "string - the message body (only if action is send_message)",
  "subject": "string - email subject (only if channel is email)",
  "newStageId": "string - the stage id to advance to (only if action is advance_stage)",
  "scoreAdjustment": number (optional, -30 to +30 — use larger values for clear intent signals),
  "leadType": ${config.conversationScripts.map(s => `"${s.leadType}"`).join(" | ")} (optional — set this when you identify which script applies to this lead),
  "flagReason": "string (only if action is flag_human)",
  "bookingMode": "specific_time" | "send_link" (only if action is book_appointment),
  "requestedTime": "ISO 8601 datetime (only if bookingMode is specific_time)"
}
```

Note: channel options also changed from hardcoded list to `config.channels`. And "buying/selling signals" changed to "intent signals" (generic).

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/engine/nurture/decide-action.ts
git commit -m "fix: make leadType and channel options config-driven in NurtureDecision"
```

---

### Task 4: Make form submission detection config-driven — remove "realtor-email" hardcode

**Files:**
- Modify: `src/engine/nurture/decide-action.ts:60-65` (FORM SUBMISSION section in system prompt)
- Modify: `src/engine/nurture/decide-action.ts:182` (isFormSubmission check)
- Modify: `src/engine/nurture/decide-action.ts:244` (form submission warning in decision prompt)

- [ ] **Step 1: Replace hardcoded form submission detection in buildDecisionPrompt**

In `src/engine/nurture/decide-action.ts`, replace line 182:

From:
```typescript
  const isFormSubmission = lead.source_id === "realtor-email" && messages.length <= 1
```

To:
```typescript
  const isFormSubmission = config.formSourceIds?.includes(lead.source_id) && messages.length <= 1
```

- [ ] **Step 2: Replace hardcoded form submission warning in decision prompt**

In `src/engine/nurture/decide-action.ts`, replace line 244:

From:
```typescript
${isFormSubmission ? "⚠️ FORM SUBMISSION: This is a Realtor.ca form inquiry, not a personal message. Craft an initial outreach referencing the specific property in custom_fields. Do NOT respond as if they wrote you a message." : ""}
```

To:
```typescript
${isFormSubmission ? "⚠️ FORM SUBMISSION: This lead came from a form submission, not a personal message. The first inbound 'message' is structured form data. Craft an initial outreach that references relevant details from custom_fields. Do NOT respond as if they wrote you personally — avoid 'thanks for your message' or 'as you mentioned.'" : ""}
```

- [ ] **Step 3: Replace hardcoded form submission block in system prompt**

In `src/engine/nurture/decide-action.ts`, replace lines 60-65 (the FORM SUBMISSION VS REAL MESSAGE block):

From:
```typescript
FORM SUBMISSION VS REAL MESSAGE (CRITICAL):
Some leads come from form submissions (like Realtor.ca) where the "message" in the conversation history is actually structured form data or a template message, NOT something the lead personally wrote.
- When source is 'realtor-email' or similar form sources, the first inbound "message" is form data, not a personal message from the lead.
- DO NOT respond as if they wrote to you personally. Instead, craft an initial outreach that references the specific property they inquired about, introduces yourself, and asks relevant questions to qualify them.
- Use any custom fields like property_address, listing_number to make the message feel personal and informed.
- Avoid phrases like "thanks for your message" or "as you mentioned" since they didn't actually message you — they filled out a form.
```

To:
```typescript
${config.formSourceIds && config.formSourceIds.length > 0 ? `FORM SUBMISSION VS REAL MESSAGE (CRITICAL):
Some leads come from form submissions where the "message" in the conversation history is actually structured form data or a template message, NOT something the lead personally wrote.
- Form-based sources for this business: ${config.formSourceIds.join(", ")}
- When a lead comes from one of these sources, the first inbound "message" is form data, not a personal message.
- DO NOT respond as if they wrote to you personally. Instead, craft an initial outreach that references relevant details from custom_fields, introduces yourself, and asks qualifying questions.
- Avoid phrases like "thanks for your message" or "as you mentioned" since they didn't actually message you — they filled out a form.` : ""}
```

This way the entire block is omitted for clients (like OperateAI) that have no form sources.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/engine/nurture/decide-action.ts
git commit -m "fix: make form submission detection config-driven via formSourceIds"
```

---

### Task 5: Make pipeline lead type filter config-driven

**Files:**
- Modify: `src/components/pipeline/pipeline-view.tsx:150`
- Modify: `src/app/(dashboard)/pipeline/page.tsx` (pass config)

- [ ] **Step 1: Check current pipeline page props**

Read `src/app/(dashboard)/pipeline/page.tsx` to see what props are passed to `PipelineView`.

- [ ] **Step 2: Pass conversationScripts lead types from page to PipelineView**

In `src/app/(dashboard)/pipeline/page.tsx`, after fetching config, extract the lead types and pass them:

```typescript
const leadTypes = config.conversationScripts.map(s => s.leadType)
```

Pass `leadTypes` as a prop to `<PipelineView>`.

- [ ] **Step 3: Update PipelineView to accept leadTypes prop**

In `src/components/pipeline/pipeline-view.tsx`, add `leadTypes` to the component props:

```typescript
export function PipelineView({
  leads: initialLeads,
  stages,
  leadTypes,
}: {
  leads: Lead[]
  stages: FunnelStage[]
  leadTypes: string[]
}) {
```

- [ ] **Step 4: Replace hardcoded lead type pills**

In `src/components/pipeline/pipeline-view.tsx`, replace line 150:

From:
```typescript
{(["all", "buyer", "seller", "investor", "unknown"] as const).map((t) => (
```

To:
```typescript
{(["all", ...leadTypes, "unknown"] as const).map((t) => (
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/pipeline/pipeline-view.tsx src/app/\\(dashboard\\)/pipeline/page.tsx
git commit -m "fix: derive pipeline lead type filters from config instead of hardcoding"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Verify the operateai config is complete and valid**

Read `src/config/operateai.config.ts` and verify all fields match the spec at `docs/superpowers/specs/2026-04-21-operateai-sales-config-design.md`.

- [ ] **Step 3: Verify no remaining Joseph hardcodes in shared engine code**

Search for "Joseph", "realtor", "seller", "buyer", "investor" in `src/engine/` — none of these strings should appear in shared code. They should only exist in `src/config/joseph.config.ts`.

Run: `grep -rn "Joseph\|realtor\|\"seller\"\|\"buyer\"\|\"investor\"" src/engine/`
Expected: No matches

- [ ] **Step 4: Commit any cleanup**

If any issues found, fix and commit.
