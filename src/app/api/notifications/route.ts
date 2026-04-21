import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { getClientIdFromSession } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"
import type { Notification } from "@/types/database"

export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const supabase = createServiceClient()
    const clientId = await getClientIdFromSession()

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Notifications query failed", error)
      return NextResponse.json({ error: "query_failed" }, { status: 500 })
    }

    const items = (data as Notification[]) || []
    const unreadCount = items.filter((n) => !n.read_at).length

    return NextResponse.json({ items, unreadCount })
  } catch (e) {
    console.error("Notifications route exception", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
