import type { ChatModel } from "@/types/chat"
import type { 
  SessionId, 
  SessionState, 
  SessionConfig, 
  SessionEvent, 
  SessionEventHandler,
  ModelChangeEvent
} from "@/types/session"
import { DEFAULT_SESSION_CONFIG } from "@/types/session"
import { 
  SessionIdGenerator, 
  ModelHashGenerator, 
  SessionTracker,
  sessionIdGenerator,
  sessionTracker
} from "./session-manager"

/**
 * Core session state management class
 */
export class SessionStateManager {
  private static instance: SessionStateManager
  private config: SessionConfig = DEFAULT_SESSION_CONFIG
  private cleanupInterval: NodeJS.Timeout | null = null

  private constructor() {
    // Set up periodic cleanup
    this.startCleanupInterval()
  }

  public static getInstance(): SessionStateManager {
    if (!SessionStateManager.instance) {
      SessionStateManager.instance = new SessionStateManager()
    }
    return SessionStateManager.instance
  }

  /**
   * Update session configuration
   */
  public updateConfig(config: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...config }
    
    // Restart cleanup interval with new settings
    this.stopCleanupInterval()
    this.startCleanupInterval()
  }

  /**
   * Get current configuration
   */
  public getConfig(): SessionConfig {
    return { ...this.config }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      sessionTracker.cleanupInactiveSessions(this.config.maxInactivityTime)
    }, 5 * 60 * 1000)
  }

  /**
   * Stop cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Create a new single chat session
   */
  public createSingleSession(model: ChatModel | null, conversationId?: string): SessionState {
    const sessionId = sessionIdGenerator.generateSessionId('single')
    const modelHash = ModelHashGenerator.generateSingleModelHash(model)
    
    const session = sessionTracker.createSession(sessionId.id, modelHash, conversationId)
    
    return session
  }

  /**
   * Create a new comparison chat session
   */
  public createComparisonSession(
    leftModel: ChatModel | null, 
    rightModel: ChatModel | null, 
    conversationId?: string
  ): SessionState {
    const sessionId = sessionIdGenerator.generateSessionId('comparison')
    const modelHash = ModelHashGenerator.generateComparisonModelHash(leftModel, rightModel)
    
    const session = sessionTracker.createSession(sessionId.id, modelHash, conversationId)
    
    return session
  }

  /**
   * Check if model change should trigger session reset for single chat
   */
  public shouldResetOnSingleModelChange(
    currentSessionId: string, 
    newModel: ChatModel | null
  ): boolean {
    if (!this.config.resetOnModelChange) {
      return false
    }

    const session = sessionTracker.getSession(currentSessionId)
    if (!session) {
      return false
    }

    const currentHash = session.modelHash
    const newHash = ModelHashGenerator.generateSingleModelHash(newModel)
    
    return !ModelHashGenerator.compareHashes(currentHash, newHash)
  }

  /**
   * Check if model change should trigger session reset for comparison chat
   */
  public shouldResetOnComparisonModelChange(
    currentSessionId: string,
    newLeftModel: ChatModel | null,
    newRightModel: ChatModel | null
  ): boolean {
    if (!this.config.resetOnModelChange) {
      return false
    }

    const session = sessionTracker.getSession(currentSessionId)
    if (!session) {
      return false
    }

    const currentHash = session.modelHash
    const newHash = ModelHashGenerator.generateComparisonModelHash(newLeftModel, newRightModel)
    
    return !ModelHashGenerator.compareHashes(currentHash, newHash)
  }

  /**
   * Handle single model change
   */
  public handleSingleModelChange(
    currentSessionId: string,
    newModel: ChatModel | null,
    onReset?: () => void
  ): { shouldReset: boolean; sessionId: string } {
    const shouldReset = this.shouldResetOnSingleModelChange(currentSessionId, newModel)
    
    if (shouldReset) {
      // Reset current session or create new one
      if (this.config.autoReset) {
        sessionTracker.resetSession(currentSessionId, 'model_change')
        
        // Update model hash
        const newHash = ModelHashGenerator.generateSingleModelHash(newModel)
        const session = sessionTracker.getSession(currentSessionId)
        if (session) {
          sessionTracker.updateModelHash(currentSessionId, newHash, session.modelHash)
        }
        
        // Execute reset callback
        if (onReset) {
          onReset()
        }
        
        return { shouldReset: true, sessionId: currentSessionId }
      } else {
        // Create new session
        const newSession = this.createSingleSession(newModel)
        return { shouldReset: true, sessionId: newSession.id }
      }
    } else {
      // Update activity
      sessionTracker.updateActivity(currentSessionId)
      return { shouldReset: false, sessionId: currentSessionId }
    }
  }

  /**
   * Handle comparison model change
   */
  public handleComparisonModelChange(
    currentSessionId: string,
    newLeftModel: ChatModel | null,
    newRightModel: ChatModel | null,
    onReset?: () => void
  ): { shouldReset: boolean; sessionId: string } {
    const shouldReset = this.shouldResetOnComparisonModelChange(
      currentSessionId, 
      newLeftModel, 
      newRightModel
    )
    
    if (shouldReset) {
      // Reset current session or create new one
      if (this.config.autoReset) {
        sessionTracker.resetSession(currentSessionId, 'model_change')
        
        // Update model hash
        const newHash = ModelHashGenerator.generateComparisonModelHash(newLeftModel, newRightModel)
        const session = sessionTracker.getSession(currentSessionId)
        if (session) {
          sessionTracker.updateModelHash(currentSessionId, newHash, session.modelHash)
        }
        
        // Execute reset callback
        if (onReset) {
          onReset()
        }
        
        return { shouldReset: true, sessionId: currentSessionId }
      } else {
        // Create new session
        const newSession = this.createComparisonSession(newLeftModel, newRightModel)
        return { shouldReset: true, sessionId: newSession.id }
      }
    } else {
      // Update activity
      sessionTracker.updateActivity(currentSessionId)
      return { shouldReset: false, sessionId: currentSessionId }
    }
  }

  /**
   * Reset session with reason
   */
  public resetSession(sessionId: string, reason: string, onReset?: () => void): void {
    sessionTracker.resetSession(sessionId, reason)
    
    if (onReset) {
      onReset()
    }
  }

  /**
   * Check if session should be reset on page refresh
   */
  public shouldResetOnRefresh(): boolean {
    return this.config.resetOnRefresh
  }

  /**
   * Get session state
   */
  public getSessionState(sessionId: string): SessionState | null {
    return sessionTracker.getSession(sessionId)
  }

  /**
   * Update session activity
   */
  public updateSessionActivity(sessionId: string): void {
    sessionTracker.updateActivity(sessionId)
  }

  /**
   * Activate session
   */
  public activateSession(sessionId: string): void {
    sessionTracker.activateSession(sessionId)
  }

  /**
   * Deactivate session
   */
  public deactivateSession(sessionId: string): void {
    sessionTracker.deactivateSession(sessionId)
  }

  /**
   * Destroy session
   */
  public destroySession(sessionId: string): void {
    sessionTracker.destroySession(sessionId)
  }

  /**
   * Add event listener for session events
   */
  public addEventListener(handler: SessionEventHandler): void {
    sessionTracker.addEventListener(handler)
  }

  /**
   * Remove event listener for session events
   */
  public removeEventListener(handler: SessionEventHandler): void {
    sessionTracker.removeEventListener(handler)
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): SessionState[] {
    return sessionTracker.getActiveSessions()
  }

  /**
   * Get session count
   */
  public getSessionCount(): number {
    return sessionTracker.getSessionCount()
  }

  /**
   * Clear all sessions
   */
  public clearAllSessions(): void {
    sessionTracker.clearAllSessions()
  }

  /**
   * Manual cleanup of inactive sessions
   */
  public cleanupInactiveSessions(): void {
    sessionTracker.cleanupInactiveSessions(this.config.maxInactivityTime)
  }

  /**
   * Check if session exists
   */
  public hasSession(sessionId: string): boolean {
    return sessionTracker.hasSession(sessionId)
  }

  /**
   * Get session age in milliseconds
   */
  public getSessionAge(sessionId: string): number | null {
    const timestamp = sessionIdGenerator.extractTimestamp(sessionId)
    if (!timestamp) {
      return null
    }
    
    return Date.now() - timestamp.getTime()
  }

  /**
   * Get session inactivity time in milliseconds
   */
  public getSessionInactivityTime(sessionId: string): number | null {
    const session = sessionTracker.getSession(sessionId)
    if (!session) {
      return null
    }
    
    return Date.now() - session.lastActivity.getTime()
  }

  /**
   * Check if session is expired
   */
  public isSessionExpired(sessionId: string): boolean {
    const inactivityTime = this.getSessionInactivityTime(sessionId)
    if (inactivityTime === null) {
      return true
    }
    
    return inactivityTime > this.config.maxInactivityTime
  }

  /**
   * Cleanup on destroy
   */
  public destroy(): void {
    this.stopCleanupInterval()
    this.clearAllSessions()
  }
}

