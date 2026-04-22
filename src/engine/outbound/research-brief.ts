import { askHaikuJSON } from "@/engine/ai/claude"
import type { OutboundProspect, ResearchConfidence } from "./types"

type ResearchBriefResult = {
  brief: string
  confidence: ResearchConfidence
}

export async function generateResearchBrief(
  prospect: OutboundProspect
): Promise<ResearchBriefResult> {
  const system = `You are a research assistant preparing a brief for a cold email writer.

AVAILABLE DATA (use ONLY this):
- Prospect name: ${prospect.first_name || ""} ${prospect.last_name || ""}
- Prospect company: ${prospect.company || ""}
- Prospect title: ${prospect.title || ""}
- Prospect LinkedIn URL: ${prospect.linkedin_url || ""}
- Prospect website: ${prospect.website_url || ""}
- Company description: ${prospect.company_description || ""}
- Custom fields: ${JSON.stringify(prospect.custom_fields)}

RULES:
1. ONLY reference facts present in the data above. If a field is empty or null, say "not available."
2. DO NOT invent company metrics, revenue numbers, team sizes, or funding amounts.
3. DO NOT fabricate quotes, case studies, or specific achievements.
4. DO NOT assume industry-specific details not present in the data.
5. If the data is thin, say so: "Limited data available. Suggest generic approach."
6. Flag confidence level: HIGH (3+ meaningful data points), MEDIUM (1-2 data points beyond name/email), LOW (name and email only).

Respond with JSON:
{
  "brief": "<one paragraph, 3-5 sentences + key talking points + suggested angle>",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}`

  const prompt = "Generate the research brief based on the available data above."

  return askHaikuJSON<ResearchBriefResult>({ system, prompt })
}
