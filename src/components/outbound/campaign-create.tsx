"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CSVUpload } from "./csv-upload"

export function CampaignCreate() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{
    total: number
    enrolled: number
    suppressed: number
    belowThreshold: number
    duplicates: number
  } | null>(null)

  async function handleCreate() {
    if (!name.trim() || !csvFile) return

    setLoading(true)
    setError(null)

    try {
      const createRes = await fetch("/api/outbound/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })

      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || "Failed to create campaign")
      }

      const { campaignId } = await createRes.json()

      const csvText = await csvFile.text()
      const importRes = await fetch(`/api/outbound/campaigns/${campaignId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      })

      if (!importRes.ok) {
        const data = await importRes.json()
        throw new Error(data.error || "Failed to import prospects")
      }

      const result = await importRes.json()
      setImportResult(result)

      setTimeout(() => router.push(`/pipeline/outbound/${campaignId}`), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Campaign</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Campaign Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q2 Agency Outreach"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Prospect List (CSV)</label>
          <CSVUpload onUpload={setCsvFile} />
          {csvFile && (
            <div className="mt-2 text-sm text-muted-foreground">
              Selected: {csvFile.name}
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
        )}

        {importResult && (
          <div className="text-sm bg-emerald-500/10 rounded-lg px-4 py-3 space-y-1">
            <div className="font-medium text-emerald-600 dark:text-emerald-400">Import Complete</div>
            <div className="text-muted-foreground">Total: {importResult.total}</div>
            <div className="text-muted-foreground">Enrolled: {importResult.enrolled}</div>
            <div className="text-muted-foreground">Suppressed: {importResult.suppressed}</div>
            <div className="text-muted-foreground">Below ICP threshold: {importResult.belowThreshold}</div>
            <div className="text-muted-foreground">Duplicates: {importResult.duplicates}</div>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={!name.trim() || !csvFile || loading}
          className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Creating & Importing..." : "Create Campaign"}
        </button>
      </div>
    </div>
  )
}