// Export singleton instance
export const sessionStateManager = SessionStateManager.getInstance()

// Export utility functions for common operations
export const sessionUtils = {
  /**
   * Create a new single chat session
   */
  createSingleSession: (model: ChatModel | null, conversationId?: string) => 
    sessionStateManager.createSingleSession(model, conversationId),

  /**
   * Create a new comparison chat session
   */
  createComparisonSession: (
    leftModel: ChatModel | null, 
    rightModel: ChatModel | null, 
    conversationId?: string
  ) => sessionStateManager.createComparisonSession(leftModel, rightModel, conversationId),

  /**
   * Handle single model change
   */
  handleSingleModelChange: (
    currentSessionId: string,
    newModel: ChatModel | null,
    onReset?: () => void
  ) => sessionStateManager.handleSingleModelChange(currentSessionId, newModel, onReset),

  /**
   * Handle comparison model change
   */
  handleComparisonModelChange: (
    currentSessionId: string,
    newLeftModel: ChatModel | null,
    newRightModel: ChatModel | null,
    onReset?: () => void
  ) => sessionStateManager.handleComparisonModelChange(
    currentSessionId, 
    newLeftModel, 
    newRightModel, 
    onReset
  ),

  /**
   * Update session activity
   */
  updateActivity: (sessionId: string) => sessionStateManager.updateSessionActivity(sessionId),

  /**
   * Reset session
   */
  resetSession: (sessionId: string, reason: string, onReset?: () => void) => 
    sessionStateManager.resetSession(sessionId, reason, onReset),

  /**
   * Get session state
   */
  getSessionState: (sessionId: string) => sessionStateManager.getSessionState(sessionId),

  /**
   * Check if session is expired
   */
  isSessionExpired: (sessionId: string) => sessionStateManager.isSessionExpired(sessionId)
}