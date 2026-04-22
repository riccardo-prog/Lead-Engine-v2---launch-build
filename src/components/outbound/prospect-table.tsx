"use client"

import { useState } from "react"
import type { OutboundProspect, OutboundReply } from "@/engine/outbound/types"

type ProspectWithReply = OutboundProspect & {
  reply?: OutboundReply | null
}

export function ProspectTable({
  prospects,
  totalSteps,
}: {
  prospects: ProspectWithReply[]
  totalSteps: number
}) {
  const [filter, setFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  const filtered = prospects.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.email.toLowerCase().includes(q) ||
        (p.first_name?.toLowerCase().includes(q)) ||
        (p.last_name?.toLowerCase().includes(q)) ||
        (p.company?.toLowerCase().includes(q))
      )
    }
    return true
  })

  function getStatusColor(status: string) {
    switch (status) {
      case "sending": return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
      case "replied": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      case "paused": return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
      case "opted_out": return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
      case "completed": return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"
      case "bounced": return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
      case "failed": return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20"
      case "suppressed": return "bg-zinc-500/15 text-zinc-500 border-zinc-500/20"
      default: return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"
    }
  }

  function getSentimentColor(sentiment: string | undefined) {
    switch (sentiment) {
      case "reply_to_continue": return "text-emerald-600 dark:text-emerald-400"
      case "reply_to_pause": return "text-amber-600 dark:text-amber-400"
      case "reply_to_stop": return "text-red-600 dark:text-red-400"
      default: return "text-muted-foreground"
    }
  }

  const statuses = ["all", "pending", "sending", "replied", "paused", "opted_out", "completed", "bounced", "failed", "suppressed"]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-sm rounded-lg border border-border bg-background px-3 py-1.5"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search by name, email, company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm rounded-lg border border-border bg-background px-3 py-1.5 flex-1 max-w-xs"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} prospects</span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Company</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
              <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Step</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Sentiment</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">ICP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.company || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${getStatusColor(p.status)}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-muted-foreground">
                  {p.current_step + 1}/{totalSteps}
                </td>
                <td className="px-4 py-3">
                  {p.reply ? (
                    <span className={`text-xs font-medium ${getSentimentColor(p.reply.sentiment)}`}>
                      {p.reply.sentiment.replace("reply_to_", "")}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {p.icp_score ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
