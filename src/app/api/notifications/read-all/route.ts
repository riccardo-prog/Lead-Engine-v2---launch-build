import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { getConfig } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"

export async function POST() {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const supabase = createServiceClient()
    const config = await getConfig()

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", config.clientId)
      .is("read_at", null)

    if (error) {
      console.error("Mark all read failed", error)
      return NextResponse.json({ error: "update_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Mark all read exception", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
