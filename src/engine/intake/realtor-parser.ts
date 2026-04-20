export type RealtorLead = {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  propertyAddress: string | null
  listingNumber: string | null
  rawMessage: string | null
}

export function parseRealtorEmail({
  subject,
  body,
}: {
  subject: string
  body: string
}): RealtorLead | null {
  const nameMatch = body.match(/Client\s+Name:\s*([^\n\r]+)/i)
  let firstName: string | null = null
  let lastName: string | null = null
  if (nameMatch) {
    const fullName = nameMatch[1].trim()
    const parts = fullName.split(/\s+/)
    firstName = parts[0] || null
    lastName = parts.slice(1).join(" ") || null
  }

  const phoneMatch = body.match(/Phone:\s*([^\n\r]+)/i)
  const phone = phoneMatch ? normalizePhone(phoneMatch[1].trim()) : null

  const emailMatch = body.match(/Email:\s*([^\s\n\r]+@[^\s\n\r]+)/i)
  const email = emailMatch ? emailMatch[1].trim() : null

  const listingMatch = body.match(/listing\s*#?(\d{5,})/i)
  const listingNumber = listingMatch ? listingMatch[1] : null

  let propertyAddress: string | null = null

  const parenMatch = body.match(/listing[^(]*\(([^)]+)\)/i)
  if (parenMatch) {
    propertyAddress = parenMatch[1].trim()
  } else {
    const subjectMatch = subject.match(/New Lead:\s*(.+?)\s*-\s*/i)
    if (subjectMatch) {
      propertyAddress = subjectMatch[1].trim()
    }
  }

  const messageMatch = body.match(/Message:\s*([\s\S]+?)(?:\n\s*\n|Please click|$)/i)
  const rawMessage = messageMatch ? messageMatch[1].trim() : null

  if (!firstName && !email && !phone) {
    return null
  }

  return {
    firstName,
    lastName,
    email,
    phone,
    propertyAddress,
    listingNumber,
    rawMessage,
  }
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return raw
}

export function isRealtorLeadEmail({
  from,
  subject,
}: {
  from: string
  subject: string
}): boolean {
  const fromLower = from.toLowerCase().trim()
  const subjectLower = subject.toLowerCase()

  // Strict domain-suffix check — prevents attacker@notarealtor.ca from slipping through.
  // Sender must be from @realtor.ca or @noreply.realtor.ca (or similar subdomain).
  const fromMatches =
    fromLower.endsWith("@realtor.ca") ||
    fromLower.endsWith(".realtor.ca")

  const subjectMatches = subjectLower.includes("new lead") || subjectLower.includes("realtor.ca")

  return fromMatches && subjectMatches
}