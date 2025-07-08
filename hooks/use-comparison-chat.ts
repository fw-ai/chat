"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { Message, ChatModel, ComparisonChatState, SpeedTestResults } from "@/types/chat"
import { apiClient } from "@/lib/api-client"
import { parseThinkingContent } from "@/lib/thinking-parser"

export function useComparisonChat(leftModel?: ChatModel, rightModel?: ChatModel, speedTestEnabled = false, concurrency = 1) {
  const [state, setState] = useState<ComparisonChatState>({
    leftChat: { messages: [], isLoading: false, error: null },
    rightChat: { messages: [], isLoading: false, error: null },
    leftModel: leftModel || { id: "", name: "", provider: "" },
    rightModel: rightModel || { id: "", name: "", provider: "" },
  })
  const [conversationId, setConversationId] = useState<string | undefined>()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [state.leftChat.messages, state.rightChat.messages, scrollToBottom])

  useEffect(() => {
    if (leftModel) {
      setState((prev) => ({ ...prev, leftModel }))
    }
  }, [leftModel])

  useEffect(() => {
    if (rightModel) {
      setState((prev) => ({ ...prev, rightModel }))
    }
  }, [rightModel])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !leftModel || !rightModel) return

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      }

      setState((prev) => ({
        ...prev,
        leftChat: {
          ...prev.leftChat,
          messages: [...prev.leftChat.messages, userMessage],
          isLoading: true,
          error: null,
        },
        rightChat: {
          ...prev.rightChat,
          messages: [...prev.rightChat.messages, userMessage],
          isLoading: true,
          error: null,
        },
      }))

      const leftAssistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        model: leftModel.name,
        isStreaming: true,
      }

      const rightAssistantMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        model: rightModel.name,
        isStreaming: true,
      }

      setState((prev) => ({
        ...prev,
        leftChat: {
          ...prev.leftChat,
          messages: [...prev.leftChat.messages, leftAssistantMessage],
        },
        rightChat: {
          ...prev.rightChat,
          messages: [...prev.rightChat.messages, rightAssistantMessage],
        },
      }))

      try {
        const stream = await apiClient.sendCompareChat({
          message: content.trim(),
          model1: leftModel.id,
          model2: rightModel.id,
          conversation_id: conversationId,
          speed_test: speedTestEnabled,
          concurrency: speedTestEnabled ? concurrency : undefined,
        })

        let leftContent = ""
        let rightContent = ""
        let speedTestResults: SpeedTestResults | undefined
        let speedTestError: string | undefined
        const startTime = Date.now()
        
        for await (const data of apiClient.streamCompareResponse(stream)) {
          if (data.model1_response) {
            leftContent += data.model1_response
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
          if (data.model2_response) {
            rightContent += data.model2_response
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
          if (data.speed_test_results) {
            speedTestResults = data.speed_test_results
          }
          if (data.speed_test_error) {
            speedTestError = data.speed_test_error
          }
        }

        setState((prev) => ({
          ...prev,
          leftChat: {
            ...prev.leftChat,
            messages: prev.leftChat.messages.map((msg) => 
              msg.id === leftAssistantMessage.id ? { ...msg, isStreaming: false } : msg
            ),
            isLoading: false,
          },
          rightChat: {
            ...prev.rightChat,
            messages: prev.rightChat.messages.map((msg) => 
              msg.id === rightAssistantMessage.id ? { ...msg, isStreaming: false } : msg
            ),
            isLoading: false,
          },
          speedTestResults: speedTestResults,
          speedTestError: speedTestError,
        }))
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
    [leftModel, rightModel, conversationId, speedTestEnabled, concurrency],
  )

  const clearChat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      leftChat: { messages: [], isLoading: false, error: null },
      rightChat: { messages: [], isLoading: false, error: null },
      speedTestResults: undefined,
      speedTestError: undefined,
    }))
    setConversationId(undefined)
  }, [])

  return {
    ...state,
    sendMessage,
    clearChat,
    messagesEndRef,
  }
}