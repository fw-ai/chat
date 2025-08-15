"use client"

import { useEffect } from "react"
import type { ChatModel } from "@/types/chat"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useModels } from "@/hooks/use-models"

const env = process.env

interface ModelSelectorProps {
  selectedModel?: ChatModel
  onModelChange: (model: ChatModel) => void
  className?: string
  disabled?: boolean
  apiKey?: string
  functionCallingEnabled?: boolean
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  className,
  disabled = false,
  apiKey,
  functionCallingEnabled
}: ModelSelectorProps) {
  const { models, isLoading, error } = useModels(apiKey, functionCallingEnabled)

  // Handle invalid model selection when function calling filter changes
  useEffect(() => {
    if (selectedModel && models.length > 0 && !isLoading) {
      // Check if the currently selected model is still in the filtered list
      const isSelectedModelAvailable = models.some(model => model.id === selectedModel.id)

      if (!isSelectedModelAvailable) {
        // If the selected model is no longer available, auto-select the first available model
        onModelChange(models[0])
      }
    }
  }, [models, selectedModel, onModelChange, isLoading])

  if (error) {
    return (
      <div className="text-sm text-red-500">
        Failed to load models
      </div>
    )
  }

  return (
    <Select
      value={selectedModel?.id || ""}
      onValueChange={(value) => {
        const model = models.find((m) => m.id === value)
        if (model) onModelChange(model)
      }}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? "Loading models..." : "Select a model"}>
          {selectedModel && (
            <div className="flex items-center gap-2">
              {(selectedModel as any).logomark && (
                <img
                  src={`${env.NEXT_PUBLIC_FIREWORKS_APP_URL}${(selectedModel as any).logomark}`}
                  alt={`${selectedModel.name} logo`}
                  className="w-4 h-4 object-contain"
                />
              )}
              <span>{selectedModel.name}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <div className="flex items-center gap-2">
              {(model as any).logomark && (
                <img
                  src={`${env.NEXT_PUBLIC_FIREWORKS_APP_URL}${(model as any).logomark}`}
                  alt={`${model.name} logo`}
                  className="w-4 h-4 object-contain"
                />
              )}
              <span className="font-medium">{model.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
