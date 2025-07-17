"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Gauge } from "lucide-react"
import { memo } from "react"

interface TpsMetricProps {
  tps: number
  label: string
  isLoading?: boolean
  className?: string
}

export const TpsMetric = memo(function TpsMetric({ tps, label, isLoading = false, className }: TpsMetricProps) {
  const formatTps = (value: number) => {
    if (value === 0) return "0"
    return value.toFixed(1)
  }

  // Add subtle visual feedback for live updates
  const isLiveUpdating = isLoading && tps > 0

  return (
    <Card className={`bg-muted/30 ${className} ${isLiveUpdating ? 'ring-1 ring-[#6b2aff]/20' : ''}`}>
      <CardHeader className="pb-0 px-2 pt-1.5">
        <CardTitle className="flex items-center gap-0.5 text-[8px] font-medium">
          <Gauge className="h-2 w-2" />
          TPS
          {isLiveUpdating && <div className="w-1 h-1 bg-[#6b2aff] rounded-full animate-pulse ml-1" />}
        </CardTitle>
        <div className="text-[7px] text-muted-foreground">
          Tokens per second
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-1.5 px-2">
        <div className={`text-lg font-bold transition-colors duration-200 ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
          {isLoading && tps === 0 ? (
            <div className="animate-pulse">--</div>
          ) : (
            formatTps(tps)
          )}
        </div>
      </CardContent>
    </Card>
  )
})
