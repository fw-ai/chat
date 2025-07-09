import type { ChatModel } from "@/types/chat"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface ChatMessage {
  role: string
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  model: string
  conversation_id?: string
}

// Internal interface for backend API
interface BackendChatRequest {
  messages: ChatMessage[]
  model_key: string
  conversation_id?: string
  temperature?: number
}

export interface CompareRequest {
  messages: ChatMessage[]
  model1: string
  model2: string
  conversation_id?: string
  speed_test?: boolean
  concurrency?: number
}

// Internal interface for backend API
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

  async getModels(): Promise<ChatModel[]> {
    const response = await fetch(`${this.baseURL}/models`)
    
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

  async sendSingleChat(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
    // Transform request format for backend
    const backendRequest: BackendChatRequest = {
      messages: request.messages,
      model_key: request.model,
      conversation_id: request.conversation_id,
    }

    const response = await fetch(`${this.baseURL}/chat/single`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
      headers: {
        "Content-Type": "application/json",
      },
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

  async *streamCompareResponse(stream: ReadableStream<Uint8Array>): AsyncGenerator<{model1_response?: string, model2_response?: string, speed_test_results?: any, speed_test_error?: string}, void, unknown> {
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