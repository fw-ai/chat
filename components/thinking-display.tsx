"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, Clock } from "lucide-react"

interface ThinkingDisplayProps {
  thinking: string
  thinkingTime?: number
  isStreaming?: boolean
}

export function ThinkingDisplay({ thinking, thinkingTime, isStreaming }: ThinkingDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const formatTime = (seconds?: number, isComplete?: boolean) => {
    if (!seconds) return ""
    if (isComplete === false) return ""
    return `thinking time: ${seconds.toFixed(1)}s`
  }

  // If streaming and we have thinking content, it's likely still in progress
  const isThinkingComplete = !isStreaming

  return (
    <div className="mb-2 border border-muted rounded-lg bg-muted/20">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-start gap-2 h-8 px-3 text-xs text-muted-foreground hover:bg-muted/40"
      >
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Clock size={12} />
        <span>{isThinkingComplete ? formatTime(thinkingTime, isThinkingComplete) : "Pondering..."}</span>
        {!isThinkingComplete && (
          <div className="inline-block ml-1">
            <div className="flex space-x-1">
              <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
              <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
              <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
            </div>
          </div>
        )}
      </Button>
      
      {isExpanded && (
        <div className="px-3 pb-3 pt-1">
          <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/30 p-2 rounded border-l-2 border-muted-foreground/30">
            {thinking}
            {!isThinkingComplete && (
              <span className="inline-block w-2 h-3 bg-muted-foreground ml-1 animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}