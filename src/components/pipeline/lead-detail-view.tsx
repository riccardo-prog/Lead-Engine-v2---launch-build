"use client"

import { useState } from "react"
import Link from "next/link"
import type { Lead, Message, AIAction } from "@/types/database"
import type { FunnelStage, LeadSource } from "@/config/schema"
import type { LeadSummary } from "@/engine/nurture/summarize-lead"

const tempBadge: Record<string, string> = {
  hot: "bg-red-500/10 border-red-500/40 text-red-500",
  warm: "bg-amber-500/10 border-amber-500/40 text-amber-500",
  cold: "bg-blue-500/10 border-blue-500/30 text-blue-500",
}

const stageBadgeStyles: Record<string, string> = {
  new: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/[0.08]",
  contacted: "text-amber-600 dark:text-amber-400 bg-amber-500/[0.08]",
  nurturing: "text-indigo-500 dark:text-indigo-300 bg-indigo-500/[0.08]",
  qualified: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.08]",
  booked: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/[0.08]",
}

export function LeadDetailView({
  lead,
  messages,
  actions,
  summary,
  stages,
  sources,
}: {
  lead: Lead
  messages: Message[]
  actions: AIAction[]
  summary: LeadSummary | null
  stages: FunnelStage[]
  sources: LeadSource[]
}) {
  const [showRaw, setShowRaw] = useState(false)

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed"
  const stage = stages.find((s) => s.id === lead.stage_id)
  const source = sources.find((s) => s.id === lead.source_id)

  return (
    <div className="flex flex-col gap-6 max-w-[880px]">
      {/* Back link */}
      <div>
        <Link
          href="/pipeline"
          className="text-[13px] text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 no-underline transition-colors"
        >
          ← Back to pipeline
        </Link>
      </div>

      {/* Lead header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-xs sm:text-sm font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
            {name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold">{name}</h1>
            <div className="flex flex-col sm:flex-row sm:gap-4 gap-0.5 mt-1 text-sm text-muted-foreground">
              {lead.email && <span className="truncate">{lead.email}</span>}
              {lead.phone && <span>{lead.phone}</span>}
              <span>{source?.label || lead.source_id}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 ml-13 sm:ml-0">
          {summary && (
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-widest border ${tempBadge[summary.temperature] || "border-border text-muted-foreground"}`}>
              {summary.temperature}
            </span>
          )}
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${stageBadgeStyles[lead.stage_id] || "text-muted-foreground bg-muted"}`}>
            {stage?.label || lead.stage_id}
          </span>
        </div>
      </div>

      {/* AI Summary card */}
      {summary && (
        <div className="bg-indigo-500/[0.03] border border-indigo-500/10 rounded-xl p-5 relative overflow-hidden">
          {/* Gradient top border */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-cyan-500 to-indigo-500 opacity-60" />

          {/* AI label */}
          <div className="flex items-center gap-2 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600 dark:text-indigo-400">
              <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
              <path d="M16 14H8a4 4 0 0 0-4 4v2h16v-2a4 4 0 0 0-4-4z" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-indigo-600 dark:text-indigo-400">AI Summary</span>
          </div>

          {/* Headline / summary text */}
          <p className="text-sm text-foreground leading-relaxed mb-4">
            {summary.headline}
          </p>

          {/* Attention alert */}
          {summary.attentionNeeded && summary.attentionReason && (
            <div className="bg-amber-500/[0.08] border border-amber-500/[0.12] rounded-lg px-4 py-3 text-[13px] leading-relaxed mb-4 flex items-start gap-2">
              <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
              <span>{summary.attentionReason}</span>
            </div>
          )}

          {/* Status / Next Action grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em] mb-1.5">
                Status
              </div>
              <div className="text-sm leading-relaxed">{summary.status}</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em] mb-1.5">
                Next action
              </div>
              <div className="text-sm leading-relaxed">{summary.nextAction}</div>
            </div>
          </div>
        </div>
      )}

      {/* Key moments */}
      {summary && summary.keyMoments.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-[13px] font-medium mb-4">Key moments</div>
          <div className="flex flex-col gap-3">
            {summary.keyMoments.map((moment, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="text-xs text-muted-foreground min-w-[100px] pt-0.5">
                  {moment.when}
                </div>
                <div className="text-sm leading-relaxed flex-1">
                  {moment.what}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score bar */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-medium">Lead Score</span>
          <span className="text-sm tabular-nums font-medium">{lead.score}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, lead.score))}%` }}
          />
        </div>
      </div>

      {/* Conversation */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className={`flex justify-between items-center ${showRaw ? "mb-4" : ""}`}>
          <div className="text-[13px] font-medium">
            Conversation ({messages.length} {messages.length === 1 ? "message" : "messages"})
          </div>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="px-3 py-1.5 rounded-md bg-transparent text-foreground border border-border text-xs font-medium cursor-pointer hover:border-indigo-500/20 transition-colors"
          >
            {showRaw ? "Hide" : "Show"}
          </button>
        </div>

        {showRaw && (
          <div className="flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="text-[13px] text-muted-foreground">
                No messages yet.
              </div>
            )}
            {messages.map((message) => {
              const isInbound = message.direction === "inbound"
              return (
                <div
                  key={message.id}
                  className={`
                    px-4 py-3.5 flex flex-col gap-1.5
                    ${isInbound
                      ? "bg-white/[0.04] border border-white/[0.06] rounded-xl rounded-bl-sm mr-4 sm:mr-12"
                      : "bg-indigo-500/[0.06] border border-indigo-500/10 rounded-xl rounded-br-sm ml-4 sm:ml-12"
                    }
                  `}
                >
                  <div className="flex justify-between text-[11px] text-muted-foreground uppercase tracking-wide">
                    <span>{isInbound ? "From lead" : "From AI"} · {message.channel}</span>
                    <span>
                      {message.sent ? (
                        `Sent ${new Date(message.sent_at || message.created_at).toLocaleString()}`
                      ) : message.scheduled_for ? (
                        `Scheduled for ${new Date(message.scheduled_for).toLocaleString()}`
                      ) : (
                        new Date(message.created_at).toLocaleString()
                      )}
                    </span>
                  </div>
                  {message.subject && (
                    <div className="text-[13px] font-medium">{message.subject}</div>
                  )}
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
