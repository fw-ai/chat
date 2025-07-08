import type { ChatModel } from "@/types/chat"
import type { 
  SessionId, 
  SessionState, 
  SessionEvent, 
  SessionEventHandler,
  ModelChangeEvent 
} from "@/types/session"

/**
 * Generates unique session IDs with metadata
 */
export class SessionIdGenerator {
  private static instance: SessionIdGenerator
  private counter: number = 0

  private constructor() {}

  public static getInstance(): SessionIdGenerator {
    if (!SessionIdGenerator.instance) {
      SessionIdGenerator.instance = new SessionIdGenerator()
    }
    return SessionIdGenerator.instance
  }

  /**
   * Generate a new session ID
   */
  public generateSessionId(type: 'single' | 'comparison' = 'single'): SessionId {
    const timestamp = new Date()
    const counter = ++this.counter
    
    // Create a unique ID combining timestamp and counter
    const id = `session_${timestamp.getTime()}_${counter}`
    
    return {
      id,
      timestamp,
      type
    }
  }

  /**
   * Validate session ID format
   */
  public validateSessionId(sessionId: string): boolean {
    return /^session_\d+_\d+$/.test(sessionId)
  }

  /**
   * Extract timestamp from session ID
   */
  public extractTimestamp(sessionId: string): Date | null {
    if (!this.validateSessionId(sessionId)) {
      return null
    }
    
    const parts = sessionId.split('_')
    if (parts.length >= 2) {
      const timestamp = parseInt(parts[1])
      if (!isNaN(timestamp)) {
        return new Date(timestamp)
      }
    }
    
    return null
  }
}

/**
 * Generates hashes for model change detection
 */
export class ModelHashGenerator {
  /**
   * Generate hash for a single model
   */
  public static generateSingleModelHash(model: ChatModel | null): string {
    if (!model) {
      return 'null'
    }
    
    return `single_${model.id}_${model.name}_${model.provider}`
  }

  /**
   * Generate hash for comparison models
   */
  public static generateComparisonModelHash(leftModel: ChatModel | null, rightModel: ChatModel | null): string {
    const leftHash = leftModel ? `${leftModel.id}_${leftModel.name}_${leftModel.provider}` : 'null'
    const rightHash = rightModel ? `${rightModel.id}_${rightModel.name}_${rightModel.provider}` : 'null'
    
    return `comparison_${leftHash}_vs_${rightHash}`
  }

  /**
   * Compare two model hashes
   */
  public static compareHashes(hash1: string, hash2: string): boolean {
    return hash1 === hash2
  }

  /**
   * Extract model type from hash
   */
  public static extractModelType(hash: string): 'single' | 'comparison' | null {
    if (hash.startsWith('single_')) {
      return 'single'
    } else if (hash.startsWith('comparison_')) {
      return 'comparison'
    }
    return null
  }
}

/**
 * Tracks active sessions and handles session events
 */
export class SessionTracker {
  private static instance: SessionTracker
  private activeSessions: Map<string, SessionState> = new Map()
  private eventHandlers: SessionEventHandler[] = []

  private constructor() {}

  public static getInstance(): SessionTracker {
    if (!SessionTracker.instance) {
      SessionTracker.instance = new SessionTracker()
    }
    return SessionTracker.instance
  }

  /**
   * Add event handler
   */
  public addEventListener(handler: SessionEventHandler): void {
    this.eventHandlers.push(handler)
  }

