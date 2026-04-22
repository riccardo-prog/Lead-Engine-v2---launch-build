"use client"

import { useState, useRef } from "react"

export function CSVUpload({
  onUpload,
  disabled,
}: {
  onUpload: (file: File) => void
  disabled?: boolean
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith(".csv")) {
      onUpload(file)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${dragOver ? "border-indigo-500 bg-indigo-500/5" : "border-border hover:border-indigo-500/50"}
        ${disabled ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleChange}
        className="hidden"
      />
      <div className="text-sm text-muted-foreground">
        Drop a CSV file here or click to browse
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        Required: email. Optional: first_name, last_name, company, title, linkedin_url, website_url, company_description
      </div>
    </div>
  )
}
