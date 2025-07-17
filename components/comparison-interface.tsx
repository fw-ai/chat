"use client"

import { useState, useEffect } from "react"
import { useComparisonChat } from "@/hooks/use-comparison-chat"
import type { ChatModel } from "@/types/chat"
import { ModelSelector } from "@/components/model-selector"
import { MessageComponent } from "@/components/message"
import { ChatInput } from "@/components/chat-input"
import { Button } from "@/components/ui/button"
import { ConsolidatedMetrics } from "@/components/consolidated-metrics"
import { Trash2, Info } from "lucide-react"
import { useModels } from "@/hooks/use-models"

interface ComparisonInterfaceProps {
  speedTestEnabled?: boolean
  concurrency?: number
  apiKey: string
}

export function ComparisonInterface({ speedTestEnabled = false, concurrency = 1, apiKey }: ComparisonInterfaceProps) {
  const [leftModel, setLeftModel] = useState<ChatModel | undefined>()
  const [rightModel, setRightModel] = useState<ChatModel | undefined>()
  const { models, isLoading: modelsLoading } = useModels(apiKey)

  // Auto-select first and second models when models load
  useEffect(() => {
    if (!leftModel && !rightModel && models.length > 0 && !modelsLoading) {
      setLeftModel(models[0])
      if (models.length > 1) {
        setRightModel(models[1])
      }
    }
  }, [models, modelsLoading, leftModel, rightModel])

  const comparisonChat = useComparisonChat(leftModel, rightModel, speedTestEnabled, concurrency, apiKey)

  const handleSendMessage = (message: string) => {
    if (!apiKey.trim()) {
      return
    }
    comparisonChat.sendMessage(message)
  }

  const handleClearChats = () => {
    comparisonChat.clearChat()
  }

  const isLoading = comparisonChat.leftChat.isLoading || comparisonChat.rightChat.isLoading
  const hasMessages = comparisonChat.leftChat.messages.length > 0 || comparisonChat.rightChat.messages.length > 0

  // Fireworks API key validation regex: fw_ followed by 24 alphanumeric characters
  const isValidApiKeyFormat = (key: string): boolean => {
    const fireworksApiKeyRegex = /^fw_[a-zA-Z0-9]{24}$/
    return fireworksApiKeyRegex.test(key)
  }

  const hasApiKey = apiKey.trim().length > 0 && isValidApiKeyFormat(apiKey.trim())

  return (
    <div className="h-full flex flex-col relative">

      {/* Two column layout */}
      <div className="flex-1 flex">
        {/* Left Column */}
        <div className="flex-1 flex flex-col border-r">
          {/* Left model selector */}
          <div className="p-4 border-b bg-muted/30">
            <ModelSelector
              selectedModel={leftModel}
              onModelChange={setLeftModel}
              className="w-full"
              disabled={!hasApiKey}
            />
          </div>


          {/* Left chat area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {comparisonChat.leftChat.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <p className="text-sm mb-1">Responses from</p>
                    <p className="font-medium">{leftModel?.name || 'Model 1'}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-0">
                  {comparisonChat.leftChat.messages.map((message) => (
                    <MessageComponent key={message.id} message={message} />
                  ))}
                  <div ref={comparisonChat.messagesEndRef} />
                </div>
              )}
            </div>

            {comparisonChat.leftChat.error && (
              <div className="p-4 bg-destructive/10 text-destructive text-sm border-t">{comparisonChat.leftChat.error}</div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="flex-1 flex flex-col">
          {/* Right model selector */}
          <div className="p-4 border-b bg-muted/30">
            <ModelSelector
              selectedModel={rightModel}
              onModelChange={setRightModel}
              className="w-full"
              disabled={!hasApiKey}
            />
          </div>


          {/* Right chat area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {comparisonChat.rightChat.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <p className="text-sm mb-1">Responses from</p>
                    <p className="font-medium">{rightModel?.name || 'Model 2'}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-0">
                  {comparisonChat.rightChat.messages.map((message) => (
                    <MessageComponent key={message.id} message={message} />
                  ))}
                  <div ref={comparisonChat.messagesEndRef} />
                </div>
              )}
            </div>

            {comparisonChat.rightChat.error && (
              <div className="p-4 bg-destructive/10 text-destructive text-sm border-t">{comparisonChat.rightChat.error}</div>
            )}
          </div>
        </div>
      </div>



      {/* Speed Test Error */}
      {speedTestEnabled && comparisonChat.speedTestError && (
        <div className="px-4">
          <div className="p-4 bg-destructive/10 text-destructive text-sm border border-destructive/20 rounded-md">
            <div className="flex items-center gap-2">
              <span className="font-medium">Speed Test Error:</span>
              <span>{comparisonChat.speedTestError}</span>
            </div>
          </div>
        </div>
      )}

      {/* Speed Test Metrics */}
      {speedTestEnabled && (
        <div className="px-4 py-2 bg-muted/10 border-t">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Model Metrics */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{leftModel?.name || 'Model 1'}</div>
              <ConsolidatedMetrics
                completedRequests={comparisonChat.liveMetrics?.model1_completed_requests || comparisonChat.speedTestResults?.model1_completed_requests || 0}
                totalRequests={comparisonChat.liveMetrics?.total_requests || comparisonChat.speedTestResults?.total_requests || 0}
                totalTime={comparisonChat.liveMetrics?.model1_total_time || comparisonChat.speedTestResults?.model1_total_time || 0}
                tps={comparisonChat.liveMetrics?.model1_live_tps || comparisonChat.speedTestResults?.model1_tps || 0}
                rps={comparisonChat.liveMetrics?.model1_live_rps || comparisonChat.speedTestResults?.model1_rps || 0}
                ttft={comparisonChat.liveMetrics?.model1_live_ttft || comparisonChat.speedTestResults?.model1_ttft || 0}
                isLoading={comparisonChat.leftChat.isLoading}
              />
            </div>

            {/* Right Model Metrics */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{rightModel?.name || 'Model 2'}</div>
              <ConsolidatedMetrics
                completedRequests={comparisonChat.liveMetrics?.model2_completed_requests || comparisonChat.speedTestResults?.model2_completed_requests || 0}
                totalRequests={comparisonChat.liveMetrics?.total_requests || comparisonChat.speedTestResults?.total_requests || 0}
                totalTime={comparisonChat.liveMetrics?.model2_total_time || comparisonChat.speedTestResults?.model2_total_time || 0}
                tps={comparisonChat.liveMetrics?.model2_live_tps || comparisonChat.speedTestResults?.model2_tps || 0}
                rps={comparisonChat.liveMetrics?.model2_live_rps || comparisonChat.speedTestResults?.model2_rps || 0}
                ttft={comparisonChat.liveMetrics?.model2_live_ttft || comparisonChat.speedTestResults?.model2_ttft || 0}
                isLoading={comparisonChat.rightChat.isLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Shared input at the bottom with send and clear buttons */}
      <div className="p-4 border-t bg-background">
        <div className="flex gap-2 mb-3">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isLoading || !hasApiKey}
            placeholder={hasApiKey ? "Send a message to compare responses from both models..." : "API key required to start chatting"}
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
            onClick={handleClearChats}
            disabled={!hasMessages || !hasApiKey}
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
    </div>
  )
}
