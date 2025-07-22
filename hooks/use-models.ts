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
let cachedFunctionCallingState: boolean | undefined = undefined

export function useModels(apiKey?: string, functionCallingEnabled?: boolean) {
  const [state, setState] = useState<UseModelsState>({
    models: modelsCache || [],
    isLoading: modelsCache === null,
    error: cacheError,
  })

  useEffect(() => {
    let isMounted = true

    const loadModels = async () => {
      // Check if cache is valid for the current function calling filter
      const cacheIsValid = modelsCache && !cacheError &&
        cachedFunctionCallingState === functionCallingEnabled

      // If models are already cached and cache is valid for current filter, use them
      if (cacheIsValid) {
        setState({
          models: modelsCache!,
          isLoading: false,
          error: null,
        })
        return
      }

      // If already loading with the same filter, wait for the existing promise
      if (isLoadingModels && loadingPromise &&
          cachedFunctionCallingState === functionCallingEnabled) {
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
      cachedFunctionCallingState = functionCallingEnabled
      loadingPromise = (async () => {
        try {
          setState(prev => ({ ...prev, isLoading: true, error: null }))
          // Pass function calling filter to the API
          const models = await apiClient.getModels(apiKey, functionCallingEnabled)

          // Cache the results with the current filter state
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
  }, [functionCallingEnabled]) // Add functionCallingEnabled as dependency

  return state
}
