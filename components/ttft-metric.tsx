"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock } from "lucide-react"
import { memo } from "react"

interface TtftMetricProps {
  ttft: number
  label: string
  isLoading?: boolean
  className?: string
}

export const TtftMetric = memo(function TtftMetric({ ttft, label, isLoading = false, className }: TtftMetricProps) {
  const formatTtft = (value: number) => {
    if (value === 0) return "0"
    return value.toFixed(0) + "ms"
  }

  // Add subtle visual feedback for live updates
  const isLiveUpdating = isLoading && ttft > 0

  return (
    <Card className={`bg-muted/30 ${className} ${isLiveUpdating ? 'ring-1 ring-[#6b2aff]/20' : ''}`}>
      <CardHeader className="pb-0 px-2 pt-1.5">
        <CardTitle className="flex items-center gap-0.5 text-[8px] font-medium">
          <Clock className="h-2 w-2" />
          TTFT
          {isLiveUpdating && <div className="w-1 h-1 bg-[#6b2aff] rounded-full animate-pulse ml-1" />}
        </CardTitle>
        <div className="text-[7px] text-muted-foreground">
          Time to first token
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-1.5 px-2">
        <div className={`text-lg font-bold transition-colors duration-200 ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
          {isLoading && ttft === 0 ? (
            <div className="animate-pulse">--</div>
          ) : (
            formatTtft(ttft)
          )}
        </div>
      </CardContent>
    </Card>
  )
})
