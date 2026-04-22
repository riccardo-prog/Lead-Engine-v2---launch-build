import { createServiceClient } from "@/lib/supabase-server"
import type { SuppressionReason, SuppressionSource } from "./types"

export async function isSuppressed(clientId: string, email: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("suppression_list")
    .select("id")
    .eq("client_id", clientId)
    .eq("email", email.toLowerCase())
    .maybeSingle()

  return !!data
}

export async function addToSuppressionList({
  clientId,
  email,
  reason,
  source,
}: {
  clientId: string
  email: string
  reason: SuppressionReason
  source: SuppressionSource
}): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from("suppression_list")
    .upsert(
      {
        client_id: clientId,
        email: email.toLowerCase(),
        reason,
        source,
      },
      { onConflict: "client_id,email" }
    )
}
