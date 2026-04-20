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

export function SettingsView({
  config,
  connections,
  justConnected,
  errorMessage,
}: {
  config: ClientConfig
  connections: Connection[]
  justConnected?: string
  errorMessage?: string
}) {
  const router = useRouter()

  const microsoftConnection = connections.find((c) => c.provider === "microsoft")
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
          {justConnected === "microsoft" ? "Microsoft account connected." : `${justConnected} connected.`}
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
          <IntegrationRow
            name="Microsoft Outlook"
            description="Send and read emails through your Outlook account"
            connected={!!microsoftConnection}
            accountLabel={microsoftConnection?.account_email || undefined}
            onConnect={() => { window.location.href = "/api/auth/microsoft/start" }}
            onDisconnect={microsoftConnection ? () => handleDisconnect(microsoftConnection.id) : undefined}
          />
          <IntegrationRow
            name="Meta (Facebook + Instagram)"
            description="Receive leads and messages from Meta ads and DMs"
            connected={!!metaConnection}
            accountLabel={metaConnection?.metadata?.page_name || metaConnection?.account_email || undefined}
            onConnect={() => { window.location.href = "/api/auth/meta/start" }}
            onDisconnect={metaConnection ? () => handleDisconnect(metaConnection.id) : undefined}
          />
          <IntegrationRow
            name="Cal.com"
            description="Book meetings directly from conversations"
            connected={false}
            comingSoon
          />
        </div>
      </div>

      {/* Client config */}
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
        <div>
          <div className="text-base font-medium">Client</div>
          <div className="text-[13px] text-muted-foreground mt-1">
            Read-only for now. Edit in the config file.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <InfoRow label="Business" value={config.businessName} />
          <InfoRow label="Industry" value={config.industry} />
          <InfoRow label="AI persona" value={config.aiPersona.name} />
          <InfoRow label="Tone" value={config.aiPersona.tone} />
          <InfoRow label="Jurisdiction" value={config.jurisdiction} />
          <InfoRow label="Approval mode" value={config.humanApprovalRequired ? "Human approval required" : "Autonomous"} />
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
