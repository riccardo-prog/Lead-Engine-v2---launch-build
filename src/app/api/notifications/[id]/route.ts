import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { getClientIdFromSession } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const supabase = createServiceClient()
    const clientId = await getClientIdFromSession()

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("client_id", clientId)

    if (error) {
      console.error("Dismiss notification failed", error)
      return NextResponse.json({ error: "delete_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Dismiss notification exception", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
