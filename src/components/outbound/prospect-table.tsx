"use client"

import { useState } from "react"
import type { OutboundEmail, OutboundProspect, OutboundReply } from "@/engine/outbound/types"

type ProspectWithData = OutboundProspect & {
  reply?: OutboundReply | null
  emails: OutboundEmail[]
}

type IcpFactors = {
  company_fit?: { score: number; reason: string }
  role_fit?: { score: number; reason: string }
  industry_fit?: { score: number; reason: string }
  summary?: string
}

// ── Helpers ──

const statusStyle: Record<string, string> = {
  pending: "text-zinc-500 bg-zinc-500/[0.08]",
  sending: "text-blue-600 dark:text-blue-400 bg-blue-500/[0.08]",
  sent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.08]",
  awaiting_approval: "text-amber-600 dark:text-amber-400 bg-amber-500/[0.08]",
  replied: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.08]",
  paused: "text-amber-600 dark:text-amber-400 bg-amber-500/[0.08]",
  opted_out: "text-red-600 dark:text-red-400 bg-red-500/[0.08]",
  completed: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/[0.08]",
  bounced: "text-red-600 dark:text-red-400 bg-red-500/[0.08]",
  failed: "text-orange-600 dark:text-orange-400 bg-orange-500/[0.08]",
  suppressed: "text-zinc-400 bg-zinc-500/[0.06]",
}

const emailStatusDot: Record<string, string> = {
  sent: "bg-emerald-500",
  pending: "bg-zinc-400",
  sending: "bg-blue-500",
  failed: "bg-red-500",
  bounced: "bg-red-500",
  cancelled: "bg-zinc-300 dark:bg-zinc-600",
  awaiting_approval: "bg-amber-500",
}

function scoreColor(s: number | null) {
  if (s == null) return "text-zinc-400"
  if (s >= 70) return "text-emerald-600 dark:text-emerald-400"
  if (s >= 40) return "text-amber-600 dark:text-amber-400"
  return "text-red-500"
}

function scoreBarColor(s: number) {
  if (s >= 70) return "from-emerald-500 to-cyan-500"
  if (s >= 40) return "from-amber-500 to-yellow-400"
  return "from-red-500 to-orange-400"
}

