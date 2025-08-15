import type { ChatModel } from "@/types/chat"

// For local development, use localhost:8000, for Vercel deployment use relative paths
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? "http://localhost:8000" : "")

export interface ChatMessage {
  role: string
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  model: string
  conversation_id?: string
  function_definitions?: any[]
  apiKey?: string
}

// Internal interface for backend API
interface BackendChatRequest {
  messages: ChatMessage[]
  model_key: string
  conversation_id?: string
  comparison_id?: string  // NEW: For comparison chats
  temperature?: number
  function_definitions?: any[]
}

// NEW: Comparison initialization
export interface ComparisonInitRequest {
  messages: ChatMessage[]
  model_keys: string[]
  function_definitions?: any[]
  apiKey?: string
}

interface BackendComparisonInitRequest {
  messages: ChatMessage[]
  model_keys: string[]
  function_definitions?: any[]
}

export interface ComparisonInitResponse {
  comparison_id: string
  model_keys: string[]
  status: "initialized"
}

// NEW: Metrics request
export interface MetricsRequest {
  model_keys: string[]
  comparison_id?: string
  concurrency?: number
  temperature?: number
  prompt?: string
  apiKey?: string
}

interface BackendMetricsRequest {
  model_keys: string[]
  comparison_id?: string
  concurrency?: number
  temperature?: number
  prompt?: string
}

// LEGACY: Keep for backward compatibility during transition
export interface CompareRequest {
  messages: ChatMessage[]
  model1: string
  model2: string
  conversation_id?: string
  speed_test?: boolean
  concurrency?: number
  apiKey?: string
}

// Internal interface for backend API (LEGACY)
interface BackendCompareRequest {
  messages: ChatMessage[]
  model_keys: string[]
  comparison_id?: string
  temperature?: number
  speed_test?: boolean
  concurrency?: number
}

export interface ChatResponse {
  response: string
  model: string
  conversation_id: string
}

export interface CompareResponse {
  response1: string
  response2: string
  model1: string
  model2: string
  conversation_id: string
  speed_test_results?: {
    model1_avg_time: number
    model2_avg_time: number
    model1_times: number[]
    model2_times: number[]
    concurrency: number
  }
}

export interface RateLimitHeaders {
  ipLimit?: number
  ipRemaining?: number
  prefixLimit?: number
  prefixRemaining?: number
}

// Simple interface for rate limit errors - no custom class needed
export interface RateLimitErrorInfo {
  isRateLimit: true
  status: 429
  headers: RateLimitHeaders
  message: string
}

