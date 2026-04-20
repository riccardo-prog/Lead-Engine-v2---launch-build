"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — don't render until mounted
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className={compact ? "w-8 h-5" : "w-10 h-[22px]"} />

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`
        relative rounded-full border cursor-pointer transition-colors
        ${compact ? "w-8 h-5" : "w-10 h-[22px]"}
        ${isDark
          ? "bg-indigo-500/20 border-indigo-500/20"
          : "bg-indigo-500/12 border-indigo-500/15"
        }
      `}
    >
      <span
        className={`
          absolute top-[2px] flex items-center justify-center rounded-full text-[9px] transition-all
          w-4 h-4
          ${isDark
            ? "right-[2px] left-auto bg-indigo-500 text-white shadow-[0_0_8px_rgba(99,102,241,0.4)]"
            : "left-[2px] right-auto bg-white text-gray-600 border border-black/8 shadow-sm"
          }
        `}
      >
        {isDark ? "☽" : "☀"}
      </span>
    </button>
  )
}
