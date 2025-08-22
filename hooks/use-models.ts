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
// Cache with keys that include OpenAI API key state
interface CacheEntry {
  models: ChatModel[]
  error: string | null
  isLoading: boolean
  promise: Promise<void> | null
}

const modelCache = new Map<string, CacheEntry>()

// Generate cache key based on function calling state and OpenAI key presence
function getCacheKey(functionCallingEnabled?: boolean, hasOpenAiKey?: boolean): string {
  return `fc:${functionCallingEnabled || false}-openai:${hasOpenAiKey || false}`
}

export function useModels(apiKey?: string, functionCallingEnabled?: boolean, openaiApiKey?: string) {
  const hasOpenAiKey = Boolean(openaiApiKey?.trim())
  const cacheKey = getCacheKey(functionCallingEnabled, hasOpenAiKey)

  // Get or create cache entry
  const getCacheEntry = (): CacheEntry => {
    if (!modelCache.has(cacheKey)) {
      modelCache.set(cacheKey, {
        models: [],
        error: null,
        isLoading: false,
        promise: null
      })
    }
    return modelCache.get(cacheKey)!
  }

  const cacheEntry = getCacheEntry()

  const [state, setState] = useState<UseModelsState>({
    models: cacheEntry.models,
    isLoading: cacheEntry.models.length === 0 && !cacheEntry.error,
    error: cacheEntry.error,
  })

  useEffect(() => {
    let isMounted = true

    const loadModels = async () => {
      const entry = getCacheEntry()

      // If models are already cached and no error, use them
      if (entry.models.length > 0 && !entry.error) {
        setState({
          models: entry.models,
          isLoading: false,
          error: null,
        })
        return
      }

      // If already loading, wait for the existing promise
      if (entry.isLoading && entry.promise) {
        try {
          await entry.promise
          if (isMounted) {
            const updatedEntry = getCacheEntry()
            setState({
              models: updatedEntry.models,
              isLoading: false,
              error: updatedEntry.error,
            })
          }
        } catch (error) {
          // Error already handled in the loading promise
        }
        return
      }

      // Start loading
      entry.isLoading = true

      const currentPromise = (async () => {
        try {
          setState(prev => ({ ...prev, isLoading: true, error: null }))
          // Pass function calling filter to the API
          const models = await apiClient.getModels(apiKey, functionCallingEnabled, openaiApiKey)

          // Cache the results
          entry.models = models
          entry.error = null

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
          entry.error = errorMessage
          entry.models = []

          if (isMounted) {
            setState({
              models: [],
              isLoading: false,
              error: errorMessage,
            })
          }
        } finally {
          entry.isLoading = false
          entry.promise = null
        }
      })()

      // Store the promise
      entry.promise = currentPromise

      await currentPromise
    }

    loadModels()

    return () => {
      isMounted = false
    }
  }, [functionCallingEnabled, openaiApiKey]) // Add dependencies to refresh when they change

  return state
}
