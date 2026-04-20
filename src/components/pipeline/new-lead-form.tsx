"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { LeadSource } from "@/config/schema"

export function NewLeadForm({ sources }: { sources: LeadSource[] }) {
  const router = useRouter()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [sourceId, setSourceId] = useState(sources[0]?.id || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setLoading(true)
    setError(null)

    // Call the intake engine so manual leads get the full treatment:
    // dedup → AI decision → ai_actions queued.
    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || "Failed to create lead")
      setLoading(false)
      return
    }

    router.push("/pipeline")
    router.refresh()
  }

  return (
    <div className="max-w-lg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">New lead</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Manually add a lead to the pipeline.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" value={firstName} onChange={setFirstName} />
          <Field label="Last name" value={lastName} onChange={setLastName} />
        </div>
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Phone" value={phone} onChange={setPhone} type="tel" />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-500/30 transition-colors"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2 text-destructive text-[13px]">
            {error}
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`
              px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-none text-sm font-medium transition-opacity
              ${loading ? "opacity-70 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}
            `}
          >
            {loading ? "Creating..." : "Create lead"}
          </button>
          <button
            onClick={() => router.push("/pipeline")}
            className="px-4 py-2.5 rounded-lg bg-transparent text-foreground border border-border text-sm font-medium cursor-pointer hover:border-indigo-500/20 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-500/30 transition-colors"
      />
    </div>
  )
}
