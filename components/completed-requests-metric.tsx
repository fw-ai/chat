"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"

interface CompletedRequestsMetricProps {
  completedRequests: number
  totalRequests: number
  label: string
  isLoading?: boolean
  className?: string
}

export function CompletedRequestsMetric({ 
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
      <CardHeader className="pb-0.5">
        <CardTitle className="flex items-center gap-0.5 text-[10px] font-medium">
          <CheckCircle className="h-2.5 w-2.5" />
          REQS
        </CardTitle>
        <div className="text-[8px] text-muted-foreground mt-0.5">
          Completed requests
        </div>
      </CardHeader>
      <CardContent className="pt-0.5 pb-1">
        <div className="space-y-0.5">
          <div className={`text-sm font-bold ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
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
}