"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { BarChart3 } from "lucide-react"

interface CompletionProgressProps {
  completed: number
  total: number
  modelName: string
  isLoading?: boolean
  className?: string
}

export function CompletionProgress({ 
  completed, 
  total, 
  modelName, 
  isLoading = false, 
  className 
}: CompletionProgressProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0
  
  return (
    <Card className={`bg-muted/30 ${className}`}>
      <CardHeader className="pb-0.5">
        <CardTitle className="flex items-center gap-1 text-[10px] font-medium">
          <BarChart3 className="h-2.5 w-2.5" />
          {modelName}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0.5 pb-1">
        <div className="space-y-1">
          <Progress 
            value={percentage} 
            className="h-1.5"
            style={{
              '--progress-foreground': isLoading ? '#6b2aff' : '#000000'
            } as React.CSSProperties}
          />
          <div className="flex justify-between text-[8px]">
            <span className={`font-medium ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
              {completed}/{total}
            </span>
            <span className={`font-medium ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
              {percentage.toFixed(0)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}