"use client"

import type { ChatModel } from "@/types/chat"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ModelSelectorProps {
  models: ChatModel[]
  selectedModel: ChatModel
  onModelChange: (model: ChatModel) => void
  className?: string
}

const AVAILABLE_MODELS: ChatModel[] = [
  { id: "llama-4-maverick", name: "Llama 4 Maverick", provider: "Meta" },
  { id: "llama-4-scout", name: "Llama 4 Scout", provider: "Meta" },
  { id: "dv3", name: "DV3", provider: "Deepseek" },
  { id: "qwen3-235b-a22b", name: "Qwen3 235B-A22B", provider: "Alibaba" },
]

export function ModelSelector({ selectedModel, onModelChange, className }: ModelSelectorProps) {
  return (
    <Select
      value={selectedModel.id}
      onValueChange={(value) => {
        const model = AVAILABLE_MODELS.find((m) => m.id === value)
        if (model) onModelChange(model)
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select a model">
          <div className="flex items-center gap-2">
            <span className="font-medium">{selectedModel.name}</span>
            <span className="text-xs text-muted-foreground">({selectedModel.provider})</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {AVAILABLE_MODELS.map((model) => (
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

export { AVAILABLE_MODELS }