"use client"

import { useState, useEffect } from "react"
import type { ChatModel } from "@/types/chat"
import { apiClient } from "@/lib/api-client"

interface UseModelsState {
  models: ChatModel[]
  isLoading: boolean
  error: string | null
}

export function useModels() {
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

    loadModels()

    return () => {
      isMounted = false
    }
  }, [])

  return state
}