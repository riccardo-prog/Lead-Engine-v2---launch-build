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
    prompt: `First touch. Open by referencing something specific from the research brief about THEIR business, not their industry in general. Then connect it to a problem you solve: automating lead follow-up so no inquiry goes unanswered, especially nights/weekends. Make it clear what you built and why it matters for them specifically. End with a low-pressure question. Under 80 words.`,
    maxWords: 80,
  },
  {
    stepOrder: 1,
    dayOffset: 3,
    stance: "follow-up-value",
    prompt: `They didn't reply. Don't reference the previous email. Lead with a specific, concrete insight about their business from the research brief. Then share one thing your system does that directly addresses their situation, like instant response to new leads or automated nurture sequences. Make the value tangible and specific. End with a question. Under 60 words.`,
    maxWords: 60,
  },
  {
    stepOrder: 2,
    dayOffset: 7,
    stance: "social-proof-nudge",
    prompt: `Third touch. If social proof is available, lead with a real result from a similar business. If not, share a specific pain point you've solved, like "leads that come in after hours get a response in under 2 minutes instead of the next morning." Connect it back to something from their research brief. One soft question to close. Under 70 words.`,
    maxWords: 70,
  },
  {
    stepOrder: 3,
    dayOffset: 14,
    stance: "clean-break",
    prompt: `Final email. Short and respectful. Acknowledge they're busy. Leave one clear, specific reason to reach out later if timing changes, tied to what you do. Give them an easy out. Under 50 words. No guilt.`,
    maxWords: 50,
  },
]
