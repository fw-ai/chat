"use client"

import type { Message } from "@/types/chat"
import { Button } from "@/components/ui/button"
import { Copy, User, Bot, AlertCircle } from "lucide-react"
import { useState } from "react"

interface MessageProps {
  message: Message
  showModel?: boolean
}

export function MessageComponent({ message, showModel = false }: MessageProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy text:", error)
    }
  }

  const isUser = message.role === "user"

  return (
    <div className={`flex gap-3 p-4 ${isUser ? "bg-muted/30" : "bg-background"}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{isUser ? "You" : "Assistant"}</span>
          {showModel && message.model && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{message.model}</span>
          )}
          <span className="text-xs text-muted-foreground">{message.timestamp.toLocaleTimeString()}</span>
        </div>

        <div className="prose prose-sm max-w-none">
          {message.error ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle size={16} />
              <span>{message.error}</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">
              {message.content}
              {message.isStreaming && <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />}
            </div>
          )}
        </div>

        {!isUser && !message.error && message.content && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-8 px-2">
              <Copy size={14} />
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
