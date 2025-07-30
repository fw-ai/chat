"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { Message, ChatModel, ChatState } from "@/types/chat"
import { apiClient } from "@/lib/api-client"
import { parseThinkingContent } from "@/lib/thinking-parser"
import { sessionStateManager } from "@/lib/session-state"
import { chatPersistenceManager } from "@/lib/chat-persistence"

export function useChat(model?: ChatModel, apiKey?: string, functionDefinitions?: any[]) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    sessionId: undefined,
    lastModelHash: undefined,
  })
  const [conversationId, setConversationId] = useState<string | undefined>()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [state.messages, scrollToBottom])

  // Handle model changes and session management
  useEffect(() => {
    if (!model) return

    // Create new session if none exists
    if (!state.sessionId) {
      const session = sessionStateManager.createSingleSession(model, conversationId)

      // Load persisted messages for this model
      const persistedMessages = chatPersistenceManager.getSingleChat(model)

      setState(prev => ({
        ...prev,
        sessionId: session.id,
        lastModelHash: session.modelHash,
        messages: persistedMessages, // Restore persisted messages
      }))
      return
    }

    // Handle model change
    const result = sessionStateManager.handleSingleModelChange(
      state.sessionId,
      model,
      () => {
        // Reset callback - clear when model changes (don't persist across model changes)
        setState(prev => ({
          ...prev,
          messages: [], // Start fresh with new model
          isLoading: false,
          error: null,
        }))
        setConversationId(undefined)
      }
    )

    // Update session ID and model hash if changed
    if (result.sessionId !== state.sessionId) {
      setState(prev => ({
        ...prev,
        sessionId: result.sessionId,
      }))
    }

    // Update model hash
    const session = sessionStateManager.getSessionState(result.sessionId)
    if (session && session.modelHash !== state.lastModelHash) {
      setState(prev => ({
        ...prev,
        lastModelHash: session.modelHash,
      }))
    }
  }, [model, state.sessionId, state.lastModelHash, conversationId, state.messages])

  // Save messages whenever they change
  useEffect(() => {
    if (model && state.messages.length > 0) {
      chatPersistenceManager.saveSingleChat(model, state.messages)
    }
  }, [model, state.messages])

  // Handle page refresh detection
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.sessionId) {
        sessionStateManager.resetSession(state.sessionId, 'page_refresh')
      }
      // Save current messages before page unload
      if (model && state.messages.length > 0) {
        chatPersistenceManager.saveSingleChat(model, state.messages)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state.sessionId, model, state.messages])

  // Track active requests for cleanup
  const activeRequestRef = useRef<AbortController | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeRequestRef.current) {
        activeRequestRef.current.abort()
      }
    }
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      // Fireworks API key validation regex: fw_ followed by 24 alphanumeric characters
      const isValidApiKeyFormat = (key: string): boolean => {
        const fireworksApiKeyRegex = /^fw_[a-zA-Z0-9]{24}$/
        return fireworksApiKeyRegex.test(key)
      }

      const hasValidApiKey = apiKey?.trim() && isValidApiKeyFormat(apiKey.trim())

      if (!content.trim() || !model || !state.sessionId || !hasValidApiKey) return

      // Update session activity
      sessionStateManager.updateSessionActivity(state.sessionId)

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
        sessionId: state.sessionId,
      }

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
      }))

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        model: model.name,
        isStreaming: true,
        sessionId: state.sessionId,
      }

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }))

      // Create abort controller for cleanup
      const abortController = new AbortController()
      activeRequestRef.current = abortController
      
      try {
        // Send only the new user message - backend will manage conversation history
        const messages = [{
          role: userMessage.role,
          content: userMessage.content
        }]

        const stream = await apiClient.sendSingleChat({
          messages,
          model: model.id,
          conversation_id: state.sessionId, // Use session ID for conversation continuity
          function_definitions: functionDefinitions,
          apiKey: apiKey!, // Safe to use ! since we checked hasValidApiKey above
        }, undefined, abortController.signal)

        let fullContent = ""
        let toolCalls: any[] = []
        const startTime = Date.now()

        // We need to parse the SSE stream manually to handle different message types
        const reader = stream.getReader()
        const decoder = new TextDecoder()
        let streamCompleted = false

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
                if (data === '[DONE]') {
                  streamCompleted = true
                  break
                }

                try {
                  const parsed = JSON.parse(data)

                  // Handle different SSE message types
                  if (parsed.type === 'content' && parsed.content) {
                    // Regular content
                    fullContent += parsed.content
                    const contentParsed = parseThinkingContent(fullContent, startTime)

                    setState((prev) => ({
                      ...prev,
                      messages: prev.messages.map((msg) =>
                        msg.id === assistantMessage.id
                          ? {
                              ...msg,
                              content: contentParsed.content,
                              thinking: contentParsed.thinking,
                              thinkingTime: contentParsed.thinkingTime,
                              tool_calls: toolCalls.length > 0 ? toolCalls : msg.tool_calls,
                            }
                          : msg,
                      ),
                    }))
                  } else if (parsed.type === 'tool_calls' && parsed.tool_calls) {
                    // Tool calls received
                    toolCalls = parsed.tool_calls

                    setState((prev) => ({
                      ...prev,
                      messages: prev.messages.map((msg) =>
                        msg.id === assistantMessage.id
                          ? { ...msg, tool_calls: toolCalls }
                          : msg,
                      ),
                    }))
                  } else if (parsed.type === 'done') {
                    // Stream finished
                    streamCompleted = true
                    break
                  } else if (parsed.type === 'error') {
                    throw new Error(parsed.error || 'Unknown error')
                  }
                } catch (e) {
                  console.warn('Failed to parse SSE data:', data)
                }
              }
            }
            
            if (streamCompleted) break
          }

          // Mark stream as completed BEFORE cleanup
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, isStreaming: false } : msg
            ),
            isLoading: false,
          }))
        } finally {
          reader.releaseLock()
          abortController.abort() // Ensure cleanup
          activeRequestRef.current = null
        }
      } catch (error) {
        console.error("Failed to send message:", error)
        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, error: "Failed to generate response", isStreaming: false, content: "" }
              : msg,
          ),
          isLoading: false,
          error: "Failed to send message. Please try again.",
        }))
      }
    },
    [model, conversationId, state.sessionId, apiKey, functionDefinitions],
  )

  const clearChat = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      isLoading: false,
      error: null,
    }))
    setConversationId(undefined)

    // Clear persisted messages for this model
    if (model) {
      chatPersistenceManager.clearSingleChat(model)
    }

    // Reset session if it exists
    if (state.sessionId) {
      sessionStateManager.resetSession(state.sessionId, 'manual_clear')
    }
  }, [state.sessionId, model])

  return {
    ...state,
    sendMessage,
    clearChat,
    messagesEndRef,
  }
}
