"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useNotifications } from "./use-notifications"
import type { Notification } from "@/types/database"

function notificationMeta(type: string): { icon: string; color: string } {
  switch (type) {
    case "message_sent": return { icon: "✓", color: "text-green-400" }
    case "message_failed": return { icon: "✕", color: "text-red-400" }
    case "ai_failed": return { icon: "⚠", color: "text-amber-400" }
    case "action_pending": return { icon: "●", color: "text-indigo-400" }
    case "booking_confirmed": return { icon: "✓", color: "text-green-400" }
    case "booking_cancelled": return { icon: "✕", color: "text-red-400" }
    default: return { icon: "●", color: "text-muted-foreground" }
  }
}

export function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead, dismiss } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick)
      return () => document.removeEventListener("mousedown", handleClick)
    }
  }, [open])

  function handleItemClick(n: Notification) {
    if (!n.read_at) markRead(n.id)
    setOpen(false)

    if (n.type === "action_pending") {
      router.push("/inbox")
    } else if (n.type === "booking_confirmed" || n.type === "booking_cancelled") {
      if (n.lead_id) router.push(`/pipeline/${n.lead_id}`)
    } else if (n.lead_id) {
      router.push(`/pipeline/${n.lead_id}`)
    }
  }

  function handleDismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    dismiss(id)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer flex items-center justify-center transition-colors"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-[10px] text-white font-semibold flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] left-0 w-[340px] max-h-[420px] bg-card border border-border rounded-xl shadow-lg overflow-hidden flex flex-col z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex justify-between items-center">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="bg-transparent border-none text-indigo-400 text-xs cursor-pointer px-1 py-0.5 hover:text-indigo-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <div className="py-8 px-4 text-center text-muted-foreground text-[13px]">
                No notifications yet.
              </div>
            ) : (
              items.map((n) => {
                const meta = notificationMeta(n.type)
                return (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`
                      w-full text-left px-4 py-3 border-b border-border cursor-pointer flex flex-col gap-0.5 transition-colors
                      ${n.read_at ? "bg-transparent" : "bg-indigo-500/[0.04]"}
                    `}
                  >
                    <div className="flex items-center gap-1.5">
                      {!n.read_at && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      )}
                      <span className={`text-sm shrink-0 ${meta.color}`}>{meta.icon}</span>
                      <span className={`text-[13px] ${n.read_at ? "font-normal" : "font-medium"} text-foreground truncate flex-1`}>
                        {n.title}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleDismiss(e, n.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleDismiss(e as unknown as React.MouseEvent, n.id) }}
                        aria-label="Dismiss notification"
                        className="shrink-0 w-[18px] h-[18px] flex items-center justify-center rounded text-muted-foreground cursor-pointer text-sm leading-none hover:text-foreground transition-colors"
                      >
                        &times;
                      </span>
                    </div>
                    {n.body && (
                      <span className={`text-xs text-muted-foreground truncate ${n.read_at ? "" : "pl-3"}`}>
                        {n.body.length > 80 ? n.body.slice(0, 80) + "..." : n.body}
                      </span>
                    )}
                    <span className={`text-[11px] text-muted-foreground ${n.read_at ? "" : "pl-3"}`}>
                      {timeAgo(n.created_at)}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
