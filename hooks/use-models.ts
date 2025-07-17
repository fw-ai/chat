"use client"

import { useState, useEffect } from "react"
import type { ChatModel } from "@/types/chat"
import { apiClient } from "@/lib/api-client"

interface UseModelsState {
  models: ChatModel[]
  isLoading: boolean
  error: string | null
}

export function useModels(apiKey?: string) {
  const [state, setState] = useState<UseModelsState>({
    models: [],
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    let isMounted = true

    const loadModels = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }))
        // Note: /models endpoint doesn't require authentication, it just returns available models from config
        const models = await apiClient.getModels()

        if (isMounted) {
          setState({
            models,
            isLoading: false,
            error: null,
          })
        }
      } catch (error) {
        console.error("Failed to load models:", error)
        if (isMounted) {
          setState({
            models: [],
            isLoading: false,
            error: "Failed to load models",
          })
        }
      }
    }

    // Always load models since /models endpoint is public
    loadModels()

    return () => {
      isMounted = false
    }
  }, []) // Removed apiKey dependency since models endpoint doesn't need it

  return state
}
