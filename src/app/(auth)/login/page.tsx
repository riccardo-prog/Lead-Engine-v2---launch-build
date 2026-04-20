"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase"
import { useRouter } from "next/navigation"

type Mode = "login" | "change-password"

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
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

  async function handleChangePassword() {
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!email || !password) {
      setError("Please enter your email and current password")
      setLoading(false)
      return
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters")
      setLoading(false)
      return
    }

    if (newPassword === password) {
      setError("New password must be different from current password")
      setLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match")
      setLoading(false)
      return
    }

    // Verify old password by signing in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError("Current password is incorrect")
      setLoading(false)
      return
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      await supabase.auth.signOut()
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Sign out so they log in fresh with the new password
    await supabase.auth.signOut()

    setSuccess("Password changed. You can now sign in with your new password.")
    setPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setMode("login")
    setLoading(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSuccess(null)
  }

  const inputClass =
    "px-3.5 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:border-indigo-500/30 transition-colors"

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
              {mode === "login" ? "Sign in to your dashboard" : "Change your password"}
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
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              {mode === "login" ? "Password" : "Current password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === "Enter" && mode === "login" && handleLogin()}
              className={inputClass}
            />
          </div>

          {mode === "change-password" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                  className={inputClass}
                />
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2 text-destructive text-[13px]">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/[0.08] border border-emerald-500/20 rounded-lg px-3 py-2 text-emerald-600 dark:text-emerald-400 text-[13px]">
              {success}
            </div>
          )}

          <button
            onClick={mode === "login" ? handleLogin : handleChangePassword}
            disabled={loading}
            className={`
              py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-none text-sm font-medium transition-opacity
              ${loading ? "opacity-70 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}
            `}
          >
            {loading
              ? (mode === "login" ? "Signing in..." : "Updating...")
              : (mode === "login" ? "Sign in" : "Change password")}
          </button>

          <button
            onClick={() => switchMode(mode === "login" ? "change-password" : "login")}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
          >
            {mode === "login" ? "Change password" : "Back to sign in"}
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
