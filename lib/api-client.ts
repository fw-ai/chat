import type { ChatModel } from "@/types/chat"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface ChatRequest {
  message: string
  model: string
  conversation_id?: string
}

export interface CompareRequest {
  message: string
  model1: string
  model2: string
  conversation_id?: string
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

  async sendSingleChat(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(`${this.baseURL}/chat/single`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    if (!response.body) {
      throw new Error("Response body is null")
    }

    return response.body
  }

  async sendCompareChat(request: CompareRequest): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(`${this.baseURL}/chat/compare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
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
              if (parsed.content) {
                yield parsed.content
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