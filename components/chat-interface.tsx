"use client"

import { useState, useEffect } from "react"
import { useChat } from "@/hooks/use-chat"
import type { ChatModel } from "@/types/chat"
import { ModelSelector } from "@/components/model-selector"
import { MessageComponent } from "@/components/message"
import { ChatInput } from "@/components/chat-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Trash2, Info } from "lucide-react"
import { useModels } from "@/hooks/use-models"

interface ChatInterfaceProps {
  apiKey: string
}

export function ChatInterface({ apiKey }: ChatInterfaceProps) {
  const [selectedModel, setSelectedModel] = useState<ChatModel | undefined>()
  const { models, isLoading: modelsLoading } = useModels(apiKey)

  // Auto-select first model when models load
  useEffect(() => {
    if (!selectedModel && models.length > 0 && !modelsLoading) {
      setSelectedModel(models[0])
    }
  }, [models, modelsLoading, selectedModel])

  const { messages, isLoading, error, sendMessage, clearChat, messagesEndRef } = useChat(selectedModel, apiKey)

  const handleSendMessage = (message: string) => {
    if (!apiKey.trim()) {
      return
    }
    sendMessage(message)
  }

  // Fireworks API key validation regex: fw_ followed by 24 alphanumeric characters
  const isValidApiKeyFormat = (key: string): boolean => {
    const fireworksApiKeyRegex = /^fw_[a-zA-Z0-9]{24}$/
    return fireworksApiKeyRegex.test(key)
  }

  const hasApiKey = apiKey.trim().length > 0 && isValidApiKeyFormat(apiKey.trim())

  return (
    <div className="h-full flex flex-col relative">

      {/* Top bar with model selection only */}
      <div className="flex items-center p-4 border-b bg-background">
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          className="w-64"
          disabled={!hasApiKey}
        />
      </div>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col border-0 rounded-none">
        <CardContent className="flex-1 flex flex-col p-0">
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <p className="text-lg mb-2">Start a conversation</p>
                  <p className="text-sm">Ask me anything and I'll respond using {selectedModel?.name || 'the selected model'}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-0">
                {messages.map((message) => (
                  <MessageComponent key={message.id} message={message} showModel={true} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {error && <div className="p-4 bg-destructive/10 text-destructive text-sm border-t">{error}</div>}

          {/* Input area with send and clear buttons */}
          <div className="p-4 border-t bg-background">
            <div className="flex gap-2 mb-3">
              <ChatInput
                onSendMessage={handleSendMessage}
                disabled={isLoading || !hasApiKey}
                placeholder={hasApiKey ? `Ask ${selectedModel?.name || 'the model'} anything...` : "API key required to start chatting"}
                showSendButton={false}
              />
              <Button
                onClick={() => {
                  const form = document.querySelector("form")
                  if (form) {
                    const textarea = form.querySelector("textarea") as HTMLTextAreaElement
                    if (textarea && textarea.value.trim()) {
                      handleSendMessage(textarea.value)
                      textarea.value = ""
                    }
                  }
                }}
                disabled={isLoading || !hasApiKey}
                className="self-end bg-fireworks-purple hover:bg-fireworks-purple-dark text-white border-0"
                style={{ backgroundColor: '#6b2aff' }}
              >
                Send
              </Button>
              <Button
                onClick={clearChat}
                disabled={messages.length === 0 || !hasApiKey}
                variant="outline"
                size="default"
                className="self-end bg-transparent"
              >
                <Trash2 size={16} />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Info size={14} />
              <span>This app is running on our serverless platform for best performance{" "}
                <a
                  href="https://fireworks.ai/contact"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  contact us
                </a>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
