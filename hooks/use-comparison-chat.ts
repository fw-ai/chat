"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { Message, ChatModel, ComparisonChatState, SpeedTestResults, LiveMetrics } from "@/types/chat"
import { apiClient, type RateLimitErrorInfo } from "@/lib/api-client"
import { parseThinkingContent } from "@/lib/thinking-parser"
import { sessionStateManager } from "@/lib/session-state"
import { chatPersistenceManager } from "@/lib/chat-persistence"
import { useRateLimit } from "@/hooks/use-rate-limit"

export function useComparisonChat(leftModel?: ChatModel, rightModel?: ChatModel, speedTestEnabled = false, concurrency = 1, apiKey?: string, functionDefinitions?: any[]) {
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

  // Rate limiting hook
  const {
    rateLimitInfo,
    showUpgradePrompt,
    handleApiResponse,
    handleRateLimitError,
    dismissUpgradePrompt,
    resetRateLimit,
  } = useRateLimit()

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

  // Track active requests for cleanup
  const activeRequestsRef = useRef<{left?: AbortController, right?: AbortController}>({})

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(activeRequestsRef.current).forEach(controller => {
        if (controller) controller.abort()
      })
    }
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      // Basic validation - no longer require API key for free tier
      if (!content.trim() || !leftModel || !rightModel || !state.sessionId) return

      // Fireworks API key validation regex: fw_ followed by 24 alphanumeric characters
      const isValidApiKeyFormat = (key: string): boolean => {
        const fireworksApiKeyRegex = /^fw_[a-zA-Z0-9]{24}$/
        return fireworksApiKeyRegex.test(key)
      }

      const hasValidApiKey = apiKey?.trim() && isValidApiKeyFormat(apiKey.trim())

      // Clear any previous rate limit info when starting a new request
      if (rateLimitInfo?.isRateLimited) {
        resetRateLimit()
      }


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

      // OPTIMISTIC UI UPDATE: Show user messages and loading state immediately
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
        // Background tasks and comparison initialization
        const backgroundTasks = async () => {
          // Check rate limit in background (skip if API key is provided)
          if (!hasValidApiKey) {
            try {
              await apiClient.countMessage()
              console.log("Rate limit check passed for comparison")
            } catch (error) {
              // Handle rate limit errors specifically
              const rateLimitError = error as Error & Partial<RateLimitErrorInfo>

              if (rateLimitError.isRateLimit) {
                const errorMessage = rateLimitError.message || 'Daily limit exceeded'
                setState((prev) => ({
                  ...prev,
                  leftChat: {
                    ...prev.leftChat,
                    messages: prev.leftChat.messages.map((msg) =>
                      msg.id === leftAssistantMessage.id
                        ? { ...msg, error: "Daily limit exceeded", isStreaming: false, content: "" }
                        : msg,
                    ),
                    isLoading: false,
                    error: null
                  },
                  rightChat: {
                    ...prev.rightChat,
                    messages: prev.rightChat.messages.map((msg) =>
                      msg.id === rightAssistantMessage.id
                        ? { ...msg, error: "Daily limit exceeded", isStreaming: false, content: "" }
                        : msg,
                    ),
                    isLoading: false,
                    error: null
                  },
                }))

                // Handle rate limit error with the rate limit hook
                const mockHeaders = new Headers({
                  'X-RateLimit-Limit-IP': rateLimitError.headers?.ipLimit?.toString() || '10',
                  'X-RateLimit-Remaining-IP': rateLimitError.headers?.ipRemaining?.toString() || '0',
                  'X-RateLimit-Limit-Prefix': rateLimitError.headers?.prefixLimit?.toString() || '50',
                  'X-RateLimit-Remaining-Prefix': rateLimitError.headers?.prefixRemaining?.toString() || '0',
                })

                const mockResponse = {
                  status: 429,
                  headers: mockHeaders,
                  json: async () => ({ detail: errorMessage })
                } as unknown as Response

                await handleRateLimitError(mockResponse)
                return false // Exit early - don't proceed with chat request
              } else {
                // Log other errors but continue with chat request
                console.error("Rate limit check failed, but continuing:", error)
              }
            }
          }

          // Update session activity
          sessionStateManager.updateSessionActivity(state.sessionId)
          return true
        }

        // Step 1: Initialize comparison session
        const messages = [{
          role: userMessage.role,
          content: userMessage.content
        }]

        // Run background tasks and comparison init in parallel
        const [shouldProceed, comparisonInit] = await Promise.all([
          backgroundTasks(),
          apiClient.initializeComparison({
            messages,
            model_keys: [leftModel.id, rightModel.id],
            function_definitions: functionDefinitions,
            apiKey: hasValidApiKey ? apiKey : undefined, // Pass API key if valid, otherwise undefined for free tier
          })
        ])

        if (!shouldProceed) {
          return // Exit early if rate limited
        }

        // Update state with comparison ID
        setState(prev => ({
          ...prev,
          comparisonId: comparisonInit.comparison_id,
        }))

        const comparisonId = comparisonInit.comparison_id

        // Step 2: Start parallel model streams + optional metrics stream
        const streamPromises: Promise<void>[] = []

        // Create abort controllers for cleanup
        const leftAbortController = new AbortController()
        const rightAbortController = new AbortController()
        activeRequestsRef.current = { left: leftAbortController, right: rightAbortController }

        // Stream for left model
        const leftStreamPromise = (async () => {
          try {
            const leftStream = await apiClient.sendSingleChat({
              messages,
              model: leftModel.id,
              conversation_id: state.sessionId,
              function_definitions: functionDefinitions,
              apiKey: hasValidApiKey ? apiKey : undefined,
            }, comparisonId, leftAbortController.signal)

            let leftContent = ""
            let leftToolCalls: any[] = []
            const startTime = Date.now()

            // Parse SSE stream manually to handle different message types
            const reader = leftStream.getReader()
            const decoder = new TextDecoder()
            let leftStreamCompleted = false

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
                      leftStreamCompleted = true
                      break
                    }

                    try {
                      const parsed = JSON.parse(data)

                      // Handle different SSE message types
                      if (parsed.type === 'content' && parsed.content) {
                        // Regular content
                        leftContent += parsed.content
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
                                    tool_calls: leftToolCalls.length > 0 ? leftToolCalls : msg.tool_calls,
                                  }
                                : msg,
                            ),
                          },
                        }))
                      } else if (parsed.type === 'tool_calls' && parsed.tool_calls) {
                        // Tool calls received
                        leftToolCalls = parsed.tool_calls

                        setState((prev) => ({
                          ...prev,
                          leftChat: {
                            ...prev.leftChat,
                            messages: prev.leftChat.messages.map((msg) =>
                              msg.id === leftAssistantMessage.id
                                ? { ...msg, tool_calls: leftToolCalls }
                                : msg,
                            ),
                          },
                        }))
                      } else if (parsed.type === 'done') {
                        // Stream finished
                        leftStreamCompleted = true
                        break
                      } else if (parsed.type === 'error') {
                        throw new Error(parsed.error || 'Unknown error')
                      }
                    } catch (e) {
                      console.warn('Failed to parse left SSE data:', data)
                    }
                  }
                }

                if (leftStreamCompleted) break
              }

              // Mark left model as done BEFORE cleanup
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
            } finally {
              reader.releaseLock()
              leftAbortController.abort() // Ensure cleanup
              activeRequestsRef.current.left = undefined
            }
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
              function_definitions: functionDefinitions,
              apiKey: hasValidApiKey ? apiKey : undefined,
            }, comparisonId, rightAbortController.signal)

            let rightContent = ""
            let rightToolCalls: any[] = []
            const startTime = Date.now()

            // Parse SSE stream manually to handle different message types
            const reader = rightStream.getReader()
            const decoder = new TextDecoder()
            let rightStreamCompleted = false

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
                      rightStreamCompleted = true
                      break
                    }

                    try {
                      const parsed = JSON.parse(data)

                      // Handle different SSE message types
                      if (parsed.type === 'content' && parsed.content) {
                        // Regular content
                        rightContent += parsed.content
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
                                    tool_calls: rightToolCalls.length > 0 ? rightToolCalls : msg.tool_calls,
                                  }
                                : msg,
                            ),
                          },
                        }))
                      } else if (parsed.type === 'tool_calls' && parsed.tool_calls) {
                        // Tool calls received
                        rightToolCalls = parsed.tool_calls

                        setState((prev) => ({
                          ...prev,
                          rightChat: {
                            ...prev.rightChat,
                            messages: prev.rightChat.messages.map((msg) =>
                              msg.id === rightAssistantMessage.id
                                ? { ...msg, tool_calls: rightToolCalls }
                                : msg,
                            ),
                          },
                        }))
                      } else if (parsed.type === 'done') {
                        // Stream finished
                        rightStreamCompleted = true
                        break
                      } else if (parsed.type === 'error') {
                        throw new Error(parsed.error || 'Unknown error')
                      }
                    } catch (e) {
                      console.warn('Failed to parse right SSE data:', data)
                    }
                  }
                }

                if (rightStreamCompleted) break
              }

              // Mark right model as done BEFORE cleanup
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
            } finally {
              reader.releaseLock()
              rightAbortController.abort() // Ensure cleanup
              activeRequestsRef.current.right = undefined
            }
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
                apiKey: hasValidApiKey ? apiKey : undefined,
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

        // Final cleanup
        activeRequestsRef.current = {}

      } catch (error) {
        // Handle rate limit errors specifically
        const rateLimitError = error as Error & Partial<RateLimitErrorInfo>

        if (rateLimitError.isRateLimit) {
          const errorMessage = rateLimitError.message || 'Daily limit exceeded'
          setState((prev) => ({
            ...prev,
            leftChat: {
              ...prev.leftChat,
              messages: prev.leftChat.messages.map((msg) =>
                msg.id === leftAssistantMessage.id
                  ? { ...msg, error: "Daily limit exceeded", isStreaming: false, content: "" }
                  : msg,
              ),
              isLoading: false,
              // Don't set error in state for rate limits - modal handles it
              error: null,
            },
            rightChat: {
              ...prev.rightChat,
              messages: prev.rightChat.messages.map((msg) =>
                msg.id === rightAssistantMessage.id
                  ? { ...msg, error: "Daily limit exceeded", isStreaming: false, content: "" }
                  : msg,
              ),
              isLoading: false,
              // Don't set error in state for rate limits - modal handles it
              error: null,
            },
          }))

          // Handle rate limit error with the rate limit hook
          const mockHeaders = new Headers({
            'X-RateLimit-Limit-IP': rateLimitError.headers?.ipLimit?.toString() || '5',
            'X-RateLimit-Remaining-IP': rateLimitError.headers?.ipRemaining?.toString() || '0',
            'X-RateLimit-Limit-Prefix': rateLimitError.headers?.prefixLimit?.toString() || '50',
            'X-RateLimit-Remaining-Prefix': rateLimitError.headers?.prefixRemaining?.toString() || '0',
          })

          const mockResponse = {
            status: 429,
            headers: mockHeaders,
            json: async () => ({ detail: errorMessage })
          } as unknown as Response

          await handleRateLimitError(mockResponse)
        } else {
          // Log other errors (not rate limit errors)
          console.error("Failed to send comparison message:", error)

          // Handle other errors
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
      }
    },
    [leftModel, rightModel, conversationId, speedTestEnabled, concurrency, state.sessionId, apiKey, functionDefinitions, rateLimitInfo, resetRateLimit, handleRateLimitError],
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

  // Clear error state (used when API key is added after rate limit)
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      leftChat: {
        ...prev.leftChat,
        error: null
      },
      rightChat: {
        ...prev.rightChat,
        error: null
      }
    }))
  }, [])

  return {
    ...state,
    sendMessage,
    clearChat,
    messagesEndRef,
    // Rate limiting information
    rateLimitInfo,
    showUpgradePrompt,
    dismissUpgradePrompt,
    resetRateLimit,
    clearError,
  }
}
