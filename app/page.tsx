"use client"

import { useState, useCallback, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatInterface } from "@/components/chat-interface"
import { ComparisonInterface } from "@/components/comparison-interface"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import type { FunctionDefinition } from "@/types/chat"

export type ViewType = "single" | "comparison"

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>("single")
  const [speedTestEnabled, setSpeedTestEnabled] = useState(false)
  const [concurrency, setConcurrency] = useState(5)
  const [functionCallingEnabled, setFunctionCallingEnabled] = useState(false)
  const [functionDefinitions, setFunctionDefinitions] = useState<FunctionDefinition[]>([])
  const [apiKey, setApiKey] = useState("")
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const [anthropicApiKey, setAnthropicApiKey] = useState("")
  const [clearChatFn, setClearChatFn] = useState<(() => void) | null>(null)

  // Auto-disable speed test when API key is removed
  useEffect(() => {
    // Fireworks API key validation regex: fw_ followed by 24 alphanumeric characters
    const isValidApiKeyFormat = (key: string): boolean => {
      const fireworksApiKeyRegex = /^fw_[a-zA-Z0-9]{24}$/
      return fireworksApiKeyRegex.test(key)
    }

    const hasValidApiKey = apiKey?.trim() && isValidApiKeyFormat(apiKey.trim())

    // If speed test is enabled but API key is invalid/missing, disable speed test
    if (speedTestEnabled && !hasValidApiKey) {
      setSpeedTestEnabled(false)
    }
  }, [apiKey, speedTestEnabled])

  const handleSpeedTestToggle = (enabled: boolean) => {
    setSpeedTestEnabled(enabled)
    if (enabled && concurrency === 1) {
      setConcurrency(5)
    }
  }

  const handleClearChatReady = useCallback((clearFn: () => void) => {
    setClearChatFn(() => clearFn)
  }, [])

  const handleClearChat = useCallback(() => {
    if (clearChatFn) {
      clearChatFn()
    }
  }, [clearChatFn])

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        speedTestEnabled={speedTestEnabled}
        onSpeedTestToggle={handleSpeedTestToggle}
        concurrency={concurrency}
        onConcurrencyChange={setConcurrency}
        functionCallingEnabled={functionCallingEnabled}
        onFunctionCallingToggle={setFunctionCallingEnabled}
        onFunctionDefinitionsChange={setFunctionDefinitions}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        openaiApiKey={openaiApiKey}
        onOpenaiApiKeyChange={setOpenaiApiKey}
        anthropicApiKey={anthropicApiKey}
        onAnthropicApiKeyChange={setAnthropicApiKey}
      />
      <SidebarInset>
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between w-full">
              {/* Left Side (empty, Clear Chat Button removed) */}
              <div />

              {/* Powered by - Right Side */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg border cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => window.open('https://fireworks.ai', '_blank')}
              >
                <span className="text-sm font-medium text-muted-foreground">Powered by</span>
                <img src="/fireworks-logo.png" alt="Fireworks AI" className="h-5 w-auto" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          {currentView === "single" ? (
                      <ChatInterface
            apiKey={apiKey}
            functionCallingEnabled={functionCallingEnabled}
            functionDefinitions={functionDefinitions}
            onClearChatReady={handleClearChatReady}
            onApiKeySave={setApiKey}
          />
          ) : (
            <ComparisonInterface
              speedTestEnabled={speedTestEnabled}
              concurrency={concurrency}
              functionCallingEnabled={functionCallingEnabled}
              functionDefinitions={functionDefinitions}
              apiKey={apiKey}
              onClearChatReady={handleClearChatReady}
              onApiKeySave={setApiKey}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
