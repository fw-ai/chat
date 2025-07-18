"use client"

import { useState, useCallback } from "react"
import type { ChatModel } from "@/types/chat"

// Module-level cache for model selections
let cachedSingleModel: ChatModel | undefined = undefined
let cachedLeftModel: ChatModel | undefined = undefined
let cachedRightModel: ChatModel | undefined = undefined

export type ModelSelectionType = 'single' | 'left' | 'right'

export function useModelSelection(type: ModelSelectionType) {
  const getInitialModel = () => {
    switch (type) {
      case 'single': return cachedSingleModel
      case 'left': return cachedLeftModel
      case 'right': return cachedRightModel
    }
  }

  const [selectedModel, setSelectedModelState] = useState<ChatModel | undefined>(getInitialModel)

  const setSelectedModel = useCallback((model: ChatModel | undefined) => {
    // Update local state
    setSelectedModelState(model)

    // Update cache
    switch (type) {
      case 'single':
        cachedSingleModel = model
        break
      case 'left':
        cachedLeftModel = model
        break
      case 'right':
        cachedRightModel = model
        break
    }
  }, [type])

  return {
    selectedModel,
    setSelectedModel,
  }
}

// Utility functions to get cached models (useful for auto-selection logic)
export function getCachedModel(type: ModelSelectionType): ChatModel | undefined {
  switch (type) {
    case 'single': return cachedSingleModel
    case 'left': return cachedLeftModel
    case 'right': return cachedRightModel
  }
}

export function hasCachedModel(type: ModelSelectionType): boolean {
  return getCachedModel(type) !== undefined
}
