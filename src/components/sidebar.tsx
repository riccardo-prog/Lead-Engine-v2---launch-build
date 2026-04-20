"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { ThemeToggle } from "@/components/theme-toggle"

const navItems = [
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
]

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)

  // Read collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("lead-engine-sidebar")
    if (stored === "collapsed") setCollapsed(true)
  }, [])

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem("lead-engine-sidebar", collapsed ? "collapsed" : "expanded")
  }, [collapsed])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const initials = userEmail
    ? userEmail.split("@")[0].slice(0, 2).toUpperCase()
    : "?"

  return (
    <aside
      className={`
        flex flex-col border-r border-indigo-500/[0.08] bg-sidebar shrink-0 transition-all duration-200
        ${collapsed ? "w-14" : "w-[220px]"}
      `}
    >
      {/* Header — logo + collapse toggle */}
      <div className={`flex items-center px-3 pt-4 pb-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        <div className={`flex items-center ${collapsed ? "" : "gap-2.5"}`}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            L
          </div>
          {!collapsed && (
            <div>
              <div className="text-sm font-semibold text-foreground">Lead Engine</div>
              <div className="text-[11px] text-muted-foreground">OperateAI</div>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            aria-label="Collapse sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mb-1 p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          aria-label="Expand sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>
      )}

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2 mt-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors no-underline
                ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"}
                ${active
                  ? "bg-indigo-500/10 border border-indigo-500/[0.12] text-indigo-600 dark:text-foreground"
                  : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-indigo-500/[0.04]"
                }
              `}
            >
              <span className={active ? "text-indigo-500" : ""}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer — compact group */}
      <div className={`flex flex-col gap-2 px-2 pb-3 ${collapsed ? "items-center" : ""}`}>
        {/* Notification bell (collapsed only — in expanded it's near the nav) */}
        {collapsed && <NotificationBell />}

        {/* User row */}
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5 px-1"}`}>
          <div className="w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
              <NotificationBell />
            </div>
          )}
        </div>

        {/* Theme toggle + sign out row */}
        <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-2 px-1"}`}>
          <ThemeToggle compact={collapsed} />
          <button
            onClick={handleSignOut}
            title={collapsed ? "Sign out" : undefined}
            className={`
              rounded-md border border-border text-muted-foreground text-[11px] cursor-pointer transition-colors
              hover:text-foreground hover:border-indigo-500/20
              ${collapsed ? "p-1.5" : "px-2 py-1"}
            `}
          >
            {collapsed ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            ) : (
              "Sign out"
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
