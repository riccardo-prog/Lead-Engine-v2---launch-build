"use client"

import Link from "next/link"
import { ProspectTable } from "./prospect-table"
import type { OutboundCampaign, OutboundProspect, OutboundReply } from "@/engine/outbound/types"

type ProspectWithReply = OutboundProspect & { reply?: OutboundReply | null }

export function CampaignDetail({
  campaign,
  prospects,
  totalSteps,
  stats,
}: {
  campaign: OutboundCampaign
  prospects: ProspectWithReply[]
  totalSteps: number
  stats: { prospects: number; sent: number; replyRate: string; positiveRate: string }
}) {
  function getStatusColor(status: string) {
    switch (status) {
      case "active": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      case "paused": return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
      case "completed": return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
      default: return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/pipeline/outbound" className="text-muted-foreground hover:text-foreground text-sm no-underline">
          &larr; Campaigns
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{campaign.name}</h1>
          <span className={`inline-block px-2.5 py-0.5 text-xs rounded-full border ${getStatusColor(campaign.status)}`}>
            {campaign.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Prospects", value: stats.prospects },
          { label: "Sent", value: stats.sent },
          { label: "Reply Rate", value: `${stats.replyRate}%` },
          { label: "Positive", value: `${stats.positiveRate}%` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border p-4">
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className="text-2xl font-semibold text-foreground mt-1">{stat.value}</div>
          </div>
        ))}
      </div>

      <ProspectTable prospects={prospects} totalSteps={totalSteps} />
    </div>
  )
}
