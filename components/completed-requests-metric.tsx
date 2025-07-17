"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"
import { memo } from "react"

interface CompletedRequestsMetricProps {
  completedRequests: number
  totalRequests: number
  label: string
  isLoading?: boolean
  className?: string
}

export const CompletedRequestsMetric = memo(function CompletedRequestsMetric({
  completedRequests,
  totalRequests,
  label,
  isLoading = false,
  className
}: CompletedRequestsMetricProps) {
  const formatProgress = (completed: number, total: number) => {
    if (total === 0) return "0/0"
    return `${completed}/${total}`
  }

  const calculatePercentage = (completed: number, total: number) => {
    if (total === 0) return 0
    return Math.round((completed / total) * 100)
  }

  return (
    <Card className={`bg-muted/30 ${className}`}>
      <CardHeader className="pb-0 px-2 pt-1.5">
        <CardTitle className="flex items-center gap-0.5 text-[8px] font-medium">
          <CheckCircle className="h-2 w-2" />
          REQS
        </CardTitle>
        <div className="text-[7px] text-muted-foreground">
          Completed requests
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-1.5 px-2">
        <div className="space-y-1">
          <div className={`text-lg font-bold transition-colors duration-200 ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
            {isLoading && completedRequests === 0 ? (
              <div className="animate-pulse">--</div>
            ) : (
              formatProgress(completedRequests, totalRequests)
            )}
          </div>
          {totalRequests > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div
                className="bg-[#6b2aff] h-1 rounded-full transition-all duration-300"
                style={{ width: `${calculatePercentage(completedRequests, totalRequests)}%` }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})
