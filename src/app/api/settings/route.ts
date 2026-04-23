import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { getConfig, getClientIdFromSession } from "@/lib/config"
import { createServiceClient } from "@/lib/supabase-server"

const VALID_TONES = ["professional", "friendly", "casual", "formal"] as const

export async function POST(request: Request) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  const clientId = await getClientIdFromSession()
  const config = await getConfig(clientId)

  // Only the operator (owner) of this client can modify settings.
  const userEmail = auth.userId ? await getUserEmail(auth.userId) : null
  const isOperator =
    (config.operatorEmail && userEmail && config.operatorEmail.toLowerCase() === userEmail.toLowerCase()) ||
    (process.env.OPERATOR_USER_ID && auth.userId === process.env.OPERATOR_USER_ID)
  if (!isOperator) {
    return NextResponse.json({ error: "Forbidden — only the account owner can change settings" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Build updates on top of the current config
  const updated = { ...config }

  if (body.businessName !== undefined) {
    const name = String(body.businessName).trim()
    if (!name) {
      return NextResponse.json({ error: "Business name cannot be empty" }, { status: 400 })
    }
    updated.businessName = name
  }

  if (body.humanApprovalRequired !== undefined) {
    updated.humanApprovalRequired = Boolean(body.humanApprovalRequired)
  }

  // AI persona fields
  if (body.aiPersonaName !== undefined) {
    const name = String(body.aiPersonaName).trim()
    if (!name) {
      return NextResponse.json({ error: "AI persona name cannot be empty" }, { status: 400 })
    }
    updated.aiPersona = { ...updated.aiPersona, name }
  }

  if (body.aiPersonaTone !== undefined) {
    if (!(VALID_TONES as readonly string[]).includes(body.aiPersonaTone as string)) {
      return NextResponse.json({ error: `Invalid tone. Must be one of: ${VALID_TONES.join(", ")}` }, { status: 400 })
    }
    updated.aiPersona = { ...updated.aiPersona, tone: body.aiPersonaTone as typeof updated.aiPersona.tone }
  }

  if (body.aiPersonaVoice !== undefined) {
    updated.aiPersona = { ...updated.aiPersona, voice: String(body.aiPersonaVoice).trim() }
  }

  if (body.aiPersonaDoNotSay !== undefined) {
    const list = Array.isArray(body.aiPersonaDoNotSay)
      ? body.aiPersonaDoNotSay.map((s: unknown) => String(s).trim()).filter(Boolean)
      : String(body.aiPersonaDoNotSay).split(",").map((s: string) => s.trim()).filter(Boolean)
    updated.aiPersona = { ...updated.aiPersona, doNotSay: list }
  }

  if (body.aiPersonaAlwaysSay !== undefined) {
    const list = Array.isArray(body.aiPersonaAlwaysSay)
      ? body.aiPersonaAlwaysSay.map((s: unknown) => String(s).trim()).filter(Boolean)
      : String(body.aiPersonaAlwaysSay).split(",").map((s: string) => s.trim()).filter(Boolean)
    updated.aiPersona = { ...updated.aiPersona, alwaysSay: list }
  }

  // Save the full config back to the database
  const supabase = createServiceClient()

  const { error } = await supabase
    .from("client_settings")
    .upsert({
      client_id: clientId,
      config: updated,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    console.error("Failed to save settings", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.auth.admin.getUserById(userId)
  return data?.user?.email || null
}
