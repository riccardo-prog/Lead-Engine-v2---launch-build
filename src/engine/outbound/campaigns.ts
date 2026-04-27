import { createServiceClient } from "@/lib/supabase-server"
import type { OutboundCampaign, CampaignStatus } from "./types"

export async function createCampaign({
  clientId,
  name,
  sequenceId,
  sendingAccountId,
  icpCriteria,
  icpThreshold,
  socialProof,
}: {
  clientId: string
  name: string
  sequenceId: string
  sendingAccountId: string
  icpCriteria?: Record<string, unknown>
  icpThreshold?: number
  socialProof?: string[]
}): Promise<OutboundCampaign> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("outbound_campaigns")
    .insert({
      client_id: clientId,
      name,
      status: "draft",
      sequence_id: sequenceId,
      sending_account_id: sendingAccountId,
      icp_criteria: icpCriteria || null,
      icp_threshold: icpThreshold ?? 40,
      social_proof: socialProof || null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message || "Failed to create campaign")
  return data as OutboundCampaign
}

export async function getCampaign(campaignId: string): Promise<OutboundCampaign | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("outbound_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle()

  return (data as OutboundCampaign) || null
}

export async function listCampaigns(clientId: string): Promise<OutboundCampaign[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("outbound_campaigns")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })

  return (data as OutboundCampaign[]) || []
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("outbound_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", campaignId)

  if (error) throw new Error(error.message)
}

export async function createSequence({
  clientId,
  name,
  steps,
}: {
  clientId: string
  name: string
  steps: Array<{ stepOrder: number; dayOffset: number; stance: string; prompt: string; maxWords: number }>
}): Promise<{ id: string }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("outbound_sequences")
    .insert({
      client_id: clientId,
      name,
      steps,
    })
    .select("id")
    .single()

  if (error || !data) throw new Error(error?.message || "Failed to create sequence")
  return data
}

export async function getSequence(sequenceId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("outbound_sequences")
    .select("*")
    .eq("id", sequenceId)
    .maybeSingle()

  return data as { id: string; client_id: string; name: string; steps: Array<{ stepOrder: number; dayOffset: number; stance: string; prompt: string; maxWords: number }>; created_at: string } | null
}

export const DEFAULT_SEQUENCE_STEPS = [
  {
    stepOrder: 0,
    dayOffset: 0,
    stance: "opening-cold",
    prompt: `First touch. No pitching. No mentioning what you built.
1. Open with a specific detail about THEIR business from the research brief.
2. Connect that detail to an operational leak — leads sitting, slow follow-up, after-hours gaps, ad spend with no backend.
3. Name the likely consequence using soft language ("usually," "often," "I'd guess"). Do NOT make hard claims without data.
4. End with a diagnostic question. Examples: "Is that happening on your end?" or "Are those getting handled same-night, or waiting until the next day?"
2-4 short paragraphs. Under 80 words.`,
    maxWords: 80,
  },
  {
    stepOrder: 1,
    dayOffset: 3,
    stance: "follow-up-value",
    prompt: `They didn't reply. Don't reference the previous email. Don't pitch.
1. Lead with a different observed detail from the research brief.
2. Connect it to a different operational leak than email 1 — maybe response time, maybe weekend coverage, maybe lead routing.
3. Describe the consequence softly. What usually happens when this goes unaddressed.
4. End with a simple diagnostic question. Examples: "Curious if that's something you've noticed too?" or "Does that usually get handled instantly, or only once someone's free?"
Under 60 words.`,
    maxWords: 60,
  },
  {
    stepOrder: 2,
    dayOffset: 7,
    stance: "social-proof-nudge",
    prompt: `Third touch. You can now hint at what you do, but still don't hard-pitch.
1. If social proof is available, lead with a concrete result from a similar business. Numbers, outcomes, time saved.
2. Connect that result to a gap they likely have. The reader should think "that could be me."
3. If no social proof, describe a common operational pattern and its cost, then ask if it resonates.
4. End with a diagnostic question, not a pitch. Example: "Is that a gap for you right now?"
Under 70 words.`,
    maxWords: 70,
  },
  {
    stepOrder: 3,
    dayOffset: 14,
    stance: "clean-break",
    prompt: `Final email. Short and respectful. No guilt, no "just following up."
1. Name one specific operational cost that doesn't go away on its own.
2. Leave the door open without pressure.
3. Give them an easy out.
Under 50 words.`,
    maxWords: 50,
  },
]
