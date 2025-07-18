"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { Message, ChatModel, ChatState } from "@/types/chat"
import { apiClient } from "@/lib/api-client"
import { parseThinkingContent } from "@/lib/thinking-parser"
import { sessionStateManager } from "@/lib/session-state"

export function useChat(model?: ChatModel, apiKey?: string) {
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
      setState(prev => ({
        ...prev,
        sessionId: session.id,
        lastModelHash: session.modelHash,
      }))
      return
    }

    // Handle model change
    const result = sessionStateManager.handleSingleModelChange(
      state.sessionId,
      model,
      () => {
        // Reset callback - clear messages and conversation
        setState(prev => ({
          ...prev,
          messages: [],
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
  }, [model, state.sessionId, state.lastModelHash, conversationId])

  // Handle page refresh detection
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.sessionId) {
        sessionStateManager.resetSession(state.sessionId, 'page_refresh')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state.sessionId])

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
          apiKey: apiKey!, // Safe to use ! since we checked hasValidApiKey above
        })

        let fullContent = ""
        const startTime = Date.now()
        for await (const chunk of apiClient.streamResponse(stream)) {
          fullContent += chunk
          const parsed = parseThinkingContent(fullContent, startTime)

          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
              msg.id === assistantMessage.id
                ? {
                    ...msg,
                    content: parsed.content,
                    thinking: parsed.thinking,
                    thinkingTime: parsed.thinkingTime,
                  }
                : msg,
            ),
          }))
        }

        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, isStreaming: false } : msg
          ),
          isLoading: false,
        }))
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
    [model, conversationId, state.sessionId, apiKey],
  )

  const clearChat = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      isLoading: false,
      error: null,
    }))
    setConversationId(undefined)

    // Reset session if it exists
    if (state.sessionId) {
      sessionStateManager.resetSession(state.sessionId, 'manual_clear')
    }
  }, [state.sessionId])

  return {
    ...state,
    sendMessage,
    clearChat,
    messagesEndRef,
  }
}
