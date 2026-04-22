import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-5"

export type AIResponse = {
  content: string
  reasoning: string
}

export async function askClaude({
  system,
  prompt,
  maxTokens = 2000,
}: {
  system: string
  prompt: string
  maxTokens?: number
}): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude")
  }
  return textBlock.text
}

export async function askClaudeJSON<T>({
  system,
  prompt,
  maxTokens = 2000,
}: {
  system: string
  prompt: string
  maxTokens?: number
}): Promise<T> {
  const fullSystem = `${system}\n\nYou must respond ONLY with valid JSON. No markdown, no code fences, no preamble. Just the JSON object.`

  const raw = await askClaude({
    system: fullSystem,
    prompt,
    maxTokens,
  })

  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new Error(`Failed to parse JSON from Claude: ${cleaned.slice(0, 200)}`)
  }
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001"
const SONNET_MODEL = "claude-sonnet-4-5-20241022"

export async function askHaikuJSON<T>({
  system,
  prompt,
  maxTokens = 1000,
}: {
  system: string
  prompt: string
  maxTokens?: number
}): Promise<T> {
  const fullSystem = `${system}\n\nYou must respond ONLY with valid JSON. No markdown, no code fences, no preamble. Just the JSON object.`

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
    system: fullSystem,
    messages: [{ role: "user", content: prompt }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Haiku")
  }

  const cleaned = textBlock.text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new Error(`Failed to parse JSON from Haiku: ${cleaned.slice(0, 200)}`)
  }
}

export async function askSonnet({
  system,
  prompt,
  maxTokens = 2000,
}: {
  system: string
  prompt: string
  maxTokens?: number
}): Promise<string> {
  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Sonnet")
  }
  return textBlock.text
}