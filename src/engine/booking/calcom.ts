const CAL_BASE_URL = "https://api.cal.com/v2"
const CAL_API_VERSION = "2024-08-13"

type CalHeaders = {
  Authorization: string
  "cal-api-version": string
  "Content-Type": string
}

function getHeaders(apiKey: string): CalHeaders {
  return {
    Authorization: `Bearer ${apiKey}`,
    "cal-api-version": CAL_API_VERSION,
    "Content-Type": "application/json",
  }
}

// --- Check availability ---

type CheckAvailabilityParams = {
  startTime: string // ISO 8601
  eventTypeId: number
  apiKey: string
}

type AvailabilityResult = {
  available: boolean
}

export async function checkAvailability({
  startTime,
  eventTypeId,
  apiKey,
}: CheckAvailabilityParams): Promise<AvailabilityResult> {
  const start = new Date(startTime)
  // Check a 1-day window around the requested time
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const params = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  })

  const res = await fetch(`${CAL_BASE_URL}/slots?${params}`, {
    method: "GET",
    headers: getHeaders(apiKey),
  })

  if (!res.ok) {
    console.error("Cal.com availability check failed", {
      status: res.status,
      body: await res.text(),
    })
    return { available: false }
  }

  const data = await res.json()

  // Cal.com v2 returns { data: { slots: { "YYYY-MM-DD": ["ISO_TIME", ...] } } }
  const slots: Record<string, string[]> = data?.data?.slots || {}
  const requestedMs = start.getTime()

  for (const daySlots of Object.values(slots)) {
    for (const slot of daySlots) {
      // Match within a 1-minute window to account for rounding
      if (Math.abs(new Date(slot).getTime() - requestedMs) < 60_000) {
        return { available: true }
      }
    }
  }

  return { available: false }
}

// --- Create booking ---

type CreateBookingParams = {
  name: string
  email: string
  timeZone: string
  startTime: string // ISO 8601
  eventTypeId: number
  apiKey: string
}

type BookingResult = {
  success: boolean
  bookingUid?: string
  meetingUrl?: string
  startTime?: string
  endTime?: string
  error?: string
}

export async function createBooking({
  name,
  email,
  timeZone,
  startTime,
  eventTypeId,
  apiKey,
}: CreateBookingParams): Promise<BookingResult> {
  const res = await fetch(`${CAL_BASE_URL}/bookings`, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify({
      eventTypeId,
      start: startTime,
      attendee: {
        name,
        email,
        timeZone,
        language: "en",
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error("Cal.com create booking failed", { status: res.status, body: text })
    return { success: false, error: `Cal.com API error: ${res.status}` }
  }

  const data = await res.json()
  const booking = data?.data

  return {
    success: true,
    bookingUid: booking?.uid,
    meetingUrl: booking?.meetingUrl,
    startTime: booking?.startTime,
    endTime: booking?.endTime,
  }
}

// --- Cancel booking ---

type CancelBookingParams = {
  bookingUid: string
  apiKey: string
}

type CancelResult = {
  success: boolean
  error?: string
}

export async function cancelBooking({
  bookingUid,
  apiKey,
}: CancelBookingParams): Promise<CancelResult> {
  const res = await fetch(`${CAL_BASE_URL}/bookings/${bookingUid}/cancel`, {
    method: "POST",
    headers: getHeaders(apiKey),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error("Cal.com cancel booking failed", { status: res.status, body: text })
    return { success: false, error: `Cal.com API error: ${res.status}` }
  }

  return { success: true }
}
