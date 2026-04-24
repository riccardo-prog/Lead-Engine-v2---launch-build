"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { Lead, AIAction, Message } from "@/types/database"
import type { FunnelStage } from "@/config/schema"

export function InboxView({
  actions,
  leadMap,
  messagesByLead,
  stages,
}: {
  actions: AIAction[]
  leadMap: Record<string, Lead>
  messagesByLead: Record<string, Message[]>
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
  const currentLead = current?.lead_id ? leadMap[current.lead_id] : null
  const isOutbound = current?.action_type === "send_outbound"
  const outboundMeta = isOutbound && current?.proposed_content
    ? (() => { try { return JSON.parse(current.proposed_content!) } catch { return null } })()
    : null

  const stageMap: Record<string, string> = {}
  for (const s of stages) stageMap[s.id] = s.label

  useEffect(() => {
    if (current) {
      // For outbound, edit just the body text; for others, edit full content
      if (current.action_type === "send_outbound" && current.proposed_content) {
        try {
          const meta = JSON.parse(current.proposed_content)
          setEditedContent(meta.body || "")
        } catch {
          setEditedContent(current.proposed_content || "")
        }
      } else {
        setEditedContent(current.proposed_content || "")
      }
      setFeedback("")
      setMode("view")
      setError(null)
    }
  }, [current])

  async function handleApprove(contentOverride?: string) {
    if (!current) return
    setBusy(true)
    setError(null)

    // For outbound edits, merge edited body back into the JSON metadata
    let finalOverride = contentOverride
    if (finalOverride !== undefined && current.action_type === "send_outbound" && current.proposed_content) {
      try {
        const meta = JSON.parse(current.proposed_content)
        meta.body = finalOverride
        finalOverride = JSON.stringify(meta)
      } catch { /* use raw override */ }
    }

    // Single atomic server call: approves + executes. No direct DB write.
    const execRes = await fetch("/api/actions/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionId: current.id,
        ...(finalOverride !== undefined && { contentOverride: finalOverride }),
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
    <div className="flex flex-col gap-4 md:gap-6 h-[calc(100vh-80px)] md:h-[calc(100vh-96px)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inbox</h1>
          <p className="text-muted-foreground mt-1 md:mt-2 text-sm">
            {actions.length} {actions.length === 1 ? "action" : "actions"} waiting for your review
          </p>
        </div>
        {/* Mobile back button when viewing detail */}
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="md:hidden px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Back
          </button>
        )}
      </div>

      {actions.length === 0 ? (
        <div className="flex-1 border border-border rounded-xl bg-card flex items-center justify-center text-muted-foreground text-sm">
          All caught up. The AI will queue new actions here as leads come in.
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 min-h-0">
          {/* Left panel — action list (hidden on mobile when detail is open) */}
          <div className={`border border-border rounded-xl bg-card overflow-auto ${selected ? "hidden md:block" : ""}`}>
            <div className="px-4 py-3 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {actions.length} Pending
              </span>
            </div>
            {actions.map((action) => {
              const lead = action.lead_id ? leadMap[action.lead_id] : null
              let name = "—"
              if (lead) {
                name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed"
              } else if (action.action_type === "send_outbound" && action.proposed_content) {
                try { name = JSON.parse(action.proposed_content).toEmail || "—" } catch { /* noop */ }
              }
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

          {/* Right panel — action detail (hidden on mobile when no selection) */}
          <div className={`border border-border rounded-xl bg-card p-4 md:p-6 overflow-auto flex flex-col gap-5 ${!selected ? "hidden md:flex" : ""}`}>
            {current && (currentLead || isOutbound) ? (
              <>
                {/* Lead or prospect info */}
                {isOutbound && outboundMeta ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="text-base md:text-lg font-semibold">
                        {outboundMeta.prospect?.firstName
                          ? `${outboundMeta.prospect.firstName}${outboundMeta.prospect.lastName ? ` ${outboundMeta.prospect.lastName}` : ""}`
                          : outboundMeta.toEmail}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/[0.08] text-cyan-600 dark:text-cyan-400">
                          Outbound
                        </span>
                        {outboundMeta.stepInfo && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/[0.08] text-indigo-600 dark:text-indigo-400">
                            Step {outboundMeta.stepInfo.stepOrder} · {outboundMeta.stepInfo.stance?.replace(/-/g, " ")}
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-muted-foreground mt-1.5 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                        <span className="truncate">{outboundMeta.toEmail}</span>
                        {outboundMeta.prospect?.company && (
                          <span className="truncate">{outboundMeta.prospect.title ? `${outboundMeta.prospect.title} at ` : ""}{outboundMeta.prospect.company}</span>
                        )}
                      </div>
                    </div>

                    {/* ICP Score + Key Insights */}
                    {outboundMeta.prospect?.icpScore != null && (
                      <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg px-4 py-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">ICP Score</div>
                          <div className={`text-sm font-semibold ${
                            outboundMeta.prospect.icpScore >= 70 ? "text-emerald-500" :
                            outboundMeta.prospect.icpScore >= 40 ? "text-amber-500" : "text-red-400"
                          }`}>
                            {outboundMeta.prospect.icpScore}/100
                          </div>
                          {outboundMeta.prospect.researchConfidence && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              outboundMeta.prospect.researchConfidence === "HIGH" ? "bg-emerald-500/10 text-emerald-500" :
                              outboundMeta.prospect.researchConfidence === "MEDIUM" ? "bg-amber-500/10 text-amber-500" :
                              "bg-red-400/10 text-red-400"
                            }`}>
                              {outboundMeta.prospect.researchConfidence} confidence
                            </span>
                          )}
                        </div>
                        {outboundMeta.prospect.icpFactors && (
                          <div className="flex flex-col gap-1.5">
                            {Object.entries(outboundMeta.prospect.icpFactors as Record<string, { score?: number; reason?: string }>)
                              .filter(([key]) => key !== "summary")
                              .map(([key, val]) => (
                              <div key={key} className="flex flex-col sm:flex-row sm:gap-2">
                                <div className="text-[11px] text-muted-foreground capitalize shrink-0 sm:min-w-[90px]">{key.replace(/_/g, " ")}</div>
                                <div className="text-[12px] text-foreground/80">{val.reason || `${val.score}/100`}</div>
                              </div>
                            ))}
                            {typeof (outboundMeta.prospect.icpFactors as Record<string, unknown>).summary === "string" && (
                              <div className="text-[12px] text-muted-foreground border-t border-white/[0.05] pt-2 mt-1">
                                {(outboundMeta.prospect.icpFactors as Record<string, string>).summary}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : currentLead ? (
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
                ) : null}

                {/* Conversation context */}
                {currentLead && messagesByLead[currentLead.id]?.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-2">
                      Recent Conversation
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg overflow-hidden max-h-[240px] overflow-y-auto">
                      {messagesByLead[currentLead.id].map((msg) => (
                        <div
                          key={msg.id}
                          className={`px-4 py-2.5 border-b border-border last:border-b-0 text-sm ${
                            msg.direction === "inbound"
                              ? "bg-transparent"
                              : "bg-indigo-500/[0.03]"
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-[11px] font-medium ${
                              msg.direction === "inbound"
                                ? "text-cyan-600 dark:text-cyan-400"
                                : "text-indigo-600 dark:text-indigo-400"
                            }`}>
                              {msg.direction === "inbound" ? "Lead" : "AI"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(msg.created_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap line-clamp-4">
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI reasoning */}
                <div>
                  <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.05em] mb-2">
                    {isOutbound ? "Personalization Reasoning" : "AI Reasoning"}
                  </div>
                  <div className="bg-indigo-500/[0.04] border border-indigo-500/[0.08] rounded-lg px-4 py-3 text-sm leading-relaxed">
                    {current.reasoning}
                  </div>
                </div>

                {/* Proposed message / outbound email preview */}
                {current.proposed_content && (
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-2">
                      {isOutbound ? "Email Preview" : "Proposed Message"}
                    </div>
                    {mode === "edit" ? (
                      <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="w-full min-h-[240px] px-4 py-3 bg-background border border-border rounded-lg text-sm leading-relaxed font-[inherit] text-foreground outline-none resize-y focus:border-indigo-500/30 transition-colors"
                      />
                    ) : isOutbound && outboundMeta ? (
                      <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-border text-[13px]">
                          <span className="text-muted-foreground">To: </span>{outboundMeta.toEmail}
                        </div>
                        <div className="px-4 py-2.5 border-b border-border text-[13px]">
                          <span className="text-muted-foreground">Subject: </span>{outboundMeta.subject}
                        </div>
                        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                          {outboundMeta.body}
                        </div>
                      </div>
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
                <div className="flex flex-col sm:flex-row gap-2 mt-auto pt-4">
                  {mode === "view" && (
                    <>
                      <button
                        onClick={() => handleApprove()}
                        disabled={busy}
                        className={`flex-1 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-none text-sm font-medium transition-opacity ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
                      >
                        {busy ? "Working..." : isOutbound
                          ? "Approve & send"
                          : current.action_type === "send_message"
                          ? `Approve & send`
                          : "Approve"}
                      </button>
                      <div className="flex gap-2">
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
                      </div>
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
