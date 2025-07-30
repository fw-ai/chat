"use client"

import { MessageSquare, GitCompare, Plus, ChevronLeft, ChevronRight, Rocket, Key, Eye, EyeOff, Info, Code } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { FunctionDefinitionModal } from "@/components/function-definition-modal"
import type { FunctionDefinition } from "@/types/chat"

export type ViewType = "single" | "comparison"

interface AppSidebarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  speedTestEnabled?: boolean
  onSpeedTestToggle?: (enabled: boolean) => void
  concurrency?: number
  onConcurrencyChange?: (concurrency: number) => void
  functionCallingEnabled?: boolean
  onFunctionCallingToggle?: (enabled: boolean) => void
  onFunctionDefinitionsChange?: (functions: any[]) => void
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
  functionCallingEnabled = false,
  onFunctionCallingToggle,
  onFunctionDefinitionsChange,
  apiKey: externalApiKey = "",
  onApiKeyChange
}: AppSidebarProps) {
  const { open, setOpen } = useSidebar()
  const [internalApiKey, setInternalApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [showFunctionModal, setShowFunctionModal] = useState(false)
  const [currentFunctions, setCurrentFunctions] = useState<FunctionDefinition[]>([])

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

  const handleFunctionCallingToggle = (enabled: boolean) => {
    if (enabled) {
      // Always show modal when trying to enable function calling
      setShowFunctionModal(true)
      // Don't change the toggle state yet - wait for modal save/cancel
    } else {
      // Disable function calling immediately when turned off
      onFunctionCallingToggle?.(false)
      setCurrentFunctions([])
      onFunctionDefinitionsChange?.([])
    }
  }

  const handleFunctionsSave = (functions: FunctionDefinition[]) => {
    setCurrentFunctions(functions)
    onFunctionDefinitionsChange?.(functions)
    onFunctionCallingToggle?.(true)
    setShowFunctionModal(false)
  }

  const handleFunctionModalClose = () => {
    setShowFunctionModal(false)
    // Don't enable function calling if modal was closed without saving
    // The toggle will remain in its previous state
  }

  const handleEditFunctions = () => {
    // Allow editing functions when already enabled
    setShowFunctionModal(true)
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

        {/* Advanced Features - Show for both single and comparison modes */}
        <SidebarGroup>
          {open && <SidebarGroupLabel>Advanced Features</SidebarGroupLabel>}
          <SidebarGroupContent>
            <div className="space-y-4 px-2">
              {/* Function Calling Toggle */}
              {open && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      <Label htmlFor="function-calling" className="text-sm">
                        Enable Function Calling
                      </Label>
                    </div>
                    <Switch
                      id="function-calling"
                      checked={functionCallingEnabled}
                      onCheckedChange={handleFunctionCallingToggle}
                      disabled={!hasApiKey}
                    />
                  </div>

                  {/* Function Preview Badges */}
                  {functionCallingEnabled && currentFunctions.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">
                          Functions ({currentFunctions.length})
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleEditFunctions}
                          className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Edit
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {currentFunctions.map((func, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {func.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Function Calling Icon for collapsed state */}
              {!open && (
                <div className="px-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`w-full justify-center p-2 ${
                          functionCallingEnabled && hasApiKey ? 'text-blue-600' : 'text-muted-foreground'
                        } ${!hasApiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => hasApiKey && setOpen(true)}
                        disabled={!hasApiKey}
                      >
                        <Code className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        {!hasApiKey ? "API key required" :
                         functionCallingEnabled ? "Function calling enabled" : "Enable function calling"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
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

      {/* Function Definition Modal */}
      <FunctionDefinitionModal
        isOpen={showFunctionModal}
        onClose={handleFunctionModalClose}
        onSave={handleFunctionsSave}
        initialFunctions={currentFunctions}
      />
    </Sidebar>
  )
}
