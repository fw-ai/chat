"use client"

import { useState, useEffect } from "react"
import type { ChatModel } from "@/types/chat"
import { apiClient } from "@/lib/api-client"

interface UseModelsState {
  models: ChatModel[]
  isLoading: boolean
  error: string | null
}

// Module-level cache to persist models across component unmounts/remounts
let modelsCache: ChatModel[] | null = null
let cacheError: string | null = null
let isLoadingModels = false
let loadingPromise: Promise<void> | null = null

export function useModels(apiKey?: string) {
  const [state, setState] = useState<UseModelsState>({
    models: modelsCache || [],
    isLoading: modelsCache === null,
    error: cacheError,
  })

  useEffect(() => {
    let isMounted = true

    const loadModels = async () => {
      // If models are already cached and no error, use them
      if (modelsCache && !cacheError) {
        setState({
          models: modelsCache,
          isLoading: false,
          error: null,
        })
        return
      }

      // If already loading, wait for the existing promise
      if (isLoadingModels && loadingPromise) {
        try {
          await loadingPromise
          if (isMounted) {
            setState({
              models: modelsCache || [],
              isLoading: false,
              error: cacheError,
            })
          }
        } catch (error) {
          // Error already handled in the loading promise
        }
        return
      }

      // Start loading
      isLoadingModels = true
      loadingPromise = (async () => {
        try {
          setState(prev => ({ ...prev, isLoading: true, error: null }))
          // Note: /models endpoint doesn't require authentication, it just returns available models from config
          const models = await apiClient.getModels()

          // Cache the results
          modelsCache = models
          cacheError = null

          if (isMounted) {
            setState({
              models,
              isLoading: false,
              error: null,
            })
          }
        } catch (error) {
          console.error("Failed to load models:", error)
          const errorMessage = "Failed to load models"

          // Cache the error
          cacheError = errorMessage
          modelsCache = []

          if (isMounted) {
            setState({
              models: [],
              isLoading: false,
              error: errorMessage,
            })
          }
        } finally {
          isLoadingModels = false
          loadingPromise = null
        }
      })()

      await loadingPromise
    }

    loadModels()

    return () => {
      isMounted = false
    }
  }, []) // Removed apiKey dependency since models endpoint doesn't need it

  return state
}