  /**
   * Remove event handler
   */
  public removeEventListener(handler: SessionEventHandler): void {
    const index = this.eventHandlers.indexOf(handler)
    if (index > -1) {
      this.eventHandlers.splice(index, 1)
    }
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: SessionEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        console.error('Error in session event handler:', error)
      }
    })
  }

  /**
   * Create and track a new session
   */
  public createSession(sessionId: string, modelHash: string, conversationId?: string): SessionState {
    const sessionState: SessionState = {
      id: sessionId,
      isActive: true,
      lastActivity: new Date(),
      modelHash,
      conversationId
    }

    this.activeSessions.set(sessionId, sessionState)
    
    this.emitEvent({
      type: 'session_created',
      sessionId,
      timestamp: new Date()
    })

    return sessionState
  }

  /**
   * Update session activity
   */
  public updateActivity(sessionId: string): void {
    const session = this.activeSessions.get(sessionId)
    if (session) {
      session.lastActivity = new Date()
      this.activeSessions.set(sessionId, session)
    }
  }

  /**
   * Update session model hash
   */
  public updateModelHash(sessionId: string, newModelHash: string, oldModelHash: string): void {
    const session = this.activeSessions.get(sessionId)
    if (session) {
      session.modelHash = newModelHash
      session.lastActivity = new Date()
      this.activeSessions.set(sessionId, session)

      // Emit model change event
      this.emitEvent({
        type: 'model_changed',
        sessionId,
        previous: { hash: oldModelHash },
        new: { hash: newModelHash },
        timestamp: new Date()
      } as ModelChangeEvent)
    }
  }

  /**
   * Activate session
   */
  public activateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId)
    if (session && !session.isActive) {
      session.isActive = true
      session.lastActivity = new Date()
      this.activeSessions.set(sessionId, session)
      
      this.emitEvent({
        type: 'session_activated',
        sessionId,
        timestamp: new Date()
      })
    }
  }

  /**
   * Deactivate session
   */
  public deactivateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId)
    if (session && session.isActive) {
      session.isActive = false
      this.activeSessions.set(sessionId, session)
      
      this.emitEvent({
        type: 'session_deactivated',
        sessionId,
        timestamp: new Date()
      })
    }
  }

  /**
   * Reset session
   */
  public resetSession(sessionId: string, reason: string): void {
    const session = this.activeSessions.get(sessionId)
    if (session) {
      // Reset session state while keeping the ID
      session.lastActivity = new Date()
      session.conversationId = undefined
      this.activeSessions.set(sessionId, session)
      
      this.emitEvent({
        type: 'session_reset',
        sessionId,
        reason,
        timestamp: new Date()
      })
    }
  }

  /**
   * Destroy session
   */
  public destroySession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId)
    if (session) {
      this.activeSessions.delete(sessionId)
      
      this.emitEvent({
        type: 'session_destroyed',
        sessionId,
        timestamp: new Date()
      })
    }
  }

  /**
   * Get session state
   */
  public getSession(sessionId: string): SessionState | null {
    return this.activeSessions.get(sessionId) || null
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): SessionState[] {
    return Array.from(this.activeSessions.values()).filter(session => session.isActive)
  }

  /**
   * Get all sessions
   */
  public getAllSessions(): SessionState[] {
    return Array.from(this.activeSessions.values())
  }

  /**
   * Check if session exists
   */
  public hasSession(sessionId: string): boolean {
    return this.activeSessions.has(sessionId)
  }

  /**
   * Clean up inactive sessions based on max inactivity time
   */
  public cleanupInactiveSessions(maxInactivityTime: number): void {
    const now = new Date()
    const sessionsToDestroy: string[] = []

    for (const [sessionId, session] of this.activeSessions) {
      const inactiveTime = now.getTime() - session.lastActivity.getTime()
      if (inactiveTime > maxInactivityTime) {
        sessionsToDestroy.push(sessionId)
      }
    }

    sessionsToDestroy.forEach(sessionId => {
      this.destroySession(sessionId)
    })
  }

  /**
   * Get session count
   */
  public getSessionCount(): number {
    return this.activeSessions.size
  }

  /**
   * Clear all sessions
   */
  public clearAllSessions(): void {
    const sessionIds = Array.from(this.activeSessions.keys())
    sessionIds.forEach(sessionId => this.destroySession(sessionId))
  }
}

// Export singleton instances
export const sessionIdGenerator = SessionIdGenerator.getInstance()
export const sessionTracker = SessionTracker.getInstance()