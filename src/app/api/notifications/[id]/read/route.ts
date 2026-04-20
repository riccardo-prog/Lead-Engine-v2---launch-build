import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { getConfig } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const supabase = createServiceClient()
    const config = await getConfig()

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("client_id", config.clientId)
      .is("read_at", null)

    if (error) {
      console.error("Mark read failed", error)
      return NextResponse.json({ error: "update_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Mark read exception", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
