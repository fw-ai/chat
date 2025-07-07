"use client"

import { useState } from "react"
import { useComparisonChat } from "@/hooks/use-comparison-chat"
import type { ChatModel } from "@/types/chat"
import { ModelSelector } from "@/components/model-selector"
import { MessageComponent } from "@/components/message"
import { ChatInput } from "@/components/chat-input"
import { Button } from "@/components/ui/button"
import { SpeedTestResultsComponent } from "@/components/speed-test-results"
import { TpsMetric } from "@/components/tps-metric"
import { RpsMetric } from "@/components/rps-metric"
import { TtftMetric } from "@/components/ttft-metric"
import { Trash2 } from "lucide-react"

interface ComparisonInterfaceProps {
  speedTestEnabled?: boolean
  concurrency?: number
}

export function ComparisonInterface({ speedTestEnabled = false, concurrency = 1 }: ComparisonInterfaceProps) {
  const [leftModel, setLeftModel] = useState<ChatModel | undefined>()
  const [rightModel, setRightModel] = useState<ChatModel | undefined>()

  const comparisonChat = useComparisonChat(leftModel, rightModel, speedTestEnabled, concurrency)

  const handleSendMessage = (message: string) => {
    comparisonChat.sendMessage(message)
  }

  const handleClearChats = () => {
    comparisonChat.clearChat()
  }

  const isLoading = comparisonChat.leftChat.isLoading || comparisonChat.rightChat.isLoading
  const hasMessages = comparisonChat.leftChat.messages.length > 0 || comparisonChat.rightChat.messages.length > 0

  return (
    <div className="h-full flex flex-col">
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
            />
          </div>

          {/* Left speed test indicators */}
          {speedTestEnabled && (
            <div className="px-2 py-1 bg-muted/10 border-b">
              <div className="grid grid-cols-3 gap-1">
                <TpsMetric
                  tps={comparisonChat.speedTestResults?.model1_tps || 0}
                  label={leftModel?.name || 'Model 1'}
                  isLoading={comparisonChat.leftChat.isLoading}
                />
                <RpsMetric
                  rps={comparisonChat.speedTestResults?.model1_rps || 0}
                  label={leftModel?.name || 'Model 1'}
                  isLoading={comparisonChat.leftChat.isLoading}
                />
                <TtftMetric
                  ttft={comparisonChat.speedTestResults?.model1_ttft || 0}
                  label={leftModel?.name || 'Model 1'}
                  isLoading={comparisonChat.leftChat.isLoading}
                />
              </div>
            </div>
          )}

          {/* Left chat area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {comparisonChat.leftChat.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <p className="text-sm mb-1">Responses from</p>
                    <p className="font-medium">{leftModel?.name || 'Model 1'}</p>
                    <p className="text-xs text-muted-foreground mt-1">({leftModel?.provider || 'Loading...'})</p>
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
            />
          </div>

          {/* Right speed test indicators */}
          {speedTestEnabled && (
            <div className="px-2 py-1 bg-muted/10 border-b">
              <div className="grid grid-cols-3 gap-1">
                <TpsMetric
                  tps={comparisonChat.speedTestResults?.model2_tps || 0}
                  label={rightModel?.name || 'Model 2'}
                  isLoading={comparisonChat.rightChat.isLoading}
                />
                <RpsMetric
                  rps={comparisonChat.speedTestResults?.model2_rps || 0}
                  label={rightModel?.name || 'Model 2'}
                  isLoading={comparisonChat.rightChat.isLoading}
                />
                <TtftMetric
                  ttft={comparisonChat.speedTestResults?.model2_ttft || 0}
                  label={rightModel?.name || 'Model 2'}
                  isLoading={comparisonChat.rightChat.isLoading}
                />
              </div>
            </div>
          )}

          {/* Right chat area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {comparisonChat.rightChat.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <p className="text-sm mb-1">Responses from</p>
                    <p className="font-medium">{rightModel?.name || 'Model 2'}</p>
                    <p className="text-xs text-muted-foreground mt-1">({rightModel?.provider || 'Loading...'})</p>
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


      {/* Speed Test Results */}
      {speedTestEnabled && comparisonChat.speedTestResults && (
        <div className="px-4">
          <SpeedTestResultsComponent
            results={comparisonChat.speedTestResults}
            leftModelName={leftModel?.name || 'Model 1'}
            rightModelName={rightModel?.name || 'Model 2'}
          />
        </div>
      )}

      {/* Shared input at the bottom with send and clear buttons */}
      <div className="flex gap-2 p-4 border-t bg-background">
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isLoading}
          placeholder="Send a message to compare responses from both models..."
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
          onClick={handleClearChats}
          disabled={!hasMessages}
          variant="outline"
          size="default"
          className="self-end bg-transparent"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  )
}