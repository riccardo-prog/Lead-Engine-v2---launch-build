"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { ClientConfig } from "@/config/schema"

type Connection = {
  id: string
  provider: string
  account_email: string | null
  metadata: Record<string, string | null> | null
  connected_at: string
  updated_at: string
}

const FRIENDLY_ERRORS: Record<string, string> = {
  microsoft_rejected: "Microsoft cancelled the connection. Try again.",
  missing_code: "Microsoft didn't return an authorization code. Try again.",
  missing_state: "Missing security token. Please start the connection again.",
  invalid_state: "Security token didn't match. Please start the connection again.",
  expired_state: "The connection request expired. Please try again.",
  token_exchange_failed: "Couldn't exchange the Microsoft code for a token. Try again.",
  user_fetch_failed: "Connected, but couldn't read your account info from Microsoft.",
  save_failed: "Connected to Microsoft, but saving the connection failed.",
  server_misconfigured: "Server configuration is missing. Contact support.",
  google_rejected: "Google cancelled the connection. Try again.",
  meta_rejected: "Meta cancelled the connection. Try again.",
  meta_missing_code: "Meta didn't return an authorization code. Try again.",
  meta_token_exchange_failed: "Couldn't exchange the Meta code for a token. Try again.",
  meta_no_pages: "No Facebook Pages found on this account. You need at least one Page.",
  meta_page_token_failed: "Connected, but couldn't get a Page access token. Try again.",
  meta_save_failed: "Connected to Meta, but saving the connection failed.",
  meta_subscribe_failed: "Connected, but couldn't subscribe to webhooks. Try reconnecting.",
  meta_no_instagram: "Connected, but no Instagram Business Account is linked to your Page. Instagram DMs won't work until you link one.",
}

function friendlyError(code: string | undefined): string | null {
  if (!code) return null
  return FRIENDLY_ERRORS[code] || `Something went wrong (${code}).`
}

type CalcomStatus = {
  configured: boolean
  bookingUrl: string | null
  eventTypeId: string | null
}

export function SettingsView({
  config,
  connections,
  justConnected,
  errorMessage,
  calcom,
  showMeta = true,
  emailProvider = "gmail",
}: {
  config: ClientConfig
  connections: Connection[]
  justConnected?: string
  errorMessage?: string
  calcom?: CalcomStatus
  showMeta?: boolean
  emailProvider?: "gmail" | "outlook"
}) {
  const router = useRouter()

  const microsoftConnection = connections.find((c) => c.provider === "microsoft")
  const googleConnection = connections.find((c) => c.provider === "google")
  const metaConnection = connections.find((c) => c.provider === "meta")
  const displayError = friendlyError(errorMessage)

  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  async function handleDisconnect(connectionId: string) {
    setDisconnectError(null)
    try {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" })
      if (!res.ok) {
        setDisconnectError("Failed to disconnect. Please try again.")
        return
      }
      router.refresh()
    } catch {
      setDisconnectError("Network error. Please try again.")
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-[720px]">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Manage integrations, persona, and client configuration.
        </p>
      </div>

      {justConnected && (
        <div className="px-4 py-3 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 rounded-lg text-[13px]">
          {justConnected === "microsoft" ? "Microsoft account connected."
            : justConnected === "google" ? "Gmail account connected."
            : `${justConnected} connected.`}
        </div>
      )}

      {disconnectError && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-lg text-[13px]">
          {disconnectError}
        </div>
      )}

      {displayError && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-lg text-[13px]">
          {displayError}
        </div>
      )}

      {/* Integrations */}
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
        <div>
          <div className="text-base font-medium">Integrations</div>
          <div className="text-[13px] text-muted-foreground mt-1">
            Connect the services your business uses. The AI uses these to send emails, read inbound messages, and book meetings.
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {emailProvider === "outlook" && (
            <IntegrationRow
              name="Microsoft Outlook"
              description="Send and read emails through your Outlook account"
              connected={!!microsoftConnection}
              accountLabel={microsoftConnection?.account_email || undefined}
              onConnect={() => { window.location.href = "/api/auth/microsoft/start" }}
              onDisconnect={microsoftConnection ? () => handleDisconnect(microsoftConnection.id) : undefined}
            />
          )}
          {emailProvider === "gmail" && (
            <IntegrationRow
              name="Google Gmail"
              description="Send and read emails through your Gmail account"
              connected={!!googleConnection}
              accountLabel={googleConnection?.account_email || undefined}
              onConnect={() => { window.location.href = "/api/auth/google/start" }}
              onDisconnect={googleConnection ? () => handleDisconnect(googleConnection.id) : undefined}
            />
          )}
          {showMeta && (
            <IntegrationRow
              name="Meta (Facebook + Instagram)"
              description="Receive leads and messages from Meta ads and DMs"
              connected={!!metaConnection}
              accountLabel={metaConnection?.metadata?.page_name || metaConnection?.account_email || undefined}
              onConnect={() => { window.location.href = "/api/auth/meta/start" }}
              onDisconnect={metaConnection ? () => handleDisconnect(metaConnection.id) : undefined}
            />
          )}
          {calcom && (
            <IntegrationRow
              name="Cal.com"
              description="Book meetings directly from conversations"
              connected={calcom.configured}
              accountLabel={calcom.bookingUrl || undefined}
            />
          )}
        </div>
      </div>

      {/* Editable config */}
      <ConfigEditor config={config} />

      {/* Read-only info */}
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
        <div>
          <div className="text-base font-medium">System</div>
          <div className="text-[13px] text-muted-foreground mt-1">
            These settings are managed in the config file.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <InfoRow label="Industry" value={config.industry} />
          <InfoRow label="Jurisdiction" value={config.jurisdiction} />
        </div>
      </div>
    </div>
  )
}

