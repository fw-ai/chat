"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Timer } from "lucide-react"
import { memo } from "react"

interface TotalTimeMetricProps {
  totalTime: number
  label: string
  isLoading?: boolean
  className?: string
}

export const TotalTimeMetric = memo(function TotalTimeMetric({ totalTime, label, isLoading = false, className }: TotalTimeMetricProps) {
  const formatTotalTime = (value: number) => {
    if (value === 0) return "0"
    if (value < 1000) return value.toFixed(0) + "ms"
    return (value / 1000).toFixed(1) + "s"
  }

  // Add subtle visual feedback for live updates
  const isLiveUpdating = isLoading && totalTime > 0

  return (
    <Card className={`bg-muted/30 ${className} ${isLiveUpdating ? 'ring-1 ring-[#6b2aff]/20' : ''}`}>
      <CardHeader className="pb-0 px-2 pt-1.5">
        <CardTitle className="flex items-center gap-0.5 text-[8px] font-medium">
          <Timer className="h-2 w-2" />
          TT
          {isLiveUpdating && <div className="w-1 h-1 bg-[#6b2aff] rounded-full animate-pulse ml-1" />}
        </CardTitle>
        <div className="text-[7px] text-muted-foreground">
          Total time
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-1.5 px-2">
        <div className={`text-lg font-bold transition-colors duration-200 ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
          {isLoading && totalTime === 0 ? (
            <div className="animate-pulse">--</div>
          ) : (
            formatTotalTime(totalTime)
          )}
        </div>
      </CardContent>
    </Card>
  )
})
