"use client"

import type { ChatModel } from "@/types/chat"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useModels } from "@/hooks/use-models"

interface ModelSelectorProps {
  selectedModel?: ChatModel
  onModelChange: (model: ChatModel) => void
  className?: string
}

export function ModelSelector({ selectedModel, onModelChange, className }: ModelSelectorProps) {
  const { models, isLoading, error } = useModels()

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
      disabled={isLoading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? "Loading models..." : "Select a model"}>
          {selectedModel && (
            <span className="font-medium">{selectedModel.name}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <span className="font-medium">{model.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}