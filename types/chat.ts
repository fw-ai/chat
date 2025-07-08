export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  model?: string
  isStreaming?: boolean
  error?: string
  thinking?: string
  thinkingTime?: number
  sessionId?: string
}

export interface ChatModel {
  id: string
  name: string
  provider: string
}

export interface ChatState {
  messages: Message[]
  isLoading: boolean
  error: string | null
  sessionId?: string
  lastModelHash?: string
}

export interface SpeedTestResults {
  model1_tps: number
  model2_tps: number
  model1_ttft: number
  model2_ttft: number
  model1_times: number[]
  model2_times: number[]
  concurrency: number
  model1_success_rate?: number
  model2_success_rate?: number
  model1_aggregate_tps?: number
  model2_aggregate_tps?: number
  // Computed properties for compatibility
  model1_avg_time?: number
  model2_avg_time?: number
  model1_rps?: number
  model2_rps?: number
  model1_completed_requests?: number
  model2_completed_requests?: number
  total_requests?: number
}

export interface ComparisonChatState {
  leftChat: ChatState
  rightChat: ChatState
  leftModel: ChatModel
  rightModel: ChatModel
  speedTestResults?: SpeedTestResults
  speedTestError?: string
  sessionId?: string
  lastModelHash?: string
}
