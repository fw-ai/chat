"use client"

import type { Message, ChatModel } from "@/types/chat"
import { Button } from "@/components/ui/button"
import { Copy, AlertCircle, Wrench } from "lucide-react"
import { useState } from "react"
import Image from "next/image"
import { ThinkingDisplay } from "@/components/thinking-display"
import { MarkdownRenderer } from "@/components/markdown-renderer"

const FIREWORKS_APP_URL = process.env.NEXT_PUBLIC_FIREWORKS_APP_URL

interface MessageProps {
  message: Message
  showModel?: boolean
  model?: ChatModel // Add the full model object
}

export function MessageComponent({ message, showModel = false, model }: MessageProps) {
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

  if (isUser) {
    // User messages on the right side without icon/circle
    return (
      <div className="flex justify-end p-4 bg-muted/30">
        <div className="max-w-[80%] space-y-2">
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">{message.timestamp.toLocaleTimeString()}</span>
          </div>
          <div className="prose prose-sm max-w-none bg-fireworks-purple text-white p-3 rounded-lg">
            <div className="whitespace-pre-wrap text-white">
              {message.content}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Bot messages on the left side with fireworks icon
  return (
    <div className="flex gap-3 p-4 bg-background">
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
        {model && (model as any).logomark ? (
          <img
            src={`${FIREWORKS_APP_URL}${(model as any).logomark}`}
            alt={`${model.name} logo`}
            className="w-4 h-4 object-contain"
          />
        ) : (
          <Image
            src="/favicon-16x16.png"
            alt="Fireworks AI"
            width={16}
            height={16}
            className="w-4 h-4"
          />
        )}
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          {showModel && model && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{model.name}</span>
          )}
          <span className="text-xs text-muted-foreground">{message.timestamp.toLocaleTimeString()}</span>
        </div>

        {message.thinking && (
          <ThinkingDisplay
            thinking={message.thinking}
            thinkingTime={message.thinkingTime}
            isStreaming={message.isStreaming}
          />
        )}

        {/* Function calls display */}
        {(message.function_calls || message.tool_calls) && (
          <div className="space-y-2">
            {(message.function_calls || message.tool_calls)?.map((toolCall, index) => (
              <div key={index} className="bg-muted/50 border border-muted-foreground/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench size={14} className="text-muted-foreground" />
                  <span className="text-sm font-medium">Function Call: {toolCall.name || toolCall.function?.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <div className="font-medium mb-1">Arguments:</div>
                  <pre className="bg-muted/30 p-2 rounded text-xs overflow-auto max-h-48 whitespace-pre-wrap break-words">
                    {JSON.stringify(toolCall.arguments || toolCall.function?.arguments, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="min-w-0 max-w-full" style={{ maxWidth: '100%', minWidth: '0', width: '100%' }}>
          {message.error ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle size={16} />
              <span>{message.error}</span>
            </div>
          ) : (
            <div className="relative min-w-0" style={{ maxWidth: '100%', minWidth: '0', width: '100%' }}>
              <MarkdownRenderer content={message.content} className="max-w-full overflow-hidden" />
              {message.isStreaming && <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />}
            </div>
          )}
        </div>

        {!message.error && message.content && (
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
