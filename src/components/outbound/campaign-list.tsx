"use client"

import Link from "next/link"
import type { OutboundCampaign } from "@/engine/outbound/types"

type CampaignStats = {
  campaignId: string
  prospectCount: number
  sentCount: number
  replyCount: number
  positiveReplyCount: number
}

export function CampaignList({
  campaigns,
  stats,
}: {
  campaigns: OutboundCampaign[]
  stats: CampaignStats[]
}) {
  const statsMap = new Map(stats.map((s) => [s.campaignId, s]))

  function getStatusColor(status: string) {
    switch (status) {
      case "active": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      case "paused": return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
      case "completed": return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
      default: return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Campaigns</h2>
        <Link
          href="/pipeline/outbound/new"
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors no-underline"
        >
          New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No campaigns yet. Create your first outbound campaign.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Prospects</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Sent</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Reply Rate</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Positive</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const s = statsMap.get(campaign.id)
                const replyRate = s && s.sentCount > 0
                  ? ((s.replyCount / s.sentCount) * 100).toFixed(1)
                  : "\u2014"
                const positiveRate = s && s.replyCount > 0
                  ? ((s.positiveReplyCount / s.replyCount) * 100).toFixed(1)
                  : "\u2014"

                return (
                  <tr key={campaign.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`/pipeline/outbound/${campaign.id}`}
                        className="text-foreground font-medium hover:text-indigo-500 transition-colors no-underline"
                      >
                        {campaign.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${getStatusColor(campaign.status)}`}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{s?.prospectCount ?? 0}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{s?.sentCount ?? 0}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{replyRate}%</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{positiveRate}%</td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
