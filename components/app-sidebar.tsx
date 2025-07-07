"use client"

import { MessageSquare, GitCompare, Plus, ChevronLeft, ChevronRight, Rocket } from "lucide-react"
import Image from "next/image"
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

export type ViewType = "single" | "comparison"

interface AppSidebarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  speedTestEnabled?: boolean
  onSpeedTestToggle?: (enabled: boolean) => void
  concurrency?: number
  onConcurrencyChange?: (concurrency: number) => void
}

export function AppSidebar({ 
  currentView, 
  onViewChange, 
  speedTestEnabled = false, 
  onSpeedTestToggle, 
  concurrency = 1, 
  onConcurrencyChange 
}: AppSidebarProps) {
  const { open, setOpen } = useSidebar()

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
        <SidebarGroup>
          {open && <SidebarGroupLabel>Chat Options</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => onViewChange(item.id)}
                    isActive={currentView === item.id}
                    tooltip={item.title}
                  >
                    <item.icon />
                    {open && <span>{item.title}</span>}
                  </SidebarMenuButton>
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
      <SidebarRail />
    </Sidebar>
  )
}
