"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Zap } from "lucide-react"

interface RpsMetricProps {
  rps: number
  label: string
  isLoading?: boolean
  className?: string
}

export function RpsMetric({ rps, label, isLoading = false, className }: RpsMetricProps) {
  const formatRps = (value: number) => {
    if (value === 0) return "0"
    return value.toFixed(1)
  }

  return (
    <Card className={`bg-muted/30 ${className}`}>
      <CardHeader className="pb-0.5">
        <CardTitle className="flex items-center gap-0.5 text-[10px] font-medium">
          <Zap className="h-2.5 w-2.5" />
          RPS
        </CardTitle>
        <div className="text-[8px] text-muted-foreground mt-0.5">
          Requests per second
        </div>
      </CardHeader>
      <CardContent className="pt-0.5 pb-1">
        <div className="space-y-0.5">
          <div className={`text-sm font-bold ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
            {isLoading ? (
              <div className="animate-pulse">--</div>
            ) : (
              formatRps(rps)
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}