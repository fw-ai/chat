import type { ChatModel } from "./chat"

// Session ID with metadata
export interface SessionId {
  id: string
  timestamp: Date
  type: 'single' | 'comparison'
}

// Session state tracking
export interface SessionState {
  id: string
  isActive: boolean
  lastActivity: Date
  modelHash: string
  conversationId?: string
}

// Session configuration
export interface SessionConfig {
  autoReset: boolean
  resetOnModelChange: boolean
  resetOnRefresh: boolean
  maxInactivityTime: number // in milliseconds
}

// Model change tracking
export interface ModelChangeEvent {
  type: 'model_changed'
  sessionId: string
  previous: {
    model?: ChatModel
    models?: ChatModel[]
    hash: string
  }
  new: {
    model?: ChatModel
    models?: ChatModel[]
    hash: string
  }
  timestamp: Date
}

// Model hash for change detection
export interface ModelHash {
  single?: string
  comparison?: string
}

// Session lifecycle events
export type SessionEvent = 
  | { type: 'session_created'; sessionId: string; timestamp: Date }
  | { type: 'session_activated'; sessionId: string; timestamp: Date }
  | { type: 'session_deactivated'; sessionId: string; timestamp: Date }
  | { type: 'session_reset'; sessionId: string; reason: string; timestamp: Date }
  | { type: 'session_destroyed'; sessionId: string; timestamp: Date }
  | ModelChangeEvent

// Session event handler type
export type SessionEventHandler = (event: SessionEvent) => void

// Default session configuration
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  autoReset: true,
  resetOnModelChange: true,
  resetOnRefresh: false,
  maxInactivityTime: 30 * 60 * 1000, // 30 minutes
}