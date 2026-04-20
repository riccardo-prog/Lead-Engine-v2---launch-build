import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  return (
    <div className="flex h-screen">
      <Sidebar userEmail={user.email || ""} />
      <main className="flex-1 overflow-y-auto bg-background p-8">
        {children}
      </main>
    </div>
  )
}
