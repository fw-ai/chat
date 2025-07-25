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
  function_calls?: FunctionCall[]
  tool_calls?: FunctionCall[] // Alias for compatibility
}

export interface ChatModel {
  id: string
  name: string
  provider: string
  function_calling?: boolean
}

export interface FunctionDefinition {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, JSONSchemaProperty>
    required?: string[]
  }
}

interface JSONSchemaProperty {
  type: string
  description?: string
  enum?: string[]
  properties?: Record<string, JSONSchemaProperty>  // For nested objects
  items?: JSONSchemaProperty  // For arrays
}

export interface FunctionCall {
  id: string
  name: string
  arguments: Record<string, any>
  status: 'calling' | 'completed' | 'error'
  result?: any
  error?: string
}

export interface ChatState {
  messages: Message[]
  isLoading: boolean
  error: string | null
  sessionId?: string
  lastModelHash?: string
}

export interface LiveMetrics {
  model1_completed_requests: number
  model2_completed_requests: number
  total_requests: number
  model1_live_tps: number
  model2_live_tps: number
  model1_live_ttft: number
  model2_live_ttft: number
  model1_live_rps: number
  model2_live_rps: number
  model1_total_time: number
  model2_total_time: number
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
  model1_total_time?: number
  model2_total_time?: number
}

export interface ComparisonChatState {
  leftChat: ChatState
  rightChat: ChatState
  leftModel: ChatModel
  rightModel: ChatModel
  speedTestResults?: SpeedTestResults
  speedTestError?: string
  liveMetrics?: LiveMetrics
  sessionId?: string
  lastModelHash?: string
  comparisonId?: string  // NEW: For the new comparison architecture
}
