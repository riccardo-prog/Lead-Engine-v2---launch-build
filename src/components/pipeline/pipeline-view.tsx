"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import type { Lead } from "@/types/database"
import type { FunnelStage, LeadSource } from "@/config/schema"

function getTemperature(lead: Lead): "hot" | "warm" | "cold" | "booked" {
  if (lead.stage_id === "booked") return "booked"
  if (lead.summary?.temperature) return lead.summary.temperature
  // Fallback if no AI summary yet
  if (lead.score >= 70) return "hot"
  if (lead.score >= 40) return "warm"
  return "cold"
}

const tempStyles: Record<string, string> = {
  hot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]",
  warm: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]",
  cold: "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.3)]",
  booked: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]",
}

const stageBadgeStyles: Record<string, string> = {
  new: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/[0.08]",
  contacted: "text-amber-600 dark:text-amber-400 bg-amber-500/[0.08]",
  nurturing: "text-indigo-500 dark:text-indigo-300 bg-indigo-500/[0.08]",
  qualified: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.08]",
  booked: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/[0.08]",
}

export function PipelineView({
  stages,
  sources,
  leads,
  leadTypes,
}: {
  stages: FunnelStage[]
  sources: LeadSource[]
  leads: Lead[]
  leadTypes: string[]
}) {
  const [activeStage, setActiveStage] = useState<string | "all">("all")
  const [activeTemp, setActiveTemp] = useState<string | "all">("all")
  const [activeType, setActiveType] = useState<string | "all">("all")
  const [scoreMin, setScoreMin] = useState("")
  const [scoreMax, setScoreMax] = useState("")
  const [search, setSearch] = useState("")

  const sortedStages = [...stages].sort((a, b) => a.order - b.order)

  const filtered = useMemo(() => {
    const minScore = scoreMin ? parseInt(scoreMin, 10) : null
    const maxScore = scoreMax ? parseInt(scoreMax, 10) : null
    return leads.filter((l) => {
      if (activeStage !== "all" && l.stage_id !== activeStage) return false
      if (activeTemp !== "all" && getTemperature(l) !== activeTemp) return false
      if (activeType !== "all" && (l.lead_type || "unknown") !== activeType) return false
      if (minScore !== null && !isNaN(minScore) && l.score < minScore) return false
      if (maxScore !== null && !isNaN(maxScore) && l.score > maxScore) return false
      if (search) {
        const q = search.toLowerCase()
        const name = `${l.first_name || ""} ${l.last_name || ""}`.toLowerCase()
        const email = (l.email || "").toLowerCase()
        if (!name.includes(q) && !email.includes(q)) return false
      }
      return true
    })
  }, [leads, activeStage, activeTemp, activeType, scoreMin, scoreMax, search])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length }
    for (const stage of stages) {
      counts[stage.id] = leads.filter((l) => l.stage_id === stage.id).length
    }
    return counts
  }, [leads, stages])

  const sourceMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of sources) map[s.id] = s.label
    return map
  }, [sources])

  const stageMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of stages) map[s.id] = s.label
    return map
  }, [stages])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {leads.length} total leads
          </p>
        </div>
        <Link
          href="/pipeline/new"
          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-sm font-medium no-underline hover:opacity-90 transition-opacity"
        >
          + New lead
        </Link>
      </div>

      {/* Stage filter pills */}
      <div className="flex gap-2 flex-wrap">
        <StagePill
          label="All"
          count={stageCounts.all}
          active={activeStage === "all"}
          onClick={() => setActiveStage("all")}
        />
        {sortedStages.map((stage) => (
          <StagePill
            key={stage.id}
            label={stage.label}
            count={stageCounts[stage.id]}
            active={activeStage === stage.id}
            onClick={() => setActiveStage(stage.id)}
          />
        ))}
      </div>

      {/* Temperature filter pills */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-muted-foreground uppercase tracking-wide mr-1">Temp</span>
        {(["all", "hot", "warm", "cold", "booked"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTemp(t)}
            className={`
              px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer flex items-center gap-1.5 transition-colors border
              ${activeTemp === t
                ? "bg-indigo-500/15 border-indigo-500/20 text-foreground"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-indigo-500/10"
              }
            `}
          >
            {t !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${tempStyles[t]}`} />}
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Lead type filter pills */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-muted-foreground uppercase tracking-wide mr-1">Type</span>
        {(["all", ...leadTypes, "unknown"]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={`
              px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-colors border
              ${activeType === t
                ? "bg-indigo-500/15 border-indigo-500/20 text-foreground"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-indigo-500/10"
              }
            `}
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Search + score range */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none w-full md:max-w-xs focus:border-indigo-500/30 transition-colors"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Score</span>
          <input
            type="number"
            placeholder="Min"
            value={scoreMin}
            onChange={(e) => setScoreMin(e.target.value)}
            className="w-16 px-2 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none text-center tabular-nums focus:border-indigo-500/30 transition-colors"
          />
          <span className="text-muted-foreground text-xs">-</span>
          <input
            type="number"
            placeholder="Max"
            value={scoreMax}
            onChange={(e) => setScoreMax(e.target.value)}
            className="w-16 px-2 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none text-center tabular-nums focus:border-indigo-500/30 transition-colors"
          />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border border-indigo-500/[0.06] rounded-xl overflow-hidden bg-card">
        <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1fr_80px] px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide bg-indigo-500/[0.02]">
          <div>Lead</div>
          <div>Stage</div>
          <div>Source</div>
          <div>Last activity</div>
          <div className="text-right">Score</div>
        </div>

        {filtered.length === 0 && (
          <div className="py-10 px-4 text-center text-muted-foreground text-sm">
            No leads yet. They&apos;ll show up here as they come in.
          </div>
        )}

        {filtered.map((lead) => {
          const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed"
          const updated = new Date(lead.updated_at)
          const relative = timeAgo(updated)
          const temp = getTemperature(lead)
          const badgeStyle = stageBadgeStyles[lead.stage_id] || "text-muted-foreground bg-muted"

          return (
            <Link
              key={lead.id}
              href={`/pipeline/${lead.id}`}
              className="no-underline text-inherit"
            >
              <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1fr_80px] px-4 py-3.5 border-b border-border text-sm items-center cursor-pointer hover:bg-indigo-500/[0.04] transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${tempStyles[temp]}`} />
                  <div>
                    <div className="font-medium text-foreground">{name}</div>
                    {lead.email && (
                      <div className="text-xs text-muted-foreground mt-0.5">{lead.email}</div>
                    )}
                  </div>
                </div>
                <div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${badgeStyle}`}>
                    {stageMap[lead.stage_id] || lead.stage_id}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {sourceMap[lead.source_id] || "-"}
                </div>
                <div className="text-muted-foreground text-[13px]">
                  {relative}
                </div>
                <div className="text-right tabular-nums">
                  {lead.score}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Mobile card list */}
      <div className="md:hidden flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="py-10 px-4 text-center text-muted-foreground text-sm border border-border rounded-xl bg-card">
            No leads yet. They&apos;ll show up here as they come in.
          </div>
        )}

        {filtered.map((lead) => {
          const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed"
          const updated = new Date(lead.updated_at)
          const relative = timeAgo(updated)
          const temp = getTemperature(lead)
          const badgeStyle = stageBadgeStyles[lead.stage_id] || "text-muted-foreground bg-muted"

          return (
            <Link
              key={lead.id}
              href={`/pipeline/${lead.id}`}
              className="no-underline text-inherit"
            >
              <div className="border border-border rounded-xl bg-card px-4 py-3.5 cursor-pointer hover:bg-indigo-500/[0.04] transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${tempStyles[temp]}`} />
                    <span className="font-medium text-sm text-foreground">{name}</span>
                  </div>
                  <span className="text-sm tabular-nums font-medium">{lead.score}</span>
                </div>
                {lead.email && (
                  <div className="text-xs text-muted-foreground mb-2">{lead.email}</div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${badgeStyle}`}>
                    {stageMap[lead.stage_id] || lead.stage_id}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {sourceMap[lead.source_id] || "-"}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {relative}
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function StagePill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-md text-[13px] font-medium cursor-pointer flex items-center gap-2 transition-colors border
        ${active
          ? "bg-indigo-500/15 border-indigo-500/20 text-foreground"
          : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-indigo-500/10"
        }
      `}
    >
      {label}
      <span className={`text-[11px] ${active ? "text-indigo-400" : "text-muted-foreground opacity-80"}`}>
        {count}
      </span>
    </button>
  )
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  return date.toLocaleDateString()
}
