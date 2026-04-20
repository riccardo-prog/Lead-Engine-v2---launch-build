import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

const ALGO = "aes-256-gcm"

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.INTERNAL_API_SECRET
  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_KEY (or INTERNAL_API_SECRET) must be set for token encryption")
  }
  return createHash("sha256").update(secret).digest()
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`
}

export function decryptToken(payload: string): string {
  const parts = payload.split(".")
  if (parts.length !== 3) {
    // No plaintext fallback. If a token isn't in the expected format,
    // it's either corrupt or was written with a different scheme. Fail loud.
    throw new Error("Invalid encrypted token format — reconnect the integration")
  }

  const [ivB64, authTagB64, ciphertextB64] = parts
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")
  const ciphertext = Buffer.from(ciphertextB64, "base64")

  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString("utf8")
}