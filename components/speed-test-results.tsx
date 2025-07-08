"use client"

import { SpeedTestResults } from "@/types/chat"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Rocket, TrendingUp, Users } from "lucide-react"

interface SpeedTestResultsProps {
  results: SpeedTestResults
  leftModelName: string
  rightModelName: string
}

export function SpeedTestResultsComponent({ results, leftModelName, rightModelName }: SpeedTestResultsProps) {
  const formatTime = (time: number) => `${time.toFixed(0)}ms`
  
  // Calculate average times from the arrays
  const model1_avg_time = results.model1_avg_time || (results.model1_times.length > 0 ? results.model1_times.reduce((a, b) => a + b, 0) / results.model1_times.length : 0)
  const model2_avg_time = results.model2_avg_time || (results.model2_times.length > 0 ? results.model2_times.reduce((a, b) => a + b, 0) / results.model2_times.length : 0)
  
  const winner = model1_avg_time < model2_avg_time ? 'left' : 'right'
  const speedDifference = Math.abs(model1_avg_time - model2_avg_time)
  const percentageDifference = ((speedDifference / Math.max(model1_avg_time, model2_avg_time)) * 100).toFixed(1)

  return (
    <Card className="w-full mt-4 bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4" />
          Speed Test Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">
              {winner === 'left' ? leftModelName : rightModelName} is {percentageDifference}% faster
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {results.concurrency} concurrent request{results.concurrency > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Detailed Results */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{leftModelName}</span>
              {winner === 'left' && <Badge variant="default" className="text-xs">Winner</Badge>}
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {formatTime(model1_avg_time)}
            </div>
            <div className="text-xs text-muted-foreground">
              Average response time
            </div>
            <div className="text-xs text-muted-foreground">
              Range: {formatTime(Math.min(...results.model1_times))} - {formatTime(Math.max(...results.model1_times))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{rightModelName}</span>
              {winner === 'right' && <Badge variant="default" className="text-xs">Winner</Badge>}
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {formatTime(model2_avg_time)}
            </div>
            <div className="text-xs text-muted-foreground">
              Average response time
            </div>
            <div className="text-xs text-muted-foreground">
              Range: {formatTime(Math.min(...results.model2_times))} - {formatTime(Math.max(...results.model2_times))}
            </div>
          </div>
        </div>

        {/* Individual Request Times */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Individual Times</div>
            <div className="flex flex-wrap gap-1">
              {results.model1_times.map((time, index) => (
                <span key={index} className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  {formatTime(time)}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Individual Times</div>
            <div className="flex flex-wrap gap-1">
              {results.model2_times.map((time, index) => (
                <span key={index} className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                  {formatTime(time)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}