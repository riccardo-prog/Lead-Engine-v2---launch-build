"use client"

import { useState, useEffect, useCallback } from "react"
import type { Notification } from "@/types/database"

const POLL_INTERVAL_MS = 30_000

export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications")
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items || [])
      setUnreadCount(data.unreadCount || 0)
    } catch {
      // Silently swallow — polling will retry.
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  const markRead = useCallback(async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" })
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications/read-all", { method: "POST" })
    setItems((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
    )
    setUnreadCount(0)
  }, [])

  const dismiss = useCallback(async (id: string) => {
    const item = items.find((n) => n.id === id)
    await fetch(`/api/notifications/${id}`, { method: "DELETE" })
    setItems((prev) => prev.filter((n) => n.id !== id))
    if (item && !item.read_at) {
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
  }, [items])

  return { items, unreadCount, markRead, markAllRead, dismiss, refresh }
}
