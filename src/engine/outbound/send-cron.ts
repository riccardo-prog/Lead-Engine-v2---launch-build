import { createServiceClient } from "@/lib/supabase-server"
import { sendEmailViaGmail } from "@/engine/messaging/gmail"
import { getConfig } from "@/lib/config"
import { notify } from "@/engine/notifications/notify"
import { isSuppressed } from "./suppression"
import { personalizeEmail } from "./personalize"
import { getSequence } from "./campaigns"
import type {
  OutboundSendingAccount,
  OutboundEmail,
  OutboundProspect,
  OutboundCampaign,
  SequenceStep,
} from "./types"

function nowInET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Toronto" }))
}

function todayDateET(): string {
  return nowInET().toISOString().split("T")[0]
}

function isWithinSendingHours(): boolean {
  const etNow = nowInET()
  const hour = etNow.getHours()
  return hour >= 9 && hour < 17
}

export async function runOutboundSendCron(clientId: string): Promise<{
  sent: number
  skipped: number
  failed: number
  errors: string[]
}> {
  if (!isWithinSendingHours()) {
    return { sent: 0, skipped: 0, failed: 0, errors: [] }
  }

  const supabase = createServiceClient()
  const stats = { sent: 0, skipped: 0, failed: 0, errors: [] as string[] }

  const { data: accounts } = await supabase
    .from("outbound_sending_accounts")
    .select("*")
    .eq("client_id", clientId)

  if (!accounts || accounts.length === 0) return stats

  for (const rawAccount of accounts) {
    const account = rawAccount as OutboundSendingAccount

    // Daily reset check
    const today = todayDateET()
    if (account.last_reset_date !== today) {
      await supabase
        .from("outbound_sending_accounts")
        .update({
          sends_today: 0,
          sends_failed_today: 0,
          last_reset_date: today,
        })
        .eq("id", account.id)
      account.sends_today = 0
      account.sends_failed_today = 0
    }

    // Pause check
    if (account.paused_until && new Date(account.paused_until).getTime() > Date.now()) {
      continue
    }

    // Clear expired pause
    if (account.paused_until && new Date(account.paused_until).getTime() <= Date.now()) {
      await supabase
        .from("outbound_sending_accounts")
        .update({ paused_until: null, pause_reason: null })
        .eq("id", account.id)
    }

    // Warmup-aware capacity
    const warmupLimits: Record<number, number> = { 1: 5, 2: 10, 3: 20 }
    const warmupLimit = warmupLimits[account.warmup_week] ?? account.daily_limit
    const effectiveLimit = Math.min(account.daily_limit, warmupLimit)
    const remaining = effectiveLimit - account.sends_today

    if (remaining <= 0) continue

    // Get eligible emails
    const { data: emails } = await supabase
      .from("outbound_emails")
      .select(`
        *,
        outbound_prospects!inner(*),
        outbound_campaigns!inner(*)
      `)
      .eq("status", "pending")
      .lte("send_after", new Date().toISOString())
      .eq("outbound_campaigns.status", "active")
      .eq("outbound_campaigns.sending_account_id", account.id)
      .in("outbound_prospects.status", ["pending", "sending"])
      .not("outbound_prospects.icp_score", "is", null)
      .order("send_after", { ascending: true })
      .limit(remaining)

    if (!emails || emails.length === 0) continue

    for (const emailRow of emails) {
      const email = emailRow as OutboundEmail & {
        outbound_prospects: OutboundProspect
        outbound_campaigns: OutboundCampaign
      }
      const prospect = email.outbound_prospects
      const campaign = email.outbound_campaigns

      // Atomic claim: only proceed if we successfully flip pending → sending
      const { data: claimed } = await supabase
        .from("outbound_emails")
        .update({ status: "sending" })
        .eq("id", email.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle()

      if (!claimed) {
        stats.skipped++
        continue
      }

      // Suppression check
      if (await isSuppressed(clientId, prospect.email)) {
        await supabase.from("outbound_emails").update({ status: "cancelled" }).eq("id", email.id)
        await supabase.from("outbound_prospects").update({ status: "suppressed" }).eq("id", prospect.id)
        stats.skipped++
        continue
      }

      // Get sequence step
      const sequence = await getSequence(campaign.sequence_id)
      if (!sequence) {
        await supabase.from("outbound_emails").update({ status: "pending" }).eq("id", email.id)
        stats.errors.push(`Sequence ${campaign.sequence_id} not found`)
        continue
      }
      const step = (sequence.steps as SequenceStep[]).find((s) => s.stepOrder === email.step_order)
      if (!step) {
        await supabase.from("outbound_emails").update({ status: "pending" }).eq("id", email.id)
        stats.errors.push(`Step ${email.step_order} not found in sequence`)
        continue
      }

      // Determine threading
      let threadId: string | undefined
      let inReplyTo: string | undefined
      let subject: string

      if (email.step_order > 0) {
        const { data: step0 } = await supabase
          .from("outbound_emails")
          .select("gmail_thread_id, gmail_message_id, subject")
          .eq("prospect_id", prospect.id)
          .eq("step_order", 0)
          .eq("status", "sent")
          .maybeSingle()

        if (step0) {
          threadId = step0.gmail_thread_id || undefined
          inReplyTo = step0.gmail_message_id || undefined
          subject = `Re: ${step0.subject}`
        } else {
          subject = ""
        }
      } else {
        subject = ""
      }

      try {
        const config = await getConfig(clientId)
        const requireApproval = config.outbound?.requireApproval ?? false

        // Idempotency: skip regeneration if content already exists
        let finalSubject = subject
        let finalBody = email.body

        if (!email.body || email.body === "") {
          const personalized = await personalizeEmail({
            prospect,
            step,
            fromName: account.from_name,
            businessName: config.businessName,
            socialProof: campaign.social_proof || config.outbound?.socialProof || undefined,
          })

          if (!finalSubject) finalSubject = personalized.subject
          finalBody = personalized.body

          await supabase
            .from("outbound_emails")
            .update({
              subject: finalSubject,
              body: finalBody,
              word_count: personalized.wordCount,
              ai_reasoning: personalized.reasoning || null,
            })
            .eq("id", email.id)
        } else {
          if (!finalSubject) finalSubject = email.subject || ""
        }

        // Approval mode: queue for human review instead of sending
        if (requireApproval) {
          await supabase
            .from("outbound_emails")
            .update({ status: "awaiting_approval" })
            .eq("id", email.id)

          await supabase.from("ai_actions").insert({
            client_id: clientId,
            lead_id: prospect.lead_id || null,
            action_type: "send_outbound",
            reasoning: `Outbound email step ${email.step_order} to ${prospect.email} (${prospect.first_name || "prospect"}) — ${step.stance}`,
            proposed_content: JSON.stringify({
              emailId: email.id,
              prospectId: prospect.id,
              campaignId: campaign.id,
              subject: finalSubject,
              body: finalBody,
              toEmail: prospect.email,
            }),
            status: "pending",
          })

          await notify({
            clientId,
            type: "action_pending",
            title: `Approve outbound email to ${prospect.first_name || prospect.email}`,
            body: `Step ${email.step_order}: ${finalSubject}`,
          })

          stats.skipped++
          continue
        }

        // Send via Gmail
        const toName = [prospect.first_name, prospect.last_name].filter(Boolean).join(" ")
        const result = await sendEmailViaGmail({
          clientId,
          toEmail: prospect.email,
          toName: toName || undefined,
          subject: finalSubject,
          body: finalBody,
          threadId,
          inReplyTo,
        })

        if (result.success) {
          await supabase
            .from("outbound_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              gmail_message_id: result.messageId || null,
              gmail_thread_id: result.threadId || null,
            })
            .eq("id", email.id)

          if (prospect.status === "pending") {
            await supabase
              .from("outbound_prospects")
              .update({ status: "sending", updated_at: new Date().toISOString() })
              .eq("id", prospect.id)
          }

          account.sends_today++
          await supabase
            .from("outbound_sending_accounts")
            .update({ sends_today: account.sends_today })
            .eq("id", account.id)

          // Schedule remaining steps after step 0 sends
          if (email.step_order === 0) {
            await scheduleRemainingSteps({
              supabase,
              clientId,
              prospectId: prospect.id,
              campaignId: campaign.id,
              steps: sequence.steps as SequenceStep[],
              step0SentAt: new Date(),
            })
          }

          // Check sequence completion
          const lastStep = Math.max(...(sequence.steps as SequenceStep[]).map((s) => s.stepOrder))
          if (email.step_order === lastStep) {
            await supabase
              .from("outbound_prospects")
              .update({ status: "completed", current_step: email.step_order, updated_at: new Date().toISOString() })
              .eq("id", prospect.id)
          } else {
            await supabase
              .from("outbound_prospects")
              .update({ current_step: email.step_order, updated_at: new Date().toISOString() })
              .eq("id", prospect.id)
          }

          stats.sent++

          // Rate limiting delay
          const delay = 2000 + Math.random() * 3000
          await new Promise((r) => setTimeout(r, delay))
        } else {
          const errorMsg = result.error || "Unknown send error"

          if (errorMsg.includes("429")) {
            await pauseAccount(supabase, account.id, 60, "rate_limited")
            stats.failed++
            break
          } else if (errorMsg.includes("403")) {
            const etMidnight = getNextMidnightET()
            await supabase
              .from("outbound_sending_accounts")
              .update({ paused_until: etMidnight.toISOString(), pause_reason: "gmail_api_error" })
              .eq("id", account.id)
            stats.failed++
            break
          } else {
            await supabase
              .from("outbound_emails")
              .update({ status: "failed", failure_reason: errorMsg })
              .eq("id", email.id)

            await supabase
              .from("outbound_prospects")
              .update({ status: "failed", updated_at: new Date().toISOString() })
              .eq("id", prospect.id)

            account.sends_failed_today++
            await supabase
              .from("outbound_sending_accounts")
              .update({ sends_failed_today: account.sends_failed_today })
              .eq("id", account.id)

            const totalAttempts = account.sends_today + account.sends_failed_today
            if (totalAttempts >= 5 && account.sends_failed_today / totalAttempts > 0.10) {
              await pauseAccount(supabase, account.id, 24 * 60, "bounce_rate_exceeded")
              stats.failed++
              break
            }

            stats.failed++
          }
        }
      } catch (e) {
        await supabase.from("outbound_emails").update({ status: "pending" }).eq("id", email.id)
        stats.errors.push(`Email ${email.id}: ${e instanceof Error ? e.message : "Unknown error"}`)
        stats.failed++
      }
    }
  }

  return stats
}

