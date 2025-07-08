"use client"

import { useState, useEffect, useCallback } from "react"
import { sessionStateManager } from "@/lib/session-state"
import type { SessionEvent, SessionState } from "@/types/session"
import type { ChatModel } from "@/types/chat"

/**
 * Custom hook for managing session state and events
 * Provides a React interface to the session management system
 */
export function useSessionManager() {
  const [currentSessions, setCurrentSessions] = useState<SessionState[]>([])
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize session manager and event listeners
  useEffect(() => {
    const handleSessionEvent = (event: SessionEvent) => {
      setSessionEvents(prev => [...prev, event])
      
      // Update current sessions list
      setCurrentSessions(sessionStateManager.getActiveSessions())
    }

    // Set up event listener
    sessionStateManager.addEventListener(handleSessionEvent)
    
    // Initialize current sessions
    setCurrentSessions(sessionStateManager.getActiveSessions())
    setIsInitialized(true)

    // Cleanup on unmount
    return () => {
      sessionStateManager.removeEventListener(handleSessionEvent)
    }
  }, [])

  // Create a new single chat session
  const createSingleSession = useCallback(
    (model: ChatModel | null, conversationId?: string) => {
      return sessionStateManager.createSingleSession(model, conversationId)
    },
    []
  )

  // Create a new comparison chat session
  const createComparisonSession = useCallback(
    (leftModel: ChatModel | null, rightModel: ChatModel | null, conversationId?: string) => {
      return sessionStateManager.createComparisonSession(leftModel, rightModel, conversationId)
    },
    []
  )

  // Handle single model change
  const handleSingleModelChange = useCallback(
    (currentSessionId: string, newModel: ChatModel | null, onReset?: () => void) => {
      return sessionStateManager.handleSingleModelChange(currentSessionId, newModel, onReset)
    },
    []
  )

  // Handle comparison model change
  const handleComparisonModelChange = useCallback(
    (
      currentSessionId: string,
      newLeftModel: ChatModel | null,
      newRightModel: ChatModel | null,
      onReset?: () => void
    ) => {
      return sessionStateManager.handleComparisonModelChange(
        currentSessionId,
        newLeftModel,
        newRightModel,
        onReset
      )
    },
    []
  )

  // Reset a session
  const resetSession = useCallback(
    (sessionId: string, reason: string, onReset?: () => void) => {
      sessionStateManager.resetSession(sessionId, reason, onReset)
    },
    []
  )

  // Get session state
  const getSessionState = useCallback(
    (sessionId: string) => {
      return sessionStateManager.getSessionState(sessionId)
    },
    []
  )

  // Update session activity
  const updateSessionActivity = useCallback(
    (sessionId: string) => {
      sessionStateManager.updateSessionActivity(sessionId)
    },
    []
  )

  // Activate session
  const activateSession = useCallback(
    (sessionId: string) => {
      sessionStateManager.activateSession(sessionId)
    },
    []
  )

  // Deactivate session
  const deactivateSession = useCallback(
    (sessionId: string) => {
      sessionStateManager.deactivateSession(sessionId)
    },
    []
  )

  // Destroy session
  const destroySession = useCallback(
    (sessionId: string) => {
      sessionStateManager.destroySession(sessionId)
    },
    []
  )

  // Check if session exists
  const hasSession = useCallback(
    (sessionId: string) => {
      return sessionStateManager.hasSession(sessionId)
    },
    []
  )

  // Get session count
  const getSessionCount = useCallback(() => {
    return sessionStateManager.getSessionCount()
  }, [])

  // Clear all sessions
  const clearAllSessions = useCallback(() => {
    sessionStateManager.clearAllSessions()
  }, [])

  // Get recent events
  const getRecentEvents = useCallback(
    (count: number = 10) => {
      return sessionEvents.slice(-count)
    },
    [sessionEvents]
  )

  // Clear session events
  const clearSessionEvents = useCallback(() => {
    setSessionEvents([])
  }, [])

  // Get configuration
  const getConfig = useCallback(() => {
    return sessionStateManager.getConfig()
  }, [])

  // Update configuration
  const updateConfig = useCallback(
    (config: Partial<Parameters<typeof sessionStateManager.updateConfig>[0]>) => {
      sessionStateManager.updateConfig(config)
    },
    []
  )

  // Get session age
  const getSessionAge = useCallback(
    (sessionId: string) => {
      return sessionStateManager.getSessionAge(sessionId)
    },
    []
  )

  // Get session inactivity time
  const getSessionInactivityTime = useCallback(
    (sessionId: string) => {
      return sessionStateManager.getSessionInactivityTime(sessionId)
    },
    []
  )

  // Check if session is expired
  const isSessionExpired = useCallback(
    (sessionId: string) => {
      return sessionStateManager.isSessionExpired(sessionId)
    },
    []
  )

  // Manual cleanup of inactive sessions
  const cleanupInactiveSessions = useCallback(() => {
    sessionStateManager.cleanupInactiveSessions()
  }, [])

  // Utility functions
  const sessionUtils = {
    // Get active sessions count
    getActiveSessionCount: () => currentSessions.length,
    
    // Get sessions by type
    getSessionsByType: (type: 'single' | 'comparison') => {
      return currentSessions.filter(session => {
        const sessionType = sessionStateManager.getSessionState(session.id)
        return sessionType && session.modelHash?.startsWith(type)
      })
    },
    
    // Get most recent session
    getMostRecentSession: () => {
      if (currentSessions.length === 0) return null
      return currentSessions.reduce((latest, current) => 
        current.lastActivity > latest.lastActivity ? current : latest
      )
    },
    
    // Get session statistics
    getSessionStats: () => {
      const total = currentSessions.length
      const active = currentSessions.filter(s => s.isActive).length
      const inactive = total - active
      const singleSessions = currentSessions.filter(s => s.modelHash?.startsWith('single')).length
      const comparisonSessions = currentSessions.filter(s => s.modelHash?.startsWith('comparison')).length
      
      return {
        total,
        active,
        inactive,
        singleSessions,
        comparisonSessions
      }
    },
    
    // Get event statistics
    getEventStats: () => {
      const total = sessionEvents.length
      const eventTypes = sessionEvents.reduce((acc, event) => {
        acc[event.type] = (acc[event.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      return {
        total,
        eventTypes
      }
    }
  }

  return {
    // State
    currentSessions,
    sessionEvents,
    isInitialized,
    
    // Session management
    createSingleSession,
    createComparisonSession,
    handleSingleModelChange,
    handleComparisonModelChange,
    resetSession,
    getSessionState,
    updateSessionActivity,
    activateSession,
    deactivateSession,
    destroySession,
    hasSession,
    getSessionCount,
    clearAllSessions,
    
    // Event management
    getRecentEvents,
    clearSessionEvents,
    
    // Configuration
    getConfig,
    updateConfig,
    
    // Session utilities
    getSessionAge,
    getSessionInactivityTime,
    isSessionExpired,
    cleanupInactiveSessions,
    
    // Utility functions
    sessionUtils,
    
    // Direct access to session manager (for advanced use cases)
    sessionManager: sessionStateManager
  }
}

// Type for the hook return value
export type UseSessionManagerReturn = ReturnType<typeof useSessionManager>