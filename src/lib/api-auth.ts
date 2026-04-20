import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual as cryptoTimingSafeEqual } from "crypto"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export type AuthResult = {
  ok: true
  userId?: string
  method: "session" | "bearer"
} | {
  ok: false
  response: NextResponse
}

export async function requireSession(): Promise<AuthResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  return { ok: true, userId: user.id, method: "session" }
}

export function requireBearerToken(request: NextRequest): AuthResult {
  const expected = process.env.INTERNAL_API_SECRET
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "server_misconfigured" },
        { status: 500 }
      ),
    }
  }

  const header = request.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""

  // Accept INTERNAL_API_SECRET or CRON_SECRET (Vercel crons use CRON_SECRET)
  const cronSecret = process.env.CRON_SECRET
  const matchesInternal = constantTimeEqual(token, expected)
  const matchesCron = cronSecret ? constantTimeEqual(token, cronSecret) : false

  if (!token || (!matchesInternal && !matchesCron)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  return { ok: true, method: "bearer" }
}

/**
 * Accept either a valid session OR a valid bearer token.
 * Critical: if the server is misconfigured (INTERNAL_API_SECRET missing),
 * surface a 500 immediately rather than silently falling through to session auth.
 */
export async function requireSessionOrBearer(
  request: NextRequest
): Promise<AuthResult> {
  const header = request.headers.get("authorization") || ""
  const attemptingBearer = header.startsWith("Bearer ")

  if (attemptingBearer) {
    const bearer = requireBearerToken(request)
    if (bearer.ok) return bearer
    // Bearer was attempted but invalid — don't silently fall through.
    // Fall through ONLY if the failure was "no secret configured" with no bearer attempt.
    // Here the caller explicitly sent a bearer, so reject.
    return bearer
  }

  const session = await requireSession()
  if (session.ok) return session

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  // Always pad to the same length to avoid length-based timing leaks.
  const maxLen = Math.max(a.length, b.length, 32)
  const aBuf = Buffer.alloc(maxLen)
  const bBuf = Buffer.alloc(maxLen)
  aBuf.write(a)
  bBuf.write(b)
  // Still compare lengths for correctness, but only after the constant-time compare.
  const sameContent = cryptoTimingSafeEqual(aBuf, bBuf)
  return sameContent && a.length === b.length
}