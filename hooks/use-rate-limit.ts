import { useState, useCallback } from 'react'

export interface RateLimitInfo {
  ipUsage: number
  ipLimit: number
  ipRemaining: number
  prefixUsage: number
  prefixLimit: number
  prefixRemaining: number
  limitType?: 'individual_ip' | 'ip_prefix' | 'allowed'
  isRateLimited: boolean
  rateLimitMessage?: string
}

// No longer needed - using standard Error with properties

export function useRateLimit() {
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null)
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)

  const parseRateLimitHeaders = useCallback((headers: Headers): RateLimitInfo => {
    const ipLimit = parseInt(headers.get('X-RateLimit-Limit-IP') || '5')
    const ipRemaining = parseInt(headers.get('X-RateLimit-Remaining-IP') || '5')
    const prefixLimit = parseInt(headers.get('X-RateLimit-Limit-Prefix') || '50')
    const prefixRemaining = parseInt(headers.get('X-RateLimit-Remaining-Prefix') || '50')

    return {
      ipLimit,
      ipRemaining,
      ipUsage: Math.max(0, ipLimit - ipRemaining),
      prefixLimit,
      prefixRemaining,
      prefixUsage: Math.max(0, prefixLimit - prefixRemaining),
      isRateLimited: false,
    }
  }, [])

  const parseRateLimitError = useCallback((response: Response, errorMessage?: string): RateLimitInfo => {
    const headers = response.headers
    const baseInfo = parseRateLimitHeaders(headers)

    // Determine limit type from error message
    let limitType: 'individual_ip' | 'ip_prefix' = 'individual_ip'
    if (errorMessage?.includes('Network limit exceeded') || errorMessage?.includes('VPN/corporate')) {
      limitType = 'ip_prefix'
    }

    return {
      ...baseInfo,
      limitType,
      isRateLimited: true,
      rateLimitMessage: errorMessage,
    }
  }, [parseRateLimitHeaders])

  const handleApiResponse = useCallback((response: Response) => {
    // Check for rate limit headers in any response
    if (response.headers.has('X-RateLimit-Limit-IP')) {
      const info = parseRateLimitHeaders(response.headers)
      setRateLimitInfo(info)
    }
  }, [parseRateLimitHeaders])

  const handleRateLimitError = useCallback(async (response: Response): Promise<void> => {
    let errorMessage = 'Daily limit exceeded'

    try {
      const errorData = await response.json()
      if (errorData.detail) {
        errorMessage = errorData.detail
      }
    } catch {
      // Use default message if JSON parsing fails
    }

    const rateLimitInfo = parseRateLimitError(response, errorMessage)
    setRateLimitInfo(rateLimitInfo)
    setShowUpgradePrompt(true)
  }, [parseRateLimitError])

  const dismissUpgradePrompt = useCallback(() => {
    setShowUpgradePrompt(false)
  }, [])

  const resetRateLimit = useCallback(() => {
    setRateLimitInfo(null)
    setShowUpgradePrompt(false)
  }, [])

  return {
    rateLimitInfo,
    showUpgradePrompt,
    handleApiResponse,
    handleRateLimitError,
    dismissUpgradePrompt,
    resetRateLimit,
  }
}
