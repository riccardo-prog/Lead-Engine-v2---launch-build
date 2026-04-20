import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase-server"

const VALID_TONES = ["professional", "friendly", "casual", "formal"] as const

export async function POST(request: Request) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  // Derive client_id from the authenticated user's JWT, not an env var.
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  const clientId = user?.app_metadata?.client_id as string | undefined
  if (!clientId) {
    return NextResponse.json({ error: "No client_id in user metadata" }, { status: 403 })
  }

  // Only the operator (owner) can modify settings.
  const operatorId = process.env.OPERATOR_USER_ID
  if (!operatorId || auth.userId !== operatorId) {
    return NextResponse.json({ error: "Forbidden — only the account owner can change settings" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Build validated overrides — only include fields that were actually sent.
  const overrides: Record<string, unknown> = {}

  if (body.businessName !== undefined) {
    const name = String(body.businessName).trim()
    if (!name) {
      return NextResponse.json({ error: "Business name cannot be empty" }, { status: 400 })
    }
    overrides.businessName = name
  }

  if (body.humanApprovalRequired !== undefined) {
    overrides.humanApprovalRequired = Boolean(body.humanApprovalRequired)
  }

  // AI persona fields — nested under aiPersona
  const persona: Record<string, unknown> = {}

  if (body.aiPersonaName !== undefined) {
    const name = String(body.aiPersonaName).trim()
    if (!name) {
      return NextResponse.json({ error: "AI persona name cannot be empty" }, { status: 400 })
    }
    persona.name = name
  }

  if (body.aiPersonaTone !== undefined) {
    if (!(VALID_TONES as readonly string[]).includes(body.aiPersonaTone as string)) {
      return NextResponse.json({ error: `Invalid tone. Must be one of: ${VALID_TONES.join(", ")}` }, { status: 400 })
    }
    persona.tone = body.aiPersonaTone
  }

  if (body.aiPersonaVoice !== undefined) {
    persona.voice = String(body.aiPersonaVoice).trim()
  }

  if (body.aiPersonaDoNotSay !== undefined) {
    persona.doNotSay = Array.isArray(body.aiPersonaDoNotSay)
      ? body.aiPersonaDoNotSay.map((s: unknown) => String(s).trim()).filter(Boolean)
      : String(body.aiPersonaDoNotSay).split(",").map((s: string) => s.trim()).filter(Boolean)
  }

  if (body.aiPersonaAlwaysSay !== undefined) {
    persona.alwaysSay = Array.isArray(body.aiPersonaAlwaysSay)
      ? body.aiPersonaAlwaysSay.map((s: unknown) => String(s).trim()).filter(Boolean)
      : String(body.aiPersonaAlwaysSay).split(",").map((s: string) => s.trim()).filter(Boolean)
  }

  if (Object.keys(persona).length > 0) {
    overrides.aiPersona = persona
  }

  if (Object.keys(overrides).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  // Merge with existing overrides (don't clobber fields the user didn't send).
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from("client_settings")
    .select("overrides")
    .eq("client_id", clientId)
    .maybeSingle()

  const existingOverrides = (existing?.overrides as Record<string, unknown>) || {}
  const merged = {
    ...existingOverrides,
    ...overrides,
    // Deep-merge aiPersona
    ...(overrides.aiPersona
      ? {
          aiPersona: {
            ...((existingOverrides.aiPersona as Record<string, unknown>) || {}),
            ...(overrides.aiPersona as Record<string, unknown>),
          },
        }
      : {}),
  }

  const { error } = await supabase
    .from("client_settings")
    .upsert({
      client_id: clientId,
      overrides: merged,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    console.error("Failed to save settings", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
