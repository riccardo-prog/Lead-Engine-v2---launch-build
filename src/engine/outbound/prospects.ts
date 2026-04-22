import { createServiceClient } from "@/lib/supabase-server"
import { isSuppressed } from "./suppression"
import { scoreProspectICP } from "./icp-scoring"
import { generateResearchBrief } from "./research-brief"
import type { OutboundProspect } from "./types"

const KNOWN_COLUMNS = new Set([
  "email", "first_name", "last_name", "company", "title",
  "linkedin_url", "website_url", "company_description",
])

export type CSVRow = Record<string, string>

export type ImportResult = {
  total: number
  enrolled: number
  suppressed: number
  belowThreshold: number
  duplicates: number
  errors: string[]
}

export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return []

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"))

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row: CSVRow = {}
    headers.forEach((h, i) => {
      row[h] = (values[i] || "").trim()
    })
    return row
  }).filter((row) => row.email)
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export async function importProspects({
  campaignId,
  clientId,
  rows,
  icpThreshold,
  businessName,
  icpDescription,
  icpCriteria,
}: {
  campaignId: string
  clientId: string
  rows: CSVRow[]
  icpThreshold: number
  businessName: string
  icpDescription: string
  icpCriteria: Record<string, unknown> | null
}): Promise<ImportResult> {
  const supabase = createServiceClient()
  const result: ImportResult = {
    total: rows.length,
    enrolled: 0,
    suppressed: 0,
    belowThreshold: 0,
    duplicates: 0,
    errors: [],
  }

  for (const row of rows) {
    const email = row.email?.toLowerCase()
    if (!email) {
      result.errors.push("Row missing email")
      continue
    }

    // Suppression check
    if (await isSuppressed(clientId, email)) {
      result.suppressed++
      continue
    }

    // Build custom fields from non-standard columns
    const customFields: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      if (!KNOWN_COLUMNS.has(key) && key !== "email" && value) {
        customFields[key] = value
      }
    }

    // Insert prospect
    const { data: prospect, error } = await supabase
      .from("outbound_prospects")
      .insert({
        client_id: clientId,
        campaign_id: campaignId,
        email,
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        company: row.company || null,
        title: row.title || null,
        linkedin_url: row.linkedin_url || null,
        website_url: row.website_url || null,
        company_description: row.company_description || null,
        custom_fields: customFields,
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      if (error.code === "23505") {
        result.duplicates++
      } else {
        result.errors.push(`${email}: ${error.message}`)
      }
      continue
    }

    const p = prospect as OutboundProspect

    // ICP scoring
    try {
      const icpResult = await scoreProspectICP({
        prospect: p,
        businessName,
        icpDescription,
        icpCriteria,
      })

      await supabase
        .from("outbound_prospects")
        .update({
          icp_score: icpResult.score,
          icp_factors: icpResult.factors,
        })
        .eq("id", p.id)

      if (icpResult.score < icpThreshold) {
        await supabase
          .from("outbound_prospects")
          .update({ status: "suppressed" })
          .eq("id", p.id)
        result.belowThreshold++
        continue
      }
    } catch (e) {
      result.errors.push(`${email}: ICP scoring failed`)
      continue
    }

    // Research brief
    try {
      const brief = await generateResearchBrief(p)
      await supabase
        .from("outbound_prospects")
        .update({
          research_brief: brief.brief,
          research_confidence: brief.confidence,
        })
        .eq("id", p.id)
    } catch (e) {
      result.errors.push(`${email}: Research brief failed`)
      // Don't skip — prospect can still be enrolled with no brief
    }

    // Schedule step 0 email
    const jitterMinutes = Math.floor(Math.random() * 60)
    const sendAfter = new Date(Date.now() + jitterMinutes * 60 * 1000)

    await supabase.from("outbound_emails").insert({
      client_id: clientId,
      prospect_id: p.id,
      campaign_id: campaignId,
      step_order: 0,
      subject: "",
      body: "",
      status: "pending",
      send_after: sendAfter.toISOString(),
    })

    result.enrolled++
  }

  return result
}
