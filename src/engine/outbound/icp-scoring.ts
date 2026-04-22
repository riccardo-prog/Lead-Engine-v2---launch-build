import { askHaikuJSON } from "@/engine/ai/claude"
import type { IcpScoreResult, OutboundProspect } from "./types"

export async function scoreProspectICP({
  prospect,
  businessName,
  icpDescription,
  icpCriteria,
}: {
  prospect: OutboundProspect
  businessName: string
  icpDescription: string
  icpCriteria: Record<string, unknown> | null
}): Promise<IcpScoreResult> {
  const system = `You are scoring a sales prospect for ICP (Ideal Customer Profile) fit.

BUSINESS: ${businessName}
WHAT WE SELL: ${icpDescription}
ICP CRITERIA: ${icpCriteria ? JSON.stringify(icpCriteria) : "Not specified — use general B2B fit signals."}

Score this prospect 0-100 for ICP fit. Consider:
- Company type/size alignment with what we sell
- Title/role alignment (are they a decision maker?)
- Industry relevance

Respond with JSON:
{
  "score": <0-100>,
  "factors": {
    "company_fit": { "score": <0-100>, "reason": "<one sentence>" },
    "role_fit": { "score": <0-100>, "reason": "<one sentence>" },
    "industry_fit": { "score": <0-100>, "reason": "<one sentence>" }
  },
  "summary": "<one sentence overall assessment>"
}`

  const prompt = `PROSPECT:
- Name: ${prospect.first_name || ""} ${prospect.last_name || ""}
- Company: ${prospect.company || "Unknown"}
- Title: ${prospect.title || "Unknown"}
- Custom fields: ${JSON.stringify(prospect.custom_fields)}`

  return askHaikuJSON<IcpScoreResult>({ system, prompt })
}
