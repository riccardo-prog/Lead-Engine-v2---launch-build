import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { getConfig } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const config = await getConfig()
    const supabase = createServiceClient()

    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("id", id)
      .eq("client_id", config.clientId)

    if (error) {
      console.error("Failed to disconnect integration", error)
      return NextResponse.json({ error: "disconnect_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Disconnect route exception", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}