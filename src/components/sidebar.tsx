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
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
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

  // Get user initials from email
  const initials = userEmail
    ? userEmail.split("@")[0].slice(0, 2).toUpperCase()
    : "?"

  return (
    <aside
      className={`
        flex flex-col border-r border-indigo-500/[0.08] dark:border-indigo-500/[0.08] bg-sidebar shrink-0 transition-all duration-200
        ${collapsed ? "w-14" : "w-[220px]"}
      `}
    >
      {/* Header */}
      <div className={`flex items-center px-3 pt-5 pb-4 ${collapsed ? "justify-center" : "justify-between"}`}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
            L
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                L
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Lead Engine</div>
                <div className="text-[11px] text-muted-foreground">OperateAI</div>
              </div>
            </div>
            <NotificationBell />
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2 mt-2">
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
                  ? "bg-indigo-500/10 border border-indigo-500/[0.12] text-foreground dark:text-foreground text-indigo-600 dark:text-foreground"
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

      {/* Footer */}
      <div className={`flex flex-col gap-3 px-2 pb-4 ${collapsed ? "items-center" : ""}`}>
        {/* Collapsed: show notification bell here since header is icon-only */}
        {collapsed && <NotificationBell />}

        {/* User info */}
        <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : "px-1"}`}>
          <div className="w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-[10px] font-semibold text-indigo-400 shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="truncate text-xs text-muted-foreground">{userEmail}</div>
          )}
        </div>

        {/* Theme toggle */}
        <div className={collapsed ? "" : "px-1"}>
          <ThemeToggle compact={collapsed} />
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          title={collapsed ? "Sign out" : undefined}
          className={`
            rounded-lg border border-border text-muted-foreground text-xs cursor-pointer transition-colors
            hover:text-foreground hover:border-indigo-500/20
            ${collapsed ? "p-2" : "px-3 py-1.5 text-left"}
          `}
        >
          {collapsed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          ) : (
            "Sign out"
          )}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg border border-border p-1.5 text-muted-foreground cursor-pointer transition-colors hover:text-foreground hover:border-indigo-500/20 self-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
          >
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
