import type { IntakePayload } from "./process-lead"

/**
 * Parse Meta Lead Ad form fields into an IntakePayload.
 *
 * Lead Ad forms have configurable field names. Common fields:
 * - full_name, first_name, last_name
 * - email
 * - phone_number, phone
 * - city, state, zip_code
 *
 * Anything not recognized goes into customFields.
 */
export function parseLeadAdFields(
  fields: Record<string, string>
): Omit<IntakePayload, "sourceId"> {
  const knownFields = new Set([
    "full_name", "first_name", "last_name",
    "email", "phone_number", "phone",
  ])

  let firstName = fields.first_name || null
  let lastName = fields.last_name || null

  if (!firstName && !lastName && fields.full_name) {
    const parts = fields.full_name.trim().split(/\s+/)
    firstName = parts[0] || null
    lastName = parts.slice(1).join(" ") || null
  }

  const email = fields.email?.toLowerCase() || undefined
  const phone = fields.phone_number || fields.phone || undefined

  const customFields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!knownFields.has(key) && value) {
      customFields[key] = value
    }
  }

  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email,
    phone,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
  }
}
