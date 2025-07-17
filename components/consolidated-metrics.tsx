"use client"

import { memo } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ConsolidatedMetricsProps {
  // Main metrics (larger)
  completedRequests: number
  totalRequests: number
  totalTime: number

  // Secondary metrics (smaller)
  tps: number
  rps: number
  ttft: number

  // State
  isLoading?: boolean
  className?: string
}

export const ConsolidatedMetrics = memo(function ConsolidatedMetrics({
  completedRequests,
  totalRequests,
  totalTime,
  tps,
  rps,
  ttft,
  isLoading = false,
  className
}: ConsolidatedMetricsProps) {

  const formatProgress = (completed: number, total: number) => {
    if (total === 0) return "0/0"
    return `${completed}/${total}`
  }

  const formatTotalTime = (value: number) => {
    if (value === 0) return "0.0"
    if (value < 1000) return value.toFixed(0) + "ms"
    return (value / 1000).toFixed(1) + "s"
  }

  const formatTps = (value: number) => {
    if (value === 0) return "0.0"
    return value.toFixed(1)
  }

  const formatRps = (value: number) => {
    if (value === 0) return "0.0"
    return value.toFixed(1)
  }

  const formatTtft = (value: number) => {
    if (value === 0) return "0"
    return value.toFixed(0) + "ms"
  }

  const calculatePercentage = (completed: number, total: number) => {
    if (total === 0) return 0
    return Math.round((completed / total) * 100)
  }

  // Check if any secondary metrics are updating
  const hasLiveSecondaryMetrics = isLoading && (tps > 0 || rps > 0 || ttft > 0)
  const hasLiveMainMetrics = isLoading && (completedRequests > 0 || totalTime > 0)

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Single Row - All Metrics */}
      <div className="flex items-center gap-4">
        {/* CR - Completed requests */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 cursor-help transition-colors duration-200 ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
              <span className="text-sm font-medium">
                {isLoading && completedRequests === 0 && totalRequests === 0 ? "--" : formatProgress(completedRequests, totalRequests)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">CR</span>
              {hasLiveMainMetrics && <div className="w-1.5 h-1.5 bg-[#6b2aff] rounded-full animate-pulse ml-1" />}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Completed requests</p>
          </TooltipContent>
        </Tooltip>

        {/* TT - Total Time */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 cursor-help transition-colors duration-200 ${isLoading ? 'text-[#6b2aff]' : 'text-black'}`}>
              <span className="text-sm font-medium">
                {isLoading && totalTime === 0 ? "--" : formatTotalTime(totalTime)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">TT</span>
              {hasLiveMainMetrics && <div className="w-1.5 h-1.5 bg-[#6b2aff] rounded-full animate-pulse ml-1" />}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Total time</p>
          </TooltipContent>
        </Tooltip>

        {/* Divider */}
        <div className="text-muted-foreground text-sm">|</div>

        {/* TPS - Tokens Per Second */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 cursor-help transition-colors duration-200 ${hasLiveSecondaryMetrics ? 'text-[#6b2aff]' : 'text-muted-foreground'}`}>
              <span className="text-sm font-medium">
                {isLoading && tps === 0 ? "--" : formatTps(tps)}
              </span>
              <span className="text-xs">TPS</span>
              {hasLiveSecondaryMetrics && <div className="w-1 h-1 bg-[#6b2aff] rounded-full animate-pulse" />}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Tokens per second</p>
          </TooltipContent>
        </Tooltip>

        {/* RPS - Requests Per Second */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 cursor-help transition-colors duration-200 ${hasLiveSecondaryMetrics ? 'text-[#6b2aff]' : 'text-muted-foreground'}`}>
              <span className="text-sm font-medium">
                {isLoading && rps === 0 ? "--" : formatRps(rps)}
              </span>
              <span className="text-xs">RPS</span>
              {hasLiveSecondaryMetrics && <div className="w-1 h-1 bg-[#6b2aff] rounded-full animate-pulse" />}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Requests per second</p>
          </TooltipContent>
        </Tooltip>

        {/* TTFT - Time To First Token */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 cursor-help transition-colors duration-200 ${hasLiveSecondaryMetrics ? 'text-[#6b2aff]' : 'text-muted-foreground'}`}>
              <span className="text-sm font-medium">
                {isLoading && ttft === 0 ? "--" : formatTtft(ttft)}
              </span>
              <span className="text-xs">TTFT</span>
              {hasLiveSecondaryMetrics && <div className="w-1 h-1 bg-[#6b2aff] rounded-full animate-pulse" />}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Time to first token</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Progress Bar */}
      {totalRequests > 0 && (
        <div className="w-full bg-gray-200 rounded-full h-1">
          <div
            className="bg-[#6b2aff] h-1 rounded-full transition-all duration-300"
            style={{ width: `${calculatePercentage(completedRequests, totalRequests)}%` }}
          />
        </div>
      )}
    </div>
  )
})