function fmt(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function initials(p: OutboundProspect) {
  const parts = [p.first_name, p.last_name].filter(Boolean)
  if (parts.length === 0) return p.email[0].toUpperCase()
  return parts.map(n => n![0]).join("").slice(0, 2).toUpperCase()
}

// ── Score bar sub-component ──

function ScoreBar({ label, score, reason }: { label: string; score: number; reason: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-[100px] shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <span className={`text-[11px] font-semibold tabular-nums ${scoreColor(score)}`}>{score}</span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full bg-gradient-to-r ${scoreBarColor(score)} transition-all`} style={{ width: `${score}%` }} />
        </div>
      </div>
      <span className="text-[12px] text-muted-foreground leading-snug pt-0.5">{reason}</span>
    </div>
  )
}

// ── Email step card ──

function EmailStep({ email, stepNum }: { email: OutboundEmail; stepNum: number }) {
  const [open, setOpen] = useState(false)
  const hasContent = email.body && email.body.length > 0

  return (
    <div className="relative pl-6">
      {/* Timeline dot */}
      <div className={`absolute left-0 top-[7px] w-2.5 h-2.5 rounded-full border-2 border-background ${emailStatusDot[email.status] || "bg-zinc-400"}`} />

      <div className="pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground">Step {stepNum}</span>
          <span className="text-[11px] text-muted-foreground">&middot;</span>
          <span className={`text-[11px] ${email.status === "awaiting_approval" ? "text-amber-500" : "text-muted-foreground"}`}>
            {email.status === "awaiting_approval" ? "needs approval" : email.status}
          </span>
          <span className="text-[11px] text-muted-foreground ml-auto">
            {email.sent_at ? fmt(email.sent_at) : email.send_after ? `sched. ${fmt(email.send_after)}` : ""}
          </span>
        </div>

        {email.subject && (
          <div className="text-[13px] text-foreground/80 mt-0.5">{email.subject}</div>
        )}

        {hasContent && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
              className="text-[11px] text-indigo-500 hover:text-indigo-400 mt-1 cursor-pointer bg-transparent border-0 p-0"
            >
              {open ? "Hide body" : "Show body"}
            </button>
            {open && (
              <div className="mt-2 text-[12px] text-foreground/60 whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg px-3 py-2.5">
                {email.body}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Expanded prospect detail (compact) ──

function ProspectDetail({ prospect }: { prospect: ProspectWithData }) {
  const factors = prospect.icp_factors as IcpFactors | null
  const [showBrief, setShowBrief] = useState(false)

  return (
    <div className="px-5 pb-4 pt-2 flex flex-col gap-3">
      {/* Row 1: contact + links */}
      <div className="flex items-center gap-4 text-[12px] flex-wrap">
        <span className="text-muted-foreground">{prospect.email}</span>
        {prospect.title && <span className="text-foreground/70">{prospect.title}{prospect.company ? ` at ${prospect.company}` : ""}</span>}
        {prospect.linkedin_url && (
          <a href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-400 no-underline">LinkedIn &rarr;</a>
        )}
        {prospect.website_url && (
          <a href={prospect.website_url.startsWith("http") ? prospect.website_url : `https://${prospect.website_url}`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-400 no-underline">Website &rarr;</a>
        )}
      </div>

      {/* Row 2: ICP breakdown (inline) */}
      {prospect.icp_score != null && factors && (
        <div className="flex items-start gap-5">
          <div className="flex items-center gap-3 shrink-0">
            {factors.company_fit && <MiniScore label="Company" score={factors.company_fit.score} />}
            {factors.role_fit && <MiniScore label="Role" score={factors.role_fit.score} />}
            {factors.industry_fit && <MiniScore label="Industry" score={factors.industry_fit.score} />}
          </div>
          {factors.summary && (
            <span className="text-[11px] text-muted-foreground italic leading-snug pt-0.5">{factors.summary}</span>
          )}
        </div>
      )}

      {/* Row 3: Research brief (collapsed by default) */}
      {prospect.research_brief && (
        <div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowBrief(!showBrief) }}
            className="text-[11px] text-indigo-500 hover:text-indigo-400 cursor-pointer bg-transparent border-0 p-0 flex items-center gap-1"
          >
            {showBrief ? "Hide" : "Show"} research brief
            {prospect.research_confidence && (
              <span className={`text-[10px] uppercase tracking-wider ${
                prospect.research_confidence === "HIGH" ? "text-emerald-500" :
                prospect.research_confidence === "MEDIUM" ? "text-amber-500" : "text-zinc-400"
              }`}>{prospect.research_confidence}</span>
            )}
          </button>
          {showBrief && (
            <p className="text-[12px] text-foreground/70 leading-relaxed mt-1.5">{prospect.research_brief}</p>
          )}
        </div>
      )}

      {/* Row 4: Email steps (inline timeline) */}
      {prospect.emails.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground mr-1">Emails:</span>
          {prospect.emails.map((email) => (
            <EmailPill key={email.id} email={email} />
          ))}
        </div>
      )}

      {/* Reply if exists */}
      {prospect.reply && (
        <div className="bg-emerald-500/[0.03] border border-emerald-500/10 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-medium uppercase tracking-widest ${
              prospect.reply.sentiment === "reply_to_continue" ? "text-emerald-500" :
              prospect.reply.sentiment === "reply_to_pause" ? "text-amber-500" : "text-red-500"
            }`}>
              {prospect.reply.sentiment.replace("reply_to_", "")}
            </span>
            <span className="text-[11px] text-muted-foreground">{fmt(prospect.reply.created_at)}</span>
          </div>
          <p className="text-[12px] text-foreground/70 leading-relaxed line-clamp-2">{prospect.reply.content}</p>
        </div>
      )}
    </div>
  )
}

function MiniScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="w-8 h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${scoreBarColor(score)}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[10px] font-semibold tabular-nums ${scoreColor(score)}`}>{score}</span>
    </div>
  )
}

function EmailPill({ email }: { email: OutboundEmail }) {
  const [showDetail, setShowDetail] = useState(false)
  const hasBody = email.body && email.body.length > 0

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail) }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border transition-colors bg-transparent cursor-pointer ${
          showDetail ? "border-indigo-500/30 bg-indigo-500/[0.04]" : "border-border hover:border-border/80"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${emailStatusDot[email.status] || "bg-zinc-400"}`} />
        <span className="text-muted-foreground">S{email.step_order + 1}</span>
        <span className="text-muted-foreground/60">{email.status === "awaiting_approval" ? "approval" : email.status}</span>
      </button>
      {showDetail && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[360px] bg-card border border-border rounded-lg shadow-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-foreground">Step {email.step_order + 1}</span>
            <span className={`text-[10px] ${email.status === "sent" ? "text-emerald-500" : email.status === "awaiting_approval" ? "text-amber-500" : "text-muted-foreground"}`}>
              {email.status === "awaiting_approval" ? "needs approval" : email.status}
            </span>
          </div>
          {hasBody ? (
            <>
              {email.subject && <div className="text-[12px] font-medium text-foreground mb-1">{email.subject}</div>}
              <div className="text-[11px] text-foreground/60 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto">{email.body}</div>
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground italic">Content will be generated at send time</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-2 pt-1.5 border-t border-border">
            {email.sent_at ? `Sent ${fmt(email.sent_at)}` : email.send_after ? `Scheduled ${fmt(email.send_after)}` : "Not scheduled"}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Prospect card row ──

function deriveDisplayStatus(prospect: ProspectWithData): string {
  // Terminal statuses always take priority
  if (["replied", "opted_out", "bounced", "failed", "suppressed", "completed"].includes(prospect.status)) {
    return prospect.status
  }
  // If any email has been sent, show "sent" instead of "sending"
  const hasSent = prospect.emails.some((e) => e.status === "sent")
  const hasAwaiting = prospect.emails.some((e) => e.status === "awaiting_approval")
  if (hasSent) return "sent"
  if (hasAwaiting) return "awaiting_approval"
  return prospect.status
}

function ProspectCard({ prospect, totalSteps }: { prospect: ProspectWithData; totalSteps: number }) {
  const [expanded, setExpanded] = useState(false)
  const name = [prospect.first_name, prospect.last_name].filter(Boolean).join(" ") || prospect.email
  const displayStatus = deriveDisplayStatus(prospect)

  return (
    <div className={`bg-card border rounded-xl transition-colors ${expanded ? "border-indigo-500/20" : "border-border hover:border-border/80"}`}>
      {/* Row header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-3.5 text-left cursor-pointer bg-transparent border-0"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
          {initials(prospect)}
        </div>

        {/* Name + title */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-foreground truncate">{name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {prospect.title ? `${prospect.title}${prospect.company ? ` at ${prospect.company}` : ""}` : prospect.company || prospect.email}
          </div>
        </div>

        {/* Status */}
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shrink-0 ${statusStyle[displayStatus] || statusStyle.pending}`}>
          {displayStatus === "awaiting_approval" ? "approval" : displayStatus}
        </span>

        {/* Step */}
        <div className="text-center shrink-0 min-w-[48px]">
          <div className="text-[11px] text-muted-foreground">Step</div>
          <div className="text-[13px] font-medium tabular-nums">{prospect.current_step + 1}/{totalSteps}</div>
        </div>

        {/* ICP Score */}
        <div className="text-center shrink-0 min-w-[48px]">
          <div className="text-[11px] text-muted-foreground">ICP</div>
          <div className={`text-[14px] font-semibold tabular-nums ${scoreColor(prospect.icp_score)}`}>
            {prospect.icp_score ?? "—"}
          </div>
        </div>

        {/* Chevron */}
        <svg className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border">
          <ProspectDetail prospect={prospect} />
        </div>
      )}
    </div>
  )
}

// ── Main list ──

export function ProspectList({
  prospects,
  totalSteps,
}: {
  prospects: ProspectWithData[]
  totalSteps: number
}) {
  const [filter, setFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<"score" | "name">("score")

  let filtered = prospects.filter((p) => {
    const ds = deriveDisplayStatus(p)
    if (filter !== "all" && ds !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.email.toLowerCase().includes(q) ||
        p.first_name?.toLowerCase().includes(q) ||
        p.last_name?.toLowerCase().includes(q) ||
        p.company?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q)
      )
    }
    return true
  })

  if (sort === "score") {
    filtered = [...filtered].sort((a, b) => (b.icp_score ?? -1) - (a.icp_score ?? -1))
  } else {
    filtered = [...filtered].sort((a, b) => {
      const na = [a.first_name, a.last_name].filter(Boolean).join(" ").toLowerCase()
      const nb = [b.first_name, b.last_name].filter(Boolean).join(" ").toLowerCase()
      return na.localeCompare(nb)
    })
  }

  const statusCounts = prospects.reduce((acc, p) => {
    const ds = deriveDisplayStatus(p)
    acc[ds] = (acc[ds] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const tabs = ["all", ...Object.keys(statusCounts).sort()]

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 text-[11px] rounded-md transition-colors cursor-pointer border-0 ${
                filter === t
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? `All ${prospects.length}` : `${t} ${statusCounts[t]}`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-[12px] rounded-lg border border-border bg-background px-3 py-1.5 w-[180px] placeholder:text-muted-foreground/50"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "score" | "name")}
            className="text-[11px] rounded-lg border border-border bg-background px-2 py-1.5 text-muted-foreground cursor-pointer"
          >
            <option value="score">ICP Score</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {filtered.map((p) => (
          <ProspectCard key={p.id} prospect={p} totalSteps={totalSteps} />
        ))}
        {filtered.length === 0 && (
          <div className="bg-card border border-border rounded-xl px-5 py-12 text-center">
            <div className="text-[13px] text-muted-foreground">No prospects match your filters</div>
          </div>
        )}
      </div>
    </div>
  )
}
