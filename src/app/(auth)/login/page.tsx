"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin() {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push("/pipeline")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-[400px] px-10 py-12 bg-card rounded-2xl border border-border flex flex-col gap-6">
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xl font-bold shadow-[0_0_30px_rgba(99,102,241,0.3)]">
            L
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold">Lead Engine</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Sign in to your dashboard
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="px-3.5 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:border-indigo-500/30 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="px-3.5 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:border-indigo-500/30 transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2 text-destructive text-[13px]">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className={`
              py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-none text-sm font-medium transition-opacity
              ${loading ? "opacity-70 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}
            `}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground">
          Powered by OperateAI
        </div>
      </div>
    </div>
  )
}
