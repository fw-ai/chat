export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  model?: string
  isStreaming?: boolean
  error?: string
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
}

export interface SpeedTestResults {
  model1_avg_time: number
  model2_avg_time: number
  model1_times: number[]
  model2_times: number[]
  concurrency: number
}

export interface ComparisonChatState {
  leftChat: ChatState
  rightChat: ChatState
  leftModel: ChatModel
  rightModel: ChatModel
  speedTestResults?: SpeedTestResults
}
