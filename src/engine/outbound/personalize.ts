import { askSonnet } from "@/engine/ai/claude"
import type { OutboundProspect, SequenceStep } from "./types"

type PersonalizedEmail = {
  subject: string
  body: string
  wordCount: number
}

export async function personalizeEmail({
  prospect,
  step,
  fromName,
  businessName,
  socialProof,
}: {
  prospect: OutboundProspect
  step: SequenceStep
  fromName: string
  businessName: string
  socialProof?: string[]
}): Promise<PersonalizedEmail> {
  const socialProofBlock = socialProof && socialProof.length > 0
    ? socialProof.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "None provided."

  const system = `You are writing a cold email on behalf of ${fromName} at ${businessName}.

GROUNDING RULE: The research brief below is your ONLY source of prospect information.
Do not add details, metrics, or claims not present in the brief. If the brief says
"Limited data available," write a shorter, more generic email. Never fabricate specifics
to fill space.

RESEARCH BRIEF:
${prospect.research_brief || "No research brief available. Write a generic but genuine email."}

PROSPECT:
- Name: ${prospect.first_name || ""}
- Company: ${prospect.company || ""}

STEP INSTRUCTION:
${step.prompt}

COLD EMAIL RULES (from operator):
1. No fluff, no filler. Every sentence earns its place or gets cut.
2. Research first. Reference something specific about their business — not generic.
   If research brief confidence is LOW, skip specific references entirely.
3. One idea per email. Don't stack pitches.
4. Sound like a person, not a campaign. No templates, no "I hope this finds you well."
5. Handle silence with grace. Never guilt-trip. Never say "just following up" or "bumping this."
6. End on a question, not a pitch. Make replying easy and low-commitment.
7. Keep it short. If it takes longer than 15 seconds to read, it's too long.

SOCIAL PROOF (if available):
${socialProofBlock}

Write the email. Subject line first (one line), then a blank line, then the body.
Sign as ${fromName}.
Do not include any preamble or commentary — just the subject and body.`

  const prompt = "Write the email now."

  let raw = await askSonnet({ system, prompt, maxTokens: 500 })
  let parsed = parseEmailOutput(raw, fromName)

  // Word count enforcement: retry once if >120% of limit
  if (parsed.wordCount > step.maxWords * 1.2) {
    const retrySystem = `${system}\n\nIMPORTANT: Your previous draft was ${parsed.wordCount} words. The limit is ${step.maxWords}. Be more concise.`
    raw = await askSonnet({ system: retrySystem, prompt, maxTokens: 500 })
    parsed = parseEmailOutput(raw, fromName)
  }

  return parsed
}

function parseEmailOutput(raw: string, fromName: string): PersonalizedEmail {
  const lines = raw.trim().split("\n")

  // First non-empty line is the subject
  let subjectLine = ""
  let bodyStartIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line) {
      subjectLine = line.replace(/^subject:\s*/i, "")
      bodyStartIndex = i + 1
      break
    }
  }

  // Skip blank lines between subject and body
  while (bodyStartIndex < lines.length && !lines[bodyStartIndex].trim()) {
    bodyStartIndex++
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim()
  const wordCount = body.split(/\s+/).filter(Boolean).length

  return {
    subject: subjectLine || `Quick question, ${fromName}`,
    body,
    wordCount,
  }
}
