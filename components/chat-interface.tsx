"use client"

import { useState } from "react"
import { useChat } from "@/hooks/use-chat"
import type { ChatModel } from "@/types/chat"
import { ModelSelector } from "@/components/model-selector"
import { MessageComponent } from "@/components/message"
import { ChatInput } from "@/components/chat-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Trash2 } from "lucide-react"

export function ChatInterface() {
  const [selectedModel, setSelectedModel] = useState<ChatModel | undefined>()
  const { messages, isLoading, error, sendMessage, clearChat, messagesEndRef } = useChat(selectedModel)

  const handleSendMessage = (message: string) => {
    sendMessage(message)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar with model selection only */}
      <div className="flex items-center p-4 border-b bg-background">
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          className="w-64"
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
          <div className="flex gap-2 p-4 border-t bg-background">
            <ChatInput
              onSendMessage={handleSendMessage}
              disabled={isLoading}
              placeholder={`Ask ${selectedModel?.name || 'the model'} anything...`}
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
              disabled={isLoading}
              className="self-end bg-fireworks-purple hover:bg-fireworks-purple-dark text-white border-0"
              style={{ backgroundColor: '#6b2aff' }}
            >
              Send
            </Button>
            <Button
              onClick={clearChat}
              disabled={messages.length === 0}
              variant="outline"
              size="default"
              className="self-end bg-transparent"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
