"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Gauge } from "lucide-react"

interface TpsMetricProps {
  tps: number
  label: string
  isLoading?: boolean
  className?: string
}

export function TpsMetric({ tps, label, isLoading = false, className }: TpsMetricProps) {
  const formatTps = (value: number) => {
    if (value === 0) return "0"
    return value.toFixed(1)
  }

  return (
    <Card className={`bg-muted/30 ${className}`}>
      <CardHeader className="pb-0.5">
        <CardTitle className="flex items-center gap-0.5 text-[10px] font-medium">
          <Gauge className="h-2.5 w-2.5" />
          TPS
        </CardTitle>
        <div className="text-[8px] text-muted-foreground mt-0.5">
          Tokens per second
        </div>
      </CardHeader>
      <CardContent className="pt-0.5 pb-1">
        <div className="space-y-0.5">
          <div className={`text-sm font-bold ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
            {isLoading ? (
              <div className="animate-pulse">--</div>
            ) : (
              formatTps(tps)
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}