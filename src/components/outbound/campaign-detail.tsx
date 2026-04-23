"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ProspectList } from "./prospect-table"
import type { OutboundCampaign, OutboundProspect, OutboundReply, OutboundEmail } from "@/engine/outbound/types"

export type ProspectWithData = OutboundProspect & {
  reply?: OutboundReply | null
  emails: OutboundEmail[]
}

export function CampaignDetail({
  campaign,
  prospects,
  totalSteps,
  stats,
}: {
  campaign: OutboundCampaign
  prospects: ProspectWithData[]
  totalSteps: number
  stats: {
    prospects: number
    enrolled: number
    sent: number
    replyRate: string
    positiveRate: string
  }
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(campaign.status)
  const [importResult, setImportResult] = useState<{
    total: number; enrolled: number; suppressed: number; belowThreshold: number; duplicates: number; errors: string[]
  } | null>(null)

  const statusStyle: Record<string, string> = {
    active: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.08]",
    paused: "text-amber-600 dark:text-amber-400 bg-amber-500/[0.08]",
    completed: "text-blue-600 dark:text-blue-400 bg-blue-500/[0.08]",
    draft: "text-zinc-500 dark:text-zinc-400 bg-zinc-500/[0.08]",
  }

  async function handleStatusChange(newStatus: string) {
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/outbound/campaigns/${campaign.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to update status")
        return
      }
      setCurrentStatus(newStatus as typeof currentStatus)
      router.refresh()
    } catch {
      alert("Failed to update status")
    } finally {
      setStatusLoading(false)
    }
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const csvText = await file.text()
      const res = await fetch(`/api/outbound/campaigns/${campaign.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Import failed")
      }
      const result = await res.json()
      setImportResult(result)
      router.refresh()
    } catch (err) {
      setImportResult({ total: 0, enrolled: 0, suppressed: 0, belowThreshold: 0, duplicates: 0, errors: [err instanceof Error ? err.message : "Import failed"] })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-[960px]">
      {/* Back */}
      <div>
        <Link href="/pipeline/outbound" className="text-[13px] text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 no-underline transition-colors">
          &larr; Back to campaigns
        </Link>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{campaign.name}</h1>
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-widest ${statusStyle[currentStatus] || statusStyle.draft}`}>
              {currentStatus}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground mt-1">
            {totalSteps}-step sequence &middot; Created {new Date(campaign.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 rounded-lg bg-transparent text-foreground border border-border text-[13px] font-medium cursor-pointer hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] transition-colors disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
          {(currentStatus === "draft" || currentStatus === "paused") && (
            <button
              onClick={() => handleStatusChange("active")}
              disabled={statusLoading}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium cursor-pointer hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {statusLoading ? "..." : currentStatus === "draft" ? "Activate" : "Resume"}
            </button>
          )}
          {currentStatus === "active" && (
            <button
              onClick={() => handleStatusChange("paused")}
              disabled={statusLoading}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-[13px] font-medium cursor-pointer hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {statusLoading ? "..." : "Pause"}
            </button>
          )}
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className={`rounded-xl border px-5 py-4 ${
          importResult.errors.length > 0 && importResult.enrolled === 0
            ? "bg-red-500/[0.04] border-red-500/15"
            : "bg-emerald-500/[0.04] border-emerald-500/15"
        }`}>
          <div className="text-[13px] font-medium mb-1">
            {importResult.enrolled > 0 ? "Import complete" : "Import failed"}
          </div>
          {importResult.enrolled > 0 && (
            <div className="text-[13px] text-muted-foreground">
              {importResult.total} processed &middot; {importResult.enrolled} enrolled &middot; {importResult.belowThreshold} below threshold &middot; {importResult.duplicates} duplicates
            </div>
          )}
          {importResult.errors.length > 0 && (
            <div className="text-xs text-red-500 mt-1.5">
              {importResult.errors.slice(0, 3).join(" | ")}{importResult.errors.length > 3 ? ` (+${importResult.errors.length - 3} more)` : ""}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Prospects", value: stats.prospects, sub: "total imported" },
          { label: "Enrolled", value: stats.enrolled, sub: "passed ICP" },
          { label: "Emails Sent", value: stats.sent, sub: "delivered" },
          { label: "Reply Rate", value: `${stats.replyRate}%`, sub: stats.sent > 0 ? `${stats.sent} sent` : "no sends yet" },
          { label: "Positive", value: `${stats.positiveRate}%`, sub: "of replies" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">{stat.label}</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">{stat.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Prospect list */}
      <ProspectList prospects={prospects} totalSteps={totalSteps} />
    </div>
  )
}