export class ApiClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  private getHeaders(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    return headers
  }

  private extractRateLimitHeaders(response: Response): RateLimitHeaders {
    return {
      ipLimit: response.headers.has('X-RateLimit-Limit-IP')
        ? parseInt(response.headers.get('X-RateLimit-Limit-IP')!)
        : undefined,
      ipRemaining: response.headers.has('X-RateLimit-Remaining-IP')
        ? parseInt(response.headers.get('X-RateLimit-Remaining-IP')!)
        : undefined,
      prefixLimit: response.headers.has('X-RateLimit-Limit-Prefix')
        ? parseInt(response.headers.get('X-RateLimit-Limit-Prefix')!)
        : undefined,
      prefixRemaining: response.headers.has('X-RateLimit-Remaining-Prefix')
        ? parseInt(response.headers.get('X-RateLimit-Remaining-Prefix')!)
        : undefined,
    }
  }

  private async handleHttpError(response: Response): Promise<never> {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`

    // Special handling for rate limiting
    if (response.status === 429) {
      try {
        const errorData = await response.json()
        if (errorData.detail) {
          errorMessage = errorData.detail
        }
      } catch {
        errorMessage = "Daily limit exceeded. Sign in with a Fireworks API key for unlimited access."
      }

      const rateLimitHeaders = this.extractRateLimitHeaders(response)
      const error = new Error(errorMessage) as Error & RateLimitErrorInfo
      error.isRateLimit = true
      error.status = 429
      error.headers = rateLimitHeaders
      error.message = errorMessage
      throw error
    }

    // Enhanced error handling based on status codes
    try {
      const errorData = await response.json()
      if (errorData.detail) {
        errorMessage = errorData.detail
      }
    } catch {
      // Fallback to status-based messages if JSON parsing fails
      switch (response.status) {
        case 400:
          errorMessage = "Invalid request - check parameters"
          break
        case 401:
          errorMessage = "Authentication failed - check API key"
          break
        case 404:
          errorMessage = "Resource not found"
          break
        case 500:
          errorMessage = "Server error - please try again later"
          break
        case 503:
          errorMessage = "Service unavailable - please try again later"
          break
        default:
          errorMessage = `Request failed with status ${response.status}`
      }
    }

    throw new Error(errorMessage)
  }

  async getModels(apiKey?: string, functionCallingEnabled?: boolean): Promise<ChatModel[]> {
    // Build query parameters
    const queryParams = new URLSearchParams()
    if (functionCallingEnabled !== undefined) {
      queryParams.append('function_calling', functionCallingEnabled.toString())
    }

    const queryString = queryParams.toString()
    const url = `${this.baseURL}/models${queryString ? `?${queryString}` : ''}`

    const response = await fetch(url, {
      headers: this.getHeaders(apiKey),
    })

    if (!response.ok) {
      await this.handleHttpError(response)
    }

    const data = await response.json()

    // Transform backend model format to frontend format
    return Object.entries(data.models).map(([key, model]: [string, any]) => ({
      id: key,
      name: model.title || model.display_name || model.name || key,
      provider: "Fireworks",
      function_calling: model.supportsTools || model.function_calling || false,
      // Pass through marketing data
      ...model
    }))
  }

  // NEW: Initialize comparison session
  async initializeComparison(request: ComparisonInitRequest): Promise<ComparisonInitResponse> {
    const backendRequest: BackendComparisonInitRequest = {
      messages: request.messages,
      model_keys: request.model_keys,
      function_definitions: request.function_definitions,
    }

    const response = await fetch(`${this.baseURL}/chat/compare/init`, {
      method: "POST",
      headers: this.getHeaders(request.apiKey),
      body: JSON.stringify(backendRequest),
    })

    if (!response.ok) {
      await this.handleHttpError(response)
    }

    return await response.json()
  }

  async sendSingleChat(request: ChatRequest, comparison_id?: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    // Transform request format for backend
    const backendRequest: BackendChatRequest = {
      messages: request.messages,
      model_key: request.model,
      conversation_id: request.conversation_id,
      comparison_id: comparison_id, // NEW: Support comparison mode
      function_definitions: request.function_definitions,
    }

    const response = await fetch(`${this.baseURL}/chat/single`, {
      method: "POST",
      headers: this.getHeaders(request.apiKey),
      body: JSON.stringify(backendRequest),
      signal,
    })

    if (!response.ok) {
      await this.handleHttpError(response)
    }

    if (!response.body) {
      throw new Error("Response body is null")
    }

    return response.body
  }

  // NEW: Count message for rate limiting
  async countMessage(apiKey?: string): Promise<{ allowed: boolean; remaining: number | string; message: string }> {
    try {
      const response = await fetch(`${this.baseURL}/api/count-message`, {
        method: "POST",
        headers: this.getHeaders(apiKey),
      })

      if (!response.ok) {
        console.error("Count message failed:", response.status, response.statusText)
        await this.handleHttpError(response)
      }

      return await response.json()
    } catch (error) {
      console.error("Count message request failed:", error)
      throw error
    }
  }

  // NEW: Stream live metrics
  async streamMetrics(request: MetricsRequest): Promise<ReadableStream<Uint8Array>> {
    const backendRequest: BackendMetricsRequest = {
      model_keys: request.model_keys,
      comparison_id: request.comparison_id,
      concurrency: request.concurrency,
      temperature: request.temperature,
      prompt: request.prompt,
    }

    const response = await fetch(`${this.baseURL}/chat/metrics`, {
      method: "POST",
      headers: this.getHeaders(request.apiKey),
      body: JSON.stringify(backendRequest),
    })

    if (!response.ok) {
      await this.handleHttpError(response)
    }

    if (!response.body) {
      throw new Error("Response body is null")
    }

    return response.body
  }

  // LEGACY: Keep old compare method for backward compatibility during transition
  async sendCompareChat(request: CompareRequest): Promise<ReadableStream<Uint8Array>> {
    // Transform request format for backend
    const backendRequest: BackendCompareRequest = {
      messages: request.messages,
      model_keys: [request.model1, request.model2],
      comparison_id: request.conversation_id,
      speed_test: request.speed_test,
      concurrency: request.concurrency,
    }

    const response = await fetch(`${this.baseURL}/chat/compare`, {
      method: "POST",
      headers: this.getHeaders(request.apiKey),
      body: JSON.stringify(backendRequest),
    })

    if (!response.ok) {
      await this.handleHttpError(response)
    }

    if (!response.body) {
      throw new Error("Response body is null")
    }

    return response.body
  }

  async *streamResponse(stream: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.trim() === '') continue
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') return

            try {
              const parsed = JSON.parse(data)

              // Handle structured backend response format
              if (parsed.type === 'content' && parsed.content) {
                yield parsed.content
              } else if (parsed.type === 'tool_calls' && parsed.tool_calls) {
                // Yield a special marker for tool calls that the frontend can handle
                yield `\n__TOOL_CALLS__:${JSON.stringify(parsed.tool_calls)}\n`
              } else if (parsed.type === 'finish_reason' && parsed.finish_reason) {
                // Yield a special marker for finish reason
                yield `\n__FINISH_REASON__:${parsed.finish_reason}\n`
              } else if (parsed.type === 'done') {
                return
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error || 'Unknown error')
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  // NEW: Stream metrics responses
  async *streamMetricsResponse(stream: ReadableStream<Uint8Array>): AsyncGenerator<{type: 'live_metrics' | 'speed_test_results' | 'error', metrics?: any, results?: any, error?: string}, void, unknown> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.trim() === '') continue
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') return

            try {
              const parsed = JSON.parse(data)

              if (parsed.type === 'live_metrics') {
                yield { type: 'live_metrics', metrics: parsed.metrics }
              } else if (parsed.type === 'speed_test_results') {
                yield { type: 'speed_test_results', results: parsed.results }
              } else if (parsed.type === 'error') {
                yield { type: 'error', error: parsed.error || 'Unknown error' }
              }
            } catch (e) {
              console.warn('Failed to parse metrics SSE data:', data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  // LEGACY: Keep for backward compatibility during transition
  async *streamCompareResponse(stream: ReadableStream<Uint8Array>): AsyncGenerator<{model1_response?: string, model2_response?: string, speed_test_results?: any, speed_test_error?: string, live_metrics?: any}, void, unknown> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.trim() === '') continue
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') return

            try {
              const parsed = JSON.parse(data)

              // Handle structured backend comparison response format
              if (parsed.type === 'content' && parsed.content) {
                const modelIndex = parsed.model_index
                if (modelIndex === 0) {
                  yield { model1_response: parsed.content }
                } else if (modelIndex === 1) {
                  yield { model2_response: parsed.content }
                }
              } else if (parsed.type === 'speed_test_results') {
                // Handle speed test results from the backend
                yield { speed_test_results: parsed.results }
              } else if (parsed.type === 'live_metrics') {
                // Handle live metrics updates from the backend
                yield { live_metrics: parsed.metrics }
              } else if (parsed.type === 'comparison_done') {
                return
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error || 'Unknown error')
              } else if (parsed.type === 'speed_test_error') {
                console.error('Speed test error:', parsed.error)
                yield { speed_test_error: parsed.error }
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

export const apiClient = new ApiClient()