export async function scheduleRemainingSteps({
  supabase,
  clientId,
  prospectId,
  campaignId,
  steps,
  step0SentAt,
}: {
  supabase: ReturnType<typeof createServiceClient>
  clientId: string
  prospectId: string
  campaignId: string
  steps: SequenceStep[]
  step0SentAt: Date
}): Promise<void> {
  for (const step of steps) {
    if (step.stepOrder === 0) continue

    const jitterMinutes = Math.floor(Math.random() * 120)
    const sendAfter = new Date(
      step0SentAt.getTime() + step.dayOffset * 24 * 3600 * 1000 + jitterMinutes * 60 * 1000
    )

    await supabase.from("outbound_emails").insert({
      client_id: clientId,
      prospect_id: prospectId,
      campaign_id: campaignId,
      step_order: step.stepOrder,
      subject: "",
      body: "",
      status: "pending",
      send_after: sendAfter.toISOString(),
    })
  }
}

async function pauseAccount(
  supabase: ReturnType<typeof createServiceClient>,
  accountId: string,
  minutes: number,
  reason: string
): Promise<void> {
  const pausedUntil = new Date(Date.now() + minutes * 60 * 1000)
  await supabase
    .from("outbound_sending_accounts")
    .update({ paused_until: pausedUntil.toISOString(), pause_reason: reason })
    .eq("id", accountId)
}

function getNextMidnightET(): Date {
  const now = new Date()
  const etString = now.toLocaleString("en-US", { timeZone: "America/Toronto" })
  const etNow = new Date(etString)
  const midnight = new Date(etNow)
  midnight.setDate(midnight.getDate() + 1)
  midnight.setHours(0, 0, 0, 0)
  const offset = now.getTime() - etNow.getTime()
  return new Date(midnight.getTime() + offset)
}