function IntegrationRow({
  name, description, connected, accountLabel, comingSoon, onConnect, onDisconnect,
}: {
  name: string
  description: string
  connected: boolean
  accountLabel?: string
  comingSoon?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
}) {
  return (
    <div className="px-4 py-4 bg-background border border-border rounded-lg flex justify-between items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">{name}</div>
          {connected && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
              <span className="text-[11px] text-green-400">Connected</span>
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {connected && accountLabel ? `Connected as ${accountLabel}` : description}
        </div>
      </div>
      {comingSoon ? (
        <div className="text-xs text-muted-foreground">Configure via env</div>
      ) : connected ? (
        <button
          onClick={onDisconnect}
          className="px-3.5 py-2 rounded-md bg-transparent text-foreground border border-border text-[13px] font-medium cursor-pointer hover:border-red-400/20 hover:text-red-400 transition-colors"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="px-3.5 py-2 rounded-md bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-none text-[13px] font-medium cursor-pointer hover:opacity-90 transition-opacity"
        >
          Connect
        </button>
      )}
    </div>
  )
}

const TONE_OPTIONS = ["professional", "friendly", "casual", "formal"] as const

function ConfigEditor({ config }: { config: ClientConfig }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [businessName, setBusinessName] = useState(config.businessName)
  const [personaName, setPersonaName] = useState(config.aiPersona.name)
  const [tone, setTone] = useState(config.aiPersona.tone)
  const [voice, setVoice] = useState(config.aiPersona.voice)
  const [doNotSay, setDoNotSay] = useState(config.aiPersona.doNotSay.join(", "))
  const [alwaysSay, setAlwaysSay] = useState(config.aiPersona.alwaysSay.join(", "))
  const [approvalRequired, setApprovalRequired] = useState(config.humanApprovalRequired)

  async function handleSave() {
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          aiPersonaName: personaName,
          aiPersonaTone: tone,
          aiPersonaVoice: voice,
          aiPersonaDoNotSay: doNotSay,
          aiPersonaAlwaysSay: alwaysSay,
          humanApprovalRequired: approvalRequired,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveMessage({ type: "error", text: data.error || "Failed to save" })
        return
      }
      setSaveMessage({ type: "success", text: "Settings saved." })
      router.refresh()
    } catch {
      setSaveMessage({ type: "error", text: "Network error. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
      <div>
        <div className="text-base font-medium">AI & Business</div>
        <div className="text-[13px] text-muted-foreground mt-1">
          Configure your business identity and how the AI communicates with leads.
        </div>
      </div>

      {saveMessage && (
        <div className={`px-4 py-3 rounded-lg text-[13px] ${
          saveMessage.type === "success"
            ? "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400"
            : "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400"
        }`}>
          {saveMessage.text}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <FieldRow label="Business name">
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-500/30 transition-colors"
          />
        </FieldRow>

        <FieldRow label="AI assistant name">
          <input
            type="text"
            value={personaName}
            onChange={(e) => setPersonaName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-500/30 transition-colors"
          />
        </FieldRow>

        <FieldRow label="Tone">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as typeof tone)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-500/30 transition-colors cursor-pointer"
          >
            {TONE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Voice" hint="Describe the AI's personality and communication style">
          <textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-500/30 transition-colors resize-y"
          />
        </FieldRow>

        <FieldRow label="Never say" hint="Comma-separated words or phrases the AI should avoid">
          <input
            type="text"
            value={doNotSay}
            onChange={(e) => setDoNotSay(e.target.value)}
            placeholder="e.g. guaranteed, best price, act now"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-500/30 transition-colors"
          />
        </FieldRow>

        <FieldRow label="Always include" hint="Comma-separated phrases the AI should always use">
          <input
            type="text"
            value={alwaysSay}
            onChange={(e) => setAlwaysSay(e.target.value)}
            placeholder="e.g. Happy to help, Let me check with the team"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-500/30 transition-colors"
          />
        </FieldRow>

        <FieldRow label="Approval mode">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setApprovalRequired(!approvalRequired)}
              className={`
                relative w-11 h-6 rounded-full cursor-pointer transition-colors
                ${approvalRequired
                  ? "bg-gradient-to-r from-indigo-500 to-cyan-500"
                  : "bg-border"
                }
              `}
            >
              <span className={`
                absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                ${approvalRequired ? "left-[22px]" : "left-0.5"}
              `} />
            </button>
            <span className="text-sm text-muted-foreground">
              {approvalRequired ? "Human approval required" : "Autonomous — AI sends without approval"}
            </span>
          </div>
        </FieldRow>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`
            px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-sm font-medium transition-opacity
            ${saving ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}
          `}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  )
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-[13px]">{value}</div>
    </div>
  )
}
