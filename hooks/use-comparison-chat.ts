"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { Message, ChatModel, ComparisonChatState, SpeedTestResults, LiveMetrics } from "@/types/chat"
import { apiClient } from "@/lib/api-client"
import { parseThinkingContent } from "@/lib/thinking-parser"
import { sessionStateManager } from "@/lib/session-state"
import { chatPersistenceManager } from "@/lib/chat-persistence"

export function useComparisonChat(leftModel?: ChatModel, rightModel?: ChatModel, speedTestEnabled = false, concurrency = 1, apiKey?: string) {
  const [state, setState] = useState<ComparisonChatState>({
    leftChat: { messages: [], isLoading: false, error: null },
    rightChat: { messages: [], isLoading: false, error: null },
    leftModel: leftModel || { id: "", name: "", provider: "" },
    rightModel: rightModel || { id: "", name: "", provider: "" },
    sessionId: undefined,
    lastModelHash: undefined,
    comparisonId: undefined,  // NEW: Track comparison ID
  })
  const [conversationId, setConversationId] = useState<string | undefined>()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [state.leftChat.messages, state.rightChat.messages, scrollToBottom])

  // Handle model changes and session management
  useEffect(() => {
    if (!leftModel || !rightModel) return

    // Create new session if none exists
    if (!state.sessionId) {
      const session = sessionStateManager.createComparisonSession(leftModel, rightModel, conversationId)

      // Load persisted messages for this model combination
      const persistedChat = chatPersistenceManager.getComparisonChat(leftModel, rightModel)

      setState(prev => ({
        ...prev,
        sessionId: session.id,
        lastModelHash: session.modelHash,
        leftModel,
        rightModel,
        comparisonId: undefined, // Reset comparison ID on new session
        leftChat: {
          messages: persistedChat.leftMessages,
          isLoading: false,
          error: null
        },
        rightChat: {
          messages: persistedChat.rightMessages,
          isLoading: false,
          error: null
        },
      }))
      return
    }

    // Handle model change
    const result = sessionStateManager.handleComparisonModelChange(
      state.sessionId,
      leftModel,
      rightModel,
      () => {
        // Reset callback - clear when models change (don't persist across model changes)
        setState(prev => ({
          ...prev,
          leftChat: {
            messages: [], // Start fresh with new models
            isLoading: false,
            error: null
          },
          rightChat: {
            messages: [], // Start fresh with new models
            isLoading: false,
            error: null
          },
          speedTestResults: undefined,
          speedTestError: undefined,
          liveMetrics: undefined,
          comparisonId: undefined, // Reset comparison ID on model change
        }))
        setConversationId(undefined)
      }
    )

    // Update session ID and model hash if changed
    if (result.sessionId !== state.sessionId) {
      setState(prev => ({
        ...prev,
        sessionId: result.sessionId,
        comparisonId: undefined, // Reset comparison ID on session change
      }))
    }

    // Update model hash and models
    const session = sessionStateManager.getSessionState(result.sessionId)
    if (session && session.modelHash !== state.lastModelHash) {
      setState(prev => ({
        ...prev,
        lastModelHash: session.modelHash,
        leftModel,
        rightModel,
      }))
    }
  }, [leftModel, rightModel, state.sessionId, state.lastModelHash, conversationId])

  // Save messages whenever they change
  useEffect(() => {
    if (leftModel && rightModel && (state.leftChat.messages.length > 0 || state.rightChat.messages.length > 0)) {
      chatPersistenceManager.saveComparisonChat(
        leftModel,
        rightModel,
        state.leftChat.messages,
        state.rightChat.messages
      )
    }
  }, [leftModel, rightModel, state.leftChat.messages, state.rightChat.messages])

  // Handle page refresh detection
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.sessionId) {
        sessionStateManager.resetSession(state.sessionId, 'page_refresh')
      }
      // Save current messages before page unload
      if (leftModel && rightModel && (state.leftChat.messages.length > 0 || state.rightChat.messages.length > 0)) {
        chatPersistenceManager.saveComparisonChat(
          leftModel,
          rightModel,
          state.leftChat.messages,
          state.rightChat.messages
        )
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state.sessionId, leftModel, rightModel, state.leftChat.messages, state.rightChat.messages])

  const sendMessage = useCallback(
    async (content: string) => {
      // Fireworks API key validation regex: fw_ followed by 24 alphanumeric characters
      const isValidApiKeyFormat = (key: string): boolean => {
        const fireworksApiKeyRegex = /^fw_[a-zA-Z0-9]{24}$/
        return fireworksApiKeyRegex.test(key)
      }

      const hasValidApiKey = apiKey?.trim() && isValidApiKeyFormat(apiKey.trim())

      if (!content.trim() || !leftModel || !rightModel || !state.sessionId || !hasValidApiKey) return

      // Update session activity
      sessionStateManager.updateSessionActivity(state.sessionId)

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
        sessionId: state.sessionId,
      }

      // Create assistant messages for both models
      const leftAssistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        model: leftModel.name,
        isStreaming: true,
        sessionId: state.sessionId,
      }

      const rightAssistantMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        model: rightModel.name,
        isStreaming: true,
        sessionId: state.sessionId,
      }

      setState((prev) => ({
        ...prev,
        leftChat: {
          ...prev.leftChat,
          messages: [...prev.leftChat.messages, userMessage, leftAssistantMessage],
          isLoading: true,
          error: null,
        },
        rightChat: {
          ...prev.rightChat,
          messages: [...prev.rightChat.messages, userMessage, rightAssistantMessage],
          isLoading: true,
          error: null,
        },
        speedTestError: undefined,
      }))

      try {
        // NEW ARCHITECTURE: 3-step flow

        // Step 1: Initialize comparison session
        const messages = [{
          role: userMessage.role,
          content: userMessage.content
        }]

        const comparisonInit = await apiClient.initializeComparison({
          messages,
          model_keys: [leftModel.id, rightModel.id],
          apiKey: apiKey!,
        })

        // Update state with comparison ID
        setState(prev => ({
          ...prev,
          comparisonId: comparisonInit.comparison_id,
        }))

        const comparisonId = comparisonInit.comparison_id

        // Step 2: Start parallel model streams + optional metrics stream
        const streamPromises: Promise<void>[] = []

        // Stream for left model
        const leftStreamPromise = (async () => {
          try {
            const leftStream = await apiClient.sendSingleChat({
              messages,
              model: leftModel.id,
              conversation_id: state.sessionId,
              apiKey: apiKey!,
            }, comparisonId)

            let leftContent = ""
            const startTime = Date.now()

            for await (const chunk of apiClient.streamResponse(leftStream)) {
              leftContent += chunk
              const leftParsed = parseThinkingContent(leftContent, startTime)
              setState((prev) => ({
                ...prev,
                leftChat: {
                  ...prev.leftChat,
                  messages: prev.leftChat.messages.map((msg) =>
                    msg.id === leftAssistantMessage.id
                      ? {
                          ...msg,
                          content: leftParsed.content,
                          thinking: leftParsed.thinking,
                          thinkingTime: leftParsed.thinkingTime,
                        }
                      : msg,
                  ),
                },
              }))
            }

            // Mark left model as done
            setState((prev) => ({
              ...prev,
              leftChat: {
                ...prev.leftChat,
                messages: prev.leftChat.messages.map((msg) =>
                  msg.id === leftAssistantMessage.id ? { ...msg, isStreaming: false } : msg
                ),
                isLoading: false,
              },
            }))
          } catch (error) {
            console.error("Left model stream error:", error)
            setState((prev) => ({
              ...prev,
              leftChat: {
                ...prev.leftChat,
                messages: prev.leftChat.messages.map((msg) =>
                  msg.id === leftAssistantMessage.id
                    ? { ...msg, error: "Failed to generate response", isStreaming: false, content: "" }
                    : msg,
                ),
                isLoading: false,
                error: "Left model failed to respond",
              },
            }))
          }
        })()

        // Stream for right model
        const rightStreamPromise = (async () => {
          try {
            const rightStream = await apiClient.sendSingleChat({
              messages,
              model: rightModel.id,
              conversation_id: state.sessionId,
              apiKey: apiKey!,
            }, comparisonId)

            let rightContent = ""
            const startTime = Date.now()

            for await (const chunk of apiClient.streamResponse(rightStream)) {
              rightContent += chunk
              const rightParsed = parseThinkingContent(rightContent, startTime)
              setState((prev) => ({
                ...prev,
                rightChat: {
                  ...prev.rightChat,
                  messages: prev.rightChat.messages.map((msg) =>
                    msg.id === rightAssistantMessage.id
                      ? {
                          ...msg,
                          content: rightParsed.content,
                          thinking: rightParsed.thinking,
                          thinkingTime: rightParsed.thinkingTime,
                        }
                      : msg,
                  ),
                },
              }))
            }

            // Mark right model as done
            setState((prev) => ({
              ...prev,
              rightChat: {
                ...prev.rightChat,
                messages: prev.rightChat.messages.map((msg) =>
                  msg.id === rightAssistantMessage.id ? { ...msg, isStreaming: false } : msg
                ),
                isLoading: false,
              },
            }))
          } catch (error) {
            console.error("Right model stream error:", error)
            setState((prev) => ({
              ...prev,
              rightChat: {
                ...prev.rightChat,
                messages: prev.rightChat.messages.map((msg) =>
                  msg.id === rightAssistantMessage.id
                    ? { ...msg, error: "Failed to generate response", isStreaming: false, content: "" }
                    : msg,
                ),
                isLoading: false,
                error: "Right model failed to respond",
              },
            }))
          }
        })()

        streamPromises.push(leftStreamPromise, rightStreamPromise)

        // Step 3: Optional metrics stream (if speed test enabled)
        if (speedTestEnabled) {
          const metricsStreamPromise = (async () => {
            try {
              const metricsStream = await apiClient.streamMetrics({
                model_keys: [leftModel.id, rightModel.id],
                comparison_id: comparisonId,
                concurrency: speedTestEnabled ? concurrency : undefined,
                apiKey: apiKey!,
              })

              let lastMetricsUpdate = 0 // Track last metrics update time for throttling

              for await (const data of apiClient.streamMetricsResponse(metricsStream)) {
                if (data.type === 'live_metrics' && data.metrics) {
                  // Throttle metrics updates to reduce re-renders (update every 50ms max for responsiveness)
                  if (!lastMetricsUpdate || Date.now() - lastMetricsUpdate > 50) {
                    setState((prev) => ({
                      ...prev,
                      liveMetrics: data.metrics,
                    }))
                    lastMetricsUpdate = Date.now()
                  }
                } else if (data.type === 'speed_test_results' && data.results) {
                  setState((prev) => ({
                    ...prev,
                    speedTestResults: data.results,
                  }))
                } else if (data.type === 'error') {
                  console.error('Metrics stream error:', data.error)
                  setState((prev) => ({
                    ...prev,
                    speedTestError: data.error,
                  }))
                }
              }
            } catch (error) {
              console.error("Metrics stream error:", error)
              setState((prev) => ({
                ...prev,
                speedTestError: "Failed to load performance metrics",
              }))
            }
          })()

          streamPromises.push(metricsStreamPromise)
        }

        // Wait for all streams to complete
        await Promise.allSettled(streamPromises)

      } catch (error) {
        console.error("Failed to send comparison message:", error)
        setState((prev) => ({
          ...prev,
          leftChat: {
            ...prev.leftChat,
            messages: prev.leftChat.messages.map((msg) =>
              msg.id === leftAssistantMessage.id
                ? { ...msg, error: "Failed to generate response", isStreaming: false, content: "" }
                : msg,
            ),
            isLoading: false,
            error: "Failed to send message. Please try again.",
          },
          rightChat: {
            ...prev.rightChat,
            messages: prev.rightChat.messages.map((msg) =>
              msg.id === rightAssistantMessage.id
                ? { ...msg, error: "Failed to generate response", isStreaming: false, content: "" }
                : msg,
            ),
            isLoading: false,
            error: "Failed to send message. Please try again.",
          },
        }))
      }
    },
    [leftModel, rightModel, conversationId, speedTestEnabled, concurrency, state.sessionId, apiKey],
  )

  const clearChat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      leftChat: { messages: [], isLoading: false, error: null },
      rightChat: { messages: [], isLoading: false, error: null },
      speedTestResults: undefined,
      speedTestError: undefined,
      liveMetrics: undefined,
      comparisonId: undefined, // Reset comparison ID on clear
    }))
    setConversationId(undefined)

    // Clear persisted messages for this model combination
    if (leftModel && rightModel) {
      chatPersistenceManager.clearComparisonChat(leftModel, rightModel)
    }

    // Reset session if it exists
    if (state.sessionId) {
      sessionStateManager.resetSession(state.sessionId, 'manual_clear')
    }
  }, [state.sessionId, leftModel, rightModel])

  return {
    ...state,
    sendMessage,
    clearChat,
    messagesEndRef,
  }
}
