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
    prompt: `First touch. You know nothing about them beyond the research brief. Lead with ONE specific observation from their business. Ask a genuine question. No pitch. No "I noticed you..." clichés. Under 80 words.`,
    maxWords: 80,
  },
  {
    stepOrder: 1,
    dayOffset: 3,
    stance: "follow-up-value",
    prompt: `They didn't reply to step 0. Don't reference the previous email. Share ONE concrete thing relevant to their situation — a trend, a metric, a pattern you've seen. Frame it as useful whether or not they reply. Under 60 words.`,
    maxWords: 60,
  },
  {
    stepOrder: 2,
    dayOffset: 7,
    stance: "social-proof-nudge",
    prompt: `Third touch. Reference a specific result or pattern from similar businesses. Use the social proof provided in the campaign config if available — quote it directly, don't fabricate details. If no social proof is configured, speak generally about the problem space. One sentence max on the result, then a soft question. Under 70 words.`,
    maxWords: 70,
  },
  {
    stepOrder: 3,
    dayOffset: 14,
    stance: "clean-break",
    prompt: `Final email. Assume they're not interested and that's fine. Give them an easy out ("If this isn't relevant, no need to reply"). But leave one clear reason to re-engage if timing changes. Under 50 words. No guilt. No "just checking in."`,
    maxWords: 50,
  },
]
