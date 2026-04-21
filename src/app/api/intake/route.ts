import { NextRequest, NextResponse } from "next/server"
import { processIntake, type IntakePayload } from "@/engine/intake/process-lead"
import { getConfig, getClientIdFromSession } from "@/lib/config"
import { requireSessionOrBearer } from "@/lib/api-auth"
import { rateLimit } from "@/lib/rate-limit"
import { createHash } from "crypto"

const MAX_BODY_BYTES = 100_000

// 60 leads per minute burst, 30/min sustained. Generous enough for normal
// use, tight enough to cap a compromised token's damage.
const RATE_LIMIT_CAPACITY = 60
const RATE_LIMIT_REFILL_PER_MIN = 30

export async function POST(request: NextRequest) {
  const auth = await requireSessionOrBearer(request)
  if (!auth.ok) return auth.response

  // Identify the caller for rate limiting.
  const rateKey = getRateLimitKey(request, auth)
  const rl = rateLimit({
    key: `intake:${rateKey}`,
    capacity: RATE_LIMIT_CAPACITY,
    refillPerMinute: RATE_LIMIT_REFILL_PER_MIN,
  })

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limit_exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.resetInSeconds),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  try {
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10)
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: `payload_too_large` },
        { status: 413 }
      )
    }

    const body = (await request.json()) as IntakePayload

    if (!body.sourceId) {
      return NextResponse.json(
        { error: "sourceId is required" },
        { status: 400 }
      )
    }

    if (!body.email && !body.phone && !body.initialMessage) {
      return NextResponse.json(
        { error: "At least one of email, phone, or initialMessage is required" },
        { status: 400 }
      )
    }

    // For session auth, derive clientId from JWT. For bearer auth, require it in the body.
    let clientId: string
    if (auth.method === "session") {
      clientId = await getClientIdFromSession()
    } else {
      if (!body.clientId) {
        return NextResponse.json(
          { error: "clientId is required for bearer auth" },
          { status: 400 }
        )
      }
      clientId = body.clientId
    }

    const config = await getConfig(clientId)
    const result = await processIntake({ payload: body, config })

    if (result.error && !result.leadId) {
      console.error("Intake failed", { error: result.error })
      return NextResponse.json({ error: "intake_failed" }, { status: 500 })
    }

    return NextResponse.json({
      leadId: result.leadId,
      isNew: result.isNew,
      decisionQueued: result.decisionQueued,
      ...(result.error && { warning: result.error }),
    })
  } catch (e) {
    console.error("Intake route exception", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}

function getRateLimitKey(
  request: NextRequest,
  auth: { method: "session" | "bearer"; userId?: string }
): string {
  if (auth.method === "session" && auth.userId) {
    return `session:${auth.userId}`
  }

  // For bearer auth, key on a hash of the bearer token so we don't log it.
  const header = request.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  const hashed = createHash("sha256").update(token).digest("hex").slice(0, 16)
  return `bearer:${hashed}`
}