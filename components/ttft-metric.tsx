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

  return (
    <Card className={`bg-muted/30 ${className}`}>
      <CardHeader className="pb-0.5">
        <CardTitle className="flex items-center gap-0.5 text-[10px] font-medium">
          <Clock className="h-2.5 w-2.5" />
          TTFT
        </CardTitle>
        <div className="text-[8px] text-muted-foreground mt-0.5">
          Time to first token
        </div>
      </CardHeader>
      <CardContent className="pt-0.5 pb-1">
        <div className="space-y-0.5">
          <div className={`text-sm font-bold ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
            {isLoading ? (
              <div className="animate-pulse">--</div>
            ) : (
              formatTtft(ttft)
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
