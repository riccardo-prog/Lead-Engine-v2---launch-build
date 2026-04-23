import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { getConfig } from "@/lib/config"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const clientId = user.app_metadata?.client_id as string | undefined
  let businessName: string | undefined
  let hasOutbound = false
  if (clientId) {
    try {
      const config = await getConfig(clientId)
      businessName = config.businessName
      hasOutbound = !!config.outbound
    } catch {
      // Fall back to generic if config fails
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar userEmail={user.email || ""} userName={user.user_metadata?.full_name || user.user_metadata?.name || null} businessName={businessName} hasOutbound={hasOutbound} />
      <main className="flex-1 overflow-y-auto bg-background p-8">
        {children}
      </main>
    </div>
  )
}
