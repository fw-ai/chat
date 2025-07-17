"use client"

import { MessageSquare, GitCompare, Plus, ChevronLeft, ChevronRight, Rocket, Key, Eye, EyeOff, Info } from "lucide-react"
import Image from "next/image"
import { useState, useEffect } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

export type ViewType = "single" | "comparison"

interface AppSidebarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  speedTestEnabled?: boolean
  onSpeedTestToggle?: (enabled: boolean) => void
  concurrency?: number
  onConcurrencyChange?: (concurrency: number) => void
  apiKey?: string
  onApiKeyChange?: (apiKey: string) => void
}

export function AppSidebar({
  currentView,
  onViewChange,
  speedTestEnabled = false,
  onSpeedTestToggle,
  concurrency = 1,
  onConcurrencyChange,
  apiKey: externalApiKey = "",
  onApiKeyChange
}: AppSidebarProps) {
  const { open, setOpen } = useSidebar()
  const [internalApiKey, setInternalApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)

  // Use external API key if provided, otherwise use internal state
  const apiKey = externalApiKey || internalApiKey
  const setApiKey = onApiKeyChange || setInternalApiKey

  // Fireworks API key validation regex: fw_ followed by 24 alphanumeric characters
  const isValidApiKeyFormat = (key: string): boolean => {
    const fireworksApiKeyRegex = /^fw_[a-zA-Z0-9]{24}$/
    return fireworksApiKeyRegex.test(key)
  }

  // Clear API key from memory when page unloads for security
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!externalApiKey) {
        setInternalApiKey("")
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Clear API key from memory on component unmount
      if (!externalApiKey) {
        setInternalApiKey("")
      }
    }
  }, [externalApiKey])

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    // Note: No localStorage - keeping only in memory for security
  }

  const menuItems = [
    {
      id: "single" as ViewType,
      title: "New Chat",
      icon: Plus,
      description: "Start a new single model chat",
    },
    {
      id: "comparison" as ViewType,
      title: "Side by Side Comparison",
      icon: GitCompare,
      description: "Compare two models simultaneously",
    },
  ]

  const hasApiKey = apiKey.trim().length > 0 && isValidApiKeyFormat(apiKey.trim())
  const hasInvalidFormat = apiKey.trim().length > 0 && !isValidApiKeyFormat(apiKey.trim())

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b p-2">
        <div className="flex items-center justify-center">
          {open ? (
            <div className="flex items-center justify-between w-full px-2">
              <Image
                src="/fireworks-logo-small.png"
                alt="FireworksAI"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} className="h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Collapse sidebar</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} className="h-8 w-8 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Expand sidebar</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* API Key Section */}
        <SidebarGroup>
          {open && <SidebarGroupLabel><b>Fireworks API Key</b></SidebarGroupLabel>}
          <SidebarGroupContent>
            {open ? (
              <div className="px-2 space-y-2">
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      id="api-key"
                      type={showApiKey ? "text" : "password"}
                      placeholder="fw_..."
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      className={`w-full pr-10 ${hasInvalidFormat ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                    {apiKey.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowApiKey(!showApiKey)}
                        tabIndex={-1}
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">
                          {showApiKey ? "Hide API key" : "Show API key"}
                        </span>
                      </Button>
                    )}
                  </div>


                  {hasInvalidFormat && (
                    <p className="text-xs text-destructive">
                      Invalid format. API key must be 27 characters: fw_ + 24 alphanumeric characters
                    </p>
                  )}
                  {!hasApiKey && !hasInvalidFormat && apiKey.trim().length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Dont have an API key? Get one {" "}
                      <a
                        href="https://app.fireworks.ai/settings/users/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        here
                      </a>
                    </p>
                  )}
                  {hasApiKey && (
                    <p className="text-xs" style={{ color: '#6720ff' }}>
                      ✓ Valid API key format
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`w-full justify-center p-2 ${
                        hasApiKey ? 'text-green-600' :
                        hasInvalidFormat ? 'text-destructive' :
                        'text-muted-foreground'
                      }`}
                      onClick={() => setOpen(true)}
                    >
                      <Key className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>
                      {hasApiKey ? "API key in memory" :
                       hasInvalidFormat ? "Invalid API key format" :
                       "Set API key"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Chat Options */}
        <SidebarGroup>
          {open && <SidebarGroupLabel><b>Chat Options</b></SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        onClick={() => hasApiKey && onViewChange(item.id)}
                        isActive={currentView === item.id && hasApiKey}
                        disabled={!hasApiKey}
                        tooltip={hasApiKey ? item.title : "API key required"}
                        className={!hasApiKey ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <item.icon />
                        {open && <span>{item.title}</span>}
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    {!hasApiKey && (
                      <TooltipContent side="right">
                        <p>API key required</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Speed Test Controls - Only show for comparison mode */}
        {currentView === "comparison" && (
          <SidebarGroup>
            {open && <SidebarGroupLabel>Speed Test</SidebarGroupLabel>}
            <SidebarGroupContent>
              <div className="space-y-4 px-2">
                {/* Speed Test Toggle - Only show when sidebar is open */}
                {open && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Rocket className="h-4 w-4" />
                      <Label htmlFor="speed-test" className="text-sm">
                        Enable Speed Test
                      </Label>
                    </div>
                    <Switch
                      id="speed-test"
                      checked={speedTestEnabled}
                      onCheckedChange={onSpeedTestToggle}
                    />
                  </div>
                )}

                {/* Concurrency Selector - Only show when speed test is enabled */}
                {speedTestEnabled && open && (
                  <div className="space-y-2">
                    <Label htmlFor="concurrency" className="text-sm text-muted-foreground">
                      Concurrency
                    </Label>
                    <Select
                      value={concurrency.toString()}
                      onValueChange={(value) => onConcurrencyChange?.(parseInt(value))}
                    >
                      <SelectTrigger id="concurrency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 requests</SelectItem>
                        <SelectItem value="5">5 requests</SelectItem>
                        <SelectItem value="10">10 requests</SelectItem>
                        <SelectItem value="20">20 requests</SelectItem>
                        <SelectItem value="50">50 requests</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Number of parallel requests to send
                    </p>
                  </div>
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Security Info Icon - Bottom Left Corner */}
      <div className="absolute bottom-2 left-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <Info className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">
              <strong>Security:</strong> Your API key is stored in memory only. It will be cleared when you close/refresh this page.            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      <SidebarRail />
    </Sidebar>
  )
}
