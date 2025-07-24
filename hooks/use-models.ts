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
// Separate caches for different function calling states
let modelsCacheAll: ChatModel[] | null = null
let modelsCacheFunctionCalling: ChatModel[] | null = null
let cacheErrorAll: string | null = null
let cacheErrorFunctionCalling: string | null = null
let isLoadingAll = false
let isLoadingFunctionCalling = false
let loadingPromiseAll: Promise<void> | null = null
let loadingPromiseFunctionCalling: Promise<void> | null = null

export function useModels(apiKey?: string, functionCallingEnabled?: boolean) {
  // Get the appropriate cache based on function calling state
  const getCache = () => {
    if (functionCallingEnabled === true) {
      return {
        cache: modelsCacheFunctionCalling,
        error: cacheErrorFunctionCalling,
        isLoading: isLoadingFunctionCalling,
        promise: loadingPromiseFunctionCalling
      }
    } else {
      return {
        cache: modelsCacheAll,
        error: cacheErrorAll,
        isLoading: isLoadingAll,
        promise: loadingPromiseAll
      }
    }
  }

  const { cache, error } = getCache()

  const [state, setState] = useState<UseModelsState>({
    models: cache || [],
    isLoading: cache === null,
    error: error,
  })

  useEffect(() => {
    let isMounted = true

    const loadModels = async () => {
      const { cache, error, isLoading, promise } = getCache()

      // If models are already cached and no error, use them
      if (cache && !error) {
        setState({
          models: cache,
          isLoading: false,
          error: null,
        })
        return
      }

      // If already loading, wait for the existing promise
      if (isLoading && promise) {
        try {
          await promise
          if (isMounted) {
            const { cache: updatedCache, error: updatedError } = getCache()
            setState({
              models: updatedCache || [],
              isLoading: false,
              error: updatedError,
            })
          }
        } catch (error) {
          // Error already handled in the loading promise
        }
        return
      }

      // Start loading
      if (functionCallingEnabled === true) {
        isLoadingFunctionCalling = true
      } else {
        isLoadingAll = true
      }

      const currentPromise = (async () => {
        try {
          setState(prev => ({ ...prev, isLoading: true, error: null }))
          // Pass function calling filter to the API
          const models = await apiClient.getModels(apiKey, functionCallingEnabled)

          // Cache the results in the appropriate cache
          if (functionCallingEnabled === true) {
            modelsCacheFunctionCalling = models
            cacheErrorFunctionCalling = null
          } else {
            modelsCacheAll = models
            cacheErrorAll = null
          }

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

          // Cache the error in the appropriate cache
          if (functionCallingEnabled === true) {
            cacheErrorFunctionCalling = errorMessage
            modelsCacheFunctionCalling = []
          } else {
            cacheErrorAll = errorMessage
            modelsCacheAll = []
          }

          if (isMounted) {
            setState({
              models: [],
              isLoading: false,
              error: errorMessage,
            })
          }
        } finally {
          if (functionCallingEnabled === true) {
            isLoadingFunctionCalling = false
            loadingPromiseFunctionCalling = null
          } else {
            isLoadingAll = false
            loadingPromiseAll = null
          }
        }
      })()

      // Store the promise in the appropriate variable
      if (functionCallingEnabled === true) {
        loadingPromiseFunctionCalling = currentPromise
      } else {
        loadingPromiseAll = currentPromise
      }

      await currentPromise
    }

    loadModels()

    return () => {
      isMounted = false
    }
  }, [functionCallingEnabled]) // Add functionCallingEnabled as dependency

  return state
}
