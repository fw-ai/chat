"use client"

import { useState } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatInterface } from "@/components/chat-interface"
import { ComparisonInterface } from "@/components/comparison-interface"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

export type ViewType = "single" | "comparison"

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>("single")
  const [speedTestEnabled, setSpeedTestEnabled] = useState(false)
  const [concurrency, setConcurrency] = useState(1)

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar 
        currentView={currentView} 
        onViewChange={setCurrentView}
        speedTestEnabled={speedTestEnabled}
        onSpeedTestToggle={setSpeedTestEnabled}
        concurrency={concurrency}
        onConcurrencyChange={setConcurrency}
      />
      <SidebarInset>
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-end w-full">
              <div 
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg border cursor-pointer hover:bg-muted/80 transition-colors ml-auto"
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
            <ChatInterface />
          ) : (
            <ComparisonInterface 
              speedTestEnabled={speedTestEnabled}
              concurrency={concurrency}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
