"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { Message, ChatModel, ChatState } from "@/types/chat"
import { apiClient } from "@/lib/api-client"

export function useChat(model?: ChatModel) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
  })
  const [conversationId, setConversationId] = useState<string | undefined>()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [state.messages, scrollToBottom])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !model) return

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
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
      }

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }))

      try {
        const stream = await apiClient.sendSingleChat({
          message: content.trim(),
          model: model.id,
          conversation_id: conversationId,
        })

        let fullContent = ""
        for await (const chunk of apiClient.streamResponse(stream)) {
          fullContent += chunk
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: fullContent } : msg,
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
    [model, conversationId],
  )

  const clearChat = useCallback(() => {
    setState({
      messages: [],
      isLoading: false,
      error: null,
    })
    setConversationId(undefined)
  }, [])

  return {
    ...state,
    sendMessage,
    clearChat,
    messagesEndRef,
  }
}
