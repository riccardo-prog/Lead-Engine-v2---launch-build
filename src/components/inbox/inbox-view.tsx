"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { Lead, AIAction } from "@/types/database"
import type { FunnelStage } from "@/config/schema"

export function InboxView({
  actions,
  leadMap,
  stages,
}: {
  actions: AIAction[]
  leadMap: Record<string, Lead>
  stages: FunnelStage[]
}) {
  const [selected, setSelected] = useState<string | null>(actions[0]?.id || null)
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view")
  const [editedContent, setEditedContent] = useState("")
  const [feedback, setFeedback] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const current = actions.find((a) => a.id === selected)
  const currentLead = current ? leadMap[current.lead_id] : null

  const stageMap: Record<string, string> = {}
  for (const s of stages) stageMap[s.id] = s.label

  useEffect(() => {
    if (current) {
      setEditedContent(current.proposed_content || "")
      setFeedback("")
      setMode("view")
      setError(null)
    }
  }, [current])

  async function handleApprove(contentOverride?: string) {
    if (!current) return
    setBusy(true)
    setError(null)

    // Single atomic server call: approves + executes. No direct DB write.
    const execRes = await fetch("/api/actions/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionId: current.id,
        ...(contentOverride !== undefined && { contentOverride }),
      }),
    })

    if (!execRes.ok) {
      const body = await execRes.json().catch(() => ({}))
      setError(body.error || "Failed to execute action")
      setBusy(false)
      return
    }

    setBusy(false)
    router.refresh()
  }

  async function handleRegenerate() {
    if (!current || !feedback.trim()) return
    setBusy(true)
    setError(null)

    const res = await fetch("/api/actions/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: current.id, feedback }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || "Failed to regenerate")
      setBusy(false)
      return
    }

    setBusy(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-96px)]">
      <div>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {actions.length} {actions.length === 1 ? "action" : "actions"} waiting for your review
        </p>
      </div>

      {actions.length === 0 ? (
        <div className="flex-1 border border-border rounded-xl bg-card flex items-center justify-center text-muted-foreground text-sm">
          All caught up. The AI will queue new actions here as leads come in.
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-[280px_1fr] gap-4 min-h-0">
          {/* Left panel — action list */}
          <div className="border border-border rounded-xl bg-card overflow-auto">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {actions.length} Pending
              </span>
            </div>
            {actions.map((action) => {
              const lead = leadMap[action.lead_id]
              const name = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed" : "—"
              const isActive = action.id === selected
              return (
                <button
                  key={action.id}
                  onClick={() => setSelected(action.id)}
                  className={`
                    w-full px-4 py-3.5 border-b border-border text-left cursor-pointer flex flex-col gap-1 text-foreground transition-colors
                    ${isActive
                      ? "bg-indigo-500/[0.08] border-l-2 border-l-indigo-500"
                      : "bg-transparent hover:bg-indigo-500/[0.03] border-l-2 border-l-transparent"
                    }
                  `}
                >
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">{name}</div>
                    <div className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
                      {action.action_type.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {action.reasoning}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Right panel — action detail */}
          <div className="border border-border rounded-xl bg-card p-6 overflow-auto flex flex-col gap-5">
            {current && currentLead ? (
              <>
                {/* Lead info */}
                <div>
                  <div className="text-lg font-semibold">
                    {[currentLead.first_name, currentLead.last_name].filter(Boolean).join(" ") || "Unnamed"}
                  </div>
                  <div className="text-[13px] text-muted-foreground mt-1">
                    {currentLead.email || "—"} · {stageMap[currentLead.stage_id] || currentLead.stage_id}
                    {current.action_type === "send_message" && (
                      <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-indigo-500/[0.08] text-indigo-600 dark:text-indigo-400">
                        via {inferChannelLabel(currentLead)}
                      </span>
                    )}
                  </div>
                </div>

                {/* AI reasoning */}
                <div>
                  <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.05em] mb-2">
                    AI Reasoning
                  </div>
                  <div className="bg-indigo-500/[0.04] border border-indigo-500/[0.08] rounded-lg px-4 py-3 text-sm leading-relaxed">
                    {current.reasoning}
                  </div>
                </div>

                {/* Proposed message */}
                {current.proposed_content && (
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-2">
                      Proposed Message
                    </div>
                    {mode === "edit" ? (
                      <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="w-full min-h-[240px] px-4 py-3 bg-background border border-border rounded-lg text-sm leading-relaxed font-[inherit] text-foreground outline-none resize-y focus:border-indigo-500/30 transition-colors"
                      />
                    ) : (
                      <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                        {current.proposed_content}
                      </div>
                    )}
                  </div>
                )}

                {/* Reject mode feedback */}
                {mode === "reject" && (
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-2">
                      Tell the AI what to do differently
                    </div>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="e.g. 'Too pushy. Don't mention price in the first message. Keep it shorter.'"
                      className="w-full min-h-[120px] px-4 py-3 bg-background border border-border rounded-lg text-sm leading-relaxed font-[inherit] text-foreground outline-none resize-y focus:border-indigo-500/30 transition-colors"
                    />
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-destructive text-[13px]">
                    {error}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 mt-auto pt-4">
                  {mode === "view" && (
                    <>
                      <button
                        onClick={() => handleApprove()}
                        disabled={busy}
                        className={`flex-1 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-none text-sm font-medium transition-opacity ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
                      >
                        {busy ? "Working..." : current.action_type === "send_message"
                          ? `Approve and send via ${inferChannelLabel(currentLead)}`
                          : "Approve"}
                      </button>
                      <button
                        onClick={() => setMode("edit")}
                        disabled={busy || !current.proposed_content}
                        className={`flex-1 py-3 rounded-lg border border-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-sm font-medium transition-colors ${busy || !current.proposed_content ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-indigo-500/[0.06]"}`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setMode("reject")}
                        disabled={busy}
                        className={`flex-1 py-3 rounded-lg border border-red-400/15 text-red-400 text-sm font-medium transition-colors ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-red-400/[0.06]"}`}
                      >
                        Regenerate
                      </button>
                    </>
                  )}
                  {mode === "edit" && (
                    <>
                      <button
                        onClick={() => handleApprove(editedContent)}
                        disabled={busy}
                        className={`flex-1 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-none text-sm font-medium transition-opacity ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
                      >
                        {busy ? "Working..." : "Save and send"}
                      </button>
                      <button
                        onClick={() => setMode("view")}
                        disabled={busy}
                        className={`flex-1 py-3 rounded-lg border border-border text-foreground text-sm font-medium transition-colors ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-indigo-500/20"}`}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {mode === "reject" && (
                    <>
                      <button
                        onClick={handleRegenerate}
                        disabled={busy || !feedback.trim()}
                        className={`flex-1 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-none text-sm font-medium transition-opacity ${busy || !feedback.trim() ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
                      >
                        {busy ? "Regenerating..." : "Send feedback and regenerate"}
                      </button>
                      <button
                        onClick={() => setMode("view")}
                        disabled={busy}
                        className={`flex-1 py-3 rounded-lg border border-border text-foreground text-sm font-medium transition-colors ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-indigo-500/20"}`}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                Select an action to review.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function inferChannelLabel(lead: Lead | null): string {
  if (!lead) return "Email"
  if (lead.meta_igsid && lead.source_id === "instagram-dm") return "Instagram DM"
  if (lead.meta_psid && lead.source_id === "facebook-dm") return "Messenger"
  if (lead.email) return "Email"
  if (lead.phone) return "SMS"
  return "Email"
}
