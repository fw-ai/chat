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
  apiKey: string
}

// Internal interface for backend API
interface BackendChatRequest {
  messages: ChatMessage[]
  model_key: string
  conversation_id?: string
  comparison_id?: string  // NEW: For comparison chats
  temperature?: number
}

// NEW: Comparison initialization
export interface ComparisonInitRequest {
  messages: ChatMessage[]
  model_keys: string[]
  apiKey: string
}

interface BackendComparisonInitRequest {
  messages: ChatMessage[]
  model_keys: string[]
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
  apiKey: string
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
  apiKey: string
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

  async getModels(apiKey?: string): Promise<ChatModel[]> {
    const response = await fetch(`${this.baseURL}/models`, {
      headers: this.getHeaders(apiKey),
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      // Enhanced error handling based on status codes
      try {
        const errorData = await response.json()
        if (errorData.detail) {
          errorMessage = errorData.detail
        }
      } catch {
        // Fallback to status-based messages if JSON parsing fails
        switch (response.status) {
          case 401:
            errorMessage = "Authentication failed - check API key"
            break
          case 500:
            errorMessage = "Server error - unable to load models"
            break
          case 503:
            errorMessage = "Service unavailable - please try again later"
            break
          default:
            errorMessage = `Failed to load models: ${response.status}`
        }
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()

    // Transform backend model format to frontend format
    return Object.entries(data.models).map(([key, model]: [string, any]) => ({
      id: key,
      name: model.display_name || model.name,
      provider: "Fireworks"
    }))
  }

  // NEW: Initialize comparison session
  async initializeComparison(request: ComparisonInitRequest): Promise<ComparisonInitResponse> {
    const backendRequest: BackendComparisonInitRequest = {
      messages: request.messages,
      model_keys: request.model_keys,
    }

    const response = await fetch(`${this.baseURL}/chat/compare/init`, {
      method: "POST",
      headers: this.getHeaders(request.apiKey),
      body: JSON.stringify(backendRequest),
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      try {
        const errorData = await response.json()
        if (errorData.detail) {
          errorMessage = errorData.detail
        }
      } catch {
        switch (response.status) {
          case 400:
            errorMessage = "Invalid request - check model keys and message format"
            break
          case 401:
            errorMessage = "Authentication failed - check API key"
            break
          case 500:
            errorMessage = "Server error - please try again later"
            break
          default:
            errorMessage = `Request failed with status ${response.status}`
        }
      }

      throw new Error(errorMessage)
    }

    return await response.json()
  }

  async sendSingleChat(request: ChatRequest, comparison_id?: string): Promise<ReadableStream<Uint8Array>> {
    // Transform request format for backend
    const backendRequest: BackendChatRequest = {
      messages: request.messages,
      model_key: request.model,
      conversation_id: request.conversation_id,
      comparison_id: comparison_id, // NEW: Support comparison mode
    }

    const response = await fetch(`${this.baseURL}/chat/single`, {
      method: "POST",
      headers: this.getHeaders(request.apiKey),
      body: JSON.stringify(backendRequest),
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

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
            errorMessage = "Invalid request - check model key and message format"
            break
          case 401:
            errorMessage = "Authentication failed - check API key"
            break
          case 404:
            errorMessage = "Model not found - check model key"
            break
          case 500:
            errorMessage = "Server error - please try again later"
            break
          default:
            errorMessage = `Request failed with status ${response.status}`
        }
      }

      throw new Error(errorMessage)
    }

    if (!response.body) {
      throw new Error("Response body is null")
    }

    return response.body
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
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      try {
        const errorData = await response.json()
        if (errorData.detail) {
          errorMessage = errorData.detail
        }
      } catch {
        switch (response.status) {
          case 400:
            errorMessage = "Invalid request - check model keys and parameters"
            break
          case 401:
            errorMessage = "Authentication failed - check API key"
            break
          case 500:
            errorMessage = "Server error - please try again later"
            break
          default:
            errorMessage = `Request failed with status ${response.status}`
        }
      }

      throw new Error(errorMessage)
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
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

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
            errorMessage = "Invalid request - check model keys and message format"
            break
          case 401:
            errorMessage = "Authentication failed - check API key"
            break
          case 404:
            errorMessage = "One or more models not found - check model keys"
            break
          case 500:
            errorMessage = "Server error - please try again later"
            break
          default:
            errorMessage = `Request failed with status ${response.status}`
        }
      }

      throw new Error(errorMessage)
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
