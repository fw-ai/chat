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
            <div className="flex items-center gap-2">
              <span className="font-medium">{selectedModel.name}</span>
              <span className="text-xs text-muted-foreground">({selectedModel.provider})</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{model.name}</span>
              <span className="text-xs text-muted-foreground">({model.provider})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}