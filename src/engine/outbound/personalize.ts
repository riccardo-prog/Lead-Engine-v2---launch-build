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
  doNotSay,
}: {
  prospect: OutboundProspect
  step: SequenceStep
  fromName: string
  businessName: string
  socialProof?: string[]
  doNotSay?: string[]
}): Promise<PersonalizedEmail> {
  const socialProofBlock = socialProof && socialProof.length > 0
    ? socialProof.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "None provided."

  const doNotSayBlock = doNotSay && doNotSay.length > 0
    ? doNotSay.map((s) => `- "${s}"`).join("\n")
    : ""

  const signature = `${fromName}\nFounder, ${businessName}`

  const system = `You are ${fromName}, founder of ${businessName}. You are writing a short cold email to a real estate professional.

YOUR VOICE:
- You talk like a founder texting a peer, not a marketer writing copy.
- Short sentences. Conversational. No corporate speak.
- Never use em dashes. Use commas, periods, or split into two sentences instead.
- Never use semicolons. Keep it simple.
- Never start with "I" as the first word of the email.
- Never open with "Hey [Name], I came across..." or "I noticed..." or "I saw...". Find a more natural opener.
- Do not generalize about their industry. No "most brokerages...", "many agents...", "the industry is...". Talk to THEM specifically or don't mention their industry at all.

GROUNDING RULE: The research brief below is your ONLY source of prospect information.
Do not invent details, metrics, or claims not in the brief. If the brief says
"Limited data available," write a shorter email that leans on curiosity instead of fake specifics.

RESEARCH BRIEF:
${prospect.research_brief || "No research brief available. Write a short, curiosity-driven email."}

PROSPECT:
- Name: ${prospect.first_name || ""}
- Company: ${prospect.company || ""}
- Title: ${prospect.title || ""}

STEP INSTRUCTION:
${step.prompt}

RULES:
1. Every sentence earns its place or gets cut. No filler.
2. If the research brief has specific info about their business, reference it naturally. If confidence is LOW, don't force it.
3. One idea per email. One clear ask.
4. Sound human. No "I hope this finds you well", no "just wanted to reach out", no "touching base".
5. Never guilt-trip about silence. Never say "just following up" or "bumping this".
6. End with a low-commitment question that's easy to reply to.
7. Max ${step.maxWords} words. Shorter is better.
${doNotSayBlock ? `\nNEVER USE THESE WORDS/PHRASES:\n${doNotSayBlock}` : ""}

SOCIAL PROOF (use sparingly, only if it fits naturally):
${socialProofBlock}

SIGN-OFF: Always sign the email exactly as:
${signature}

Write the email in this exact format:

REASONING: (1-2 sentences: what angle you chose and why, what from the brief you used or skipped)

SUBJECT: (short, lowercase, no clickbait, sounds like a real person wrote it)

BODY:
(the email body, ending with the sign-off above)`

  const prompt = "Write the email now."

  const prospectName = prospect.first_name || "there"

  let raw = await askSonnet({ system, prompt, maxTokens: 500 })
  let parsed = parseEmailOutput(raw, prospectName)

  // Word count enforcement: retry once if >120% of limit
  if (parsed.wordCount > step.maxWords * 1.2) {
    const retrySystem = `${system}\n\nIMPORTANT: Your previous draft was ${parsed.wordCount} words. The limit is ${step.maxWords}. Be more concise.`
    raw = await askSonnet({ system: retrySystem, prompt, maxTokens: 500 })
    parsed = parseEmailOutput(raw, prospectName)
  }

  // Post-processing: strip em dashes and semicolons that slip through
  parsed.body = parsed.body.replace(/\u2014/g, ",").replace(/;/g, ".")
  parsed.subject = parsed.subject.replace(/\u2014/g, ",").replace(/;/g, ".")

  return parsed
}

function parseEmailOutput(raw: string, prospectName: string): PersonalizedEmail {
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
    subject: subject || `Quick question, ${prospectName}`,
    body,
    wordCount,
    reasoning,
  }
}
