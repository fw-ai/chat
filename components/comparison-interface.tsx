"use client"

import { useEffect, useCallback } from "react"
import { useComparisonChat } from "@/hooks/use-comparison-chat"
import type { ChatModel } from "@/types/chat"
import { ModelSelector } from "@/components/model-selector"
import { MessageComponent } from "@/components/message"
import { ChatInput } from "@/components/chat-input"
import { Button } from "@/components/ui/button"
import { ConsolidatedMetrics } from "@/components/consolidated-metrics"
import { Trash2, Info } from "lucide-react"
import { useModels } from "@/hooks/use-models"
import { useModelSelection, hasCachedModel } from "@/hooks/use-model-selection"

import { UpgradePromptDialog } from "@/components/upgrade-prompt-dialog"

interface ComparisonInterfaceProps {
  speedTestEnabled?: boolean
  concurrency?: number
  functionCallingEnabled?: boolean
  functionDefinitions?: any[]
  apiKey: string
  onClearChatReady?: (clearChatFn: () => void) => void
  onApiKeySave?: (apiKey: string) => void
}

export function ComparisonInterface({ speedTestEnabled = false, concurrency = 1, functionCallingEnabled = false, functionDefinitions, apiKey, onClearChatReady, onApiKeySave }: ComparisonInterfaceProps) {
  const { selectedModel: leftModel, setSelectedModel: setLeftModel } = useModelSelection('left')
  const { selectedModel: rightModel, setSelectedModel: setRightModel } = useModelSelection('right')
  const { models, isLoading: modelsLoading } = useModels(apiKey, functionCallingEnabled)

  // Auto-select first and second models when models load (only if no cached selections)
  useEffect(() => {
    if (!leftModel && !rightModel && models.length > 0 && !modelsLoading &&
        !hasCachedModel('left') && !hasCachedModel('right')) {
      setLeftModel(models[0])
      if (models.length > 1) {
        setRightModel(models[1])
      }
    }
  }, [models, modelsLoading, leftModel, rightModel, setLeftModel, setRightModel])

  const comparisonChat = useComparisonChat(leftModel, rightModel, speedTestEnabled, concurrency, apiKey, functionDefinitions)
  const { rateLimitInfo, showUpgradePrompt, dismissUpgradePrompt, resetRateLimit, clearError } = comparisonChat

  // Expose clearChat function to parent component
  useEffect(() => {
    if (onClearChatReady) {
      onClearChatReady(comparisonChat.clearChat)
    }
  }, [comparisonChat.clearChat, onClearChatReady])

  const handleSendMessage = (message: string) => {
    // No longer require API key - allow free tier usage
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

  // Combined function to reset both rate limit and error state
  const handleRateLimitReset = useCallback(() => {
    resetRateLimit()
    clearError()
  }, [resetRateLimit, clearError])

  return (
    <div className="h-full flex flex-col relative">




      {/* Synchronized messages area */}
      <div className="flex-1 overflow-y-auto">
        {comparisonChat.leftChat.messages.length === 0 && comparisonChat.rightChat.messages.length === 0 ? (
          <div className="flex h-full">
            <div className="w-1/2 flex items-center justify-center border-r text-muted-foreground">
              <div className="text-center">
                <p className="text-sm mb-1">Responses from</p>
                <p className="font-medium">{leftModel?.name || 'Model 1'}</p>
              </div>
            </div>
            <div className="w-1/2 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-sm mb-1">Responses from</p>
                <p className="font-medium">{rightModel?.name || 'Model 2'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {(() => {
              // Group messages by pairs (user message + assistant responses)
              const messageGroups = []
              const maxLength = Math.max(comparisonChat.leftChat.messages.length, comparisonChat.rightChat.messages.length)

              for (let i = 0; i < maxLength; i += 2) {
                const leftUserMsg = comparisonChat.leftChat.messages[i]
                const leftAssistantMsg = comparisonChat.leftChat.messages[i + 1]
                const rightUserMsg = comparisonChat.rightChat.messages[i]
                const rightAssistantMsg = comparisonChat.rightChat.messages[i + 1]

                messageGroups.push({
                  userMessage: leftUserMsg || rightUserMsg, // They should be the same
                  leftAssistant: leftAssistantMsg,
                  rightAssistant: rightAssistantMsg
                })
              }

              return messageGroups.map((group, groupIndex) => (
                <div key={group.userMessage?.id || groupIndex} className="border-b border-muted/30">
                  {/* User message - spans full width */}
                  {group.userMessage && (
                    <div className="bg-muted/30 px-4 py-2">
                      <div className="flex justify-end">
                        <div className="max-w-[80%] space-y-2">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">
                              {group.userMessage.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="prose prose-sm max-w-none bg-fireworks-purple text-white p-3 rounded-lg">
                            <div className="whitespace-pre-wrap text-white">
                              {group.userMessage.content}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Assistant responses - side by side */}
                  <div className="flex min-h-[4rem]">
                    {/* Left model response */}
                    <div className="w-1/2 border-r" style={{ minWidth: '0' }}>
                      {group.leftAssistant ? (
                        <MessageComponent key={group.leftAssistant.id} message={group.leftAssistant} showModel={true} model={leftModel} />
                      ) : (
                        <div className="p-4 flex items-center justify-center text-muted-foreground">
                          <div className="text-sm">No response</div>
                        </div>
                      )}
                    </div>

                    {/* Right model response */}
                    <div className="w-1/2" style={{ minWidth: '0' }}>
                      {group.rightAssistant ? (
                        <MessageComponent key={group.rightAssistant.id} message={group.rightAssistant} showModel={true} model={rightModel} />
                      ) : (
                        <div className="p-4 flex items-center justify-center text-muted-foreground">
                          <div className="text-sm">No response</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            })()}
            <div ref={comparisonChat.messagesEndRef} />
          </div>
        )}

        {/* Error messages */}
        {(comparisonChat.leftChat.error || comparisonChat.rightChat.error) && !rateLimitInfo?.isRateLimited && (
          <div className="flex">
            {comparisonChat.leftChat.error && (
              <div className="w-1/2 p-4 bg-destructive/10 text-destructive text-sm border-t border-r">
                {comparisonChat.leftChat.error}
              </div>
            )}
            {comparisonChat.rightChat.error && (
              <div className="w-1/2 p-4 bg-destructive/10 text-destructive text-sm border-t">
                {comparisonChat.rightChat.error}
              </div>
            )}
          </div>
        )}
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

      {/* Model selectors and shared input at the bottom */}
      <div className="p-4 border-t bg-background">
        {/* Model selectors row */}
        <div className="flex gap-4 mb-3">
          <div className="w-1/2">
            <ModelSelector
              selectedModel={leftModel}
              onModelChange={setLeftModel}
              className="w-full"
              disabled={false}
              apiKey={apiKey}
              functionCallingEnabled={functionCallingEnabled}
            />
          </div>
          <div className="w-1/2">
            <ModelSelector
              selectedModel={rightModel}
              onModelChange={setRightModel}
              className="w-full"
              disabled={false}
              apiKey={apiKey}
              functionCallingEnabled={functionCallingEnabled}
            />
          </div>
        </div>

        {/* Input area with send and clear buttons */}
        <div className="flex gap-2 mb-3">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isLoading || (rateLimitInfo?.isRateLimited ?? false)}
            placeholder={
              rateLimitInfo?.isRateLimited
                ? "Rate limit reached. Get a free API key for unlimited access!"
                : "Send a message to compare responses from both models..."
            }
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
            disabled={isLoading || (rateLimitInfo?.isRateLimited ?? false)}
            className="self-end bg-fireworks-purple hover:bg-fireworks-purple-dark text-white border-0"
            style={{ backgroundColor: '#6b2aff' }}
          >
            Send
          </Button>
          <Button
            onClick={handleClearChats}
            disabled={!hasMessages}
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

      {/* Upgrade prompt dialog */}
      <UpgradePromptDialog
        open={showUpgradePrompt}
        onOpenChange={dismissUpgradePrompt}
        rateLimitMessage={rateLimitInfo?.rateLimitMessage}
        onApiKeySave={onApiKeySave || (() => {})}
        onRateLimitReset={handleRateLimitReset}
      />
    </div>
  )
}
