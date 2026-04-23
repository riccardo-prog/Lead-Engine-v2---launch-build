import { askSonnet } from "@/engine/ai/claude"
import type { OutboundProspect, SequenceStep } from "./types"

type PersonalizedEmail = {
  subject: string
  body: string
  wordCount: number
  reasoning: string
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

Write the email in this exact format:

REASONING: (1-2 sentences: what you personalized on, why you chose this angle, what data from the research brief you used or didn't use)

SUBJECT: (one line)

BODY:
(the email body, signed as ${fromName})`

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
  const text = raw.trim()

  // Extract reasoning
  let reasoning = ""
  const reasoningMatch = text.match(/REASONING:\s*([\s\S]*?)(?=\nSUBJECT:)/i)
  if (reasoningMatch) {
    reasoning = reasoningMatch[1].trim()
  }

  // Extract subject
  let subject = ""
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i)
  if (subjectMatch) {
    subject = subjectMatch[1].trim()
  }

  // Extract body
  let body = ""
  const bodyMatch = text.match(/BODY:\s*([\s\S]*)/i)
  if (bodyMatch) {
    body = bodyMatch[1].trim()
  } else {
    // Fallback: everything after subject line
    const lines = text.split("\n")
    const subjectIdx = lines.findIndex((l) => /^subject:/i.test(l.trim()))
    if (subjectIdx >= 0) {
      body = lines.slice(subjectIdx + 1).join("\n").trim()
    }
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length

  return {
    subject: subject || `Quick question, ${fromName}`,
    body,
    wordCount,
    reasoning,
  }
}
