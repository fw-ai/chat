"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const env = process.env
import { ExternalLink, Zap, Eye, EyeOff } from "lucide-react"

interface UpgradePromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rateLimitMessage?: string
  onApiKeySave: (apiKey: string) => void
  onRateLimitReset?: () => void
}

export function UpgradePromptDialog({
  open,
  onOpenChange,
  rateLimitMessage,
  onApiKeySave,
  onRateLimitReset
}: UpgradePromptDialogProps) {
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)

  // Fireworks API key validation regex: fw_ followed by 24 alphanumeric characters
  const isValidApiKeyFormat = (key: string): boolean => {
    const fireworksApiKeyRegex = /^fw_[a-zA-Z0-9]{24}$/
    return fireworksApiKeyRegex.test(key)
  }

  const isValidKey = apiKey.trim().length > 0 && isValidApiKeyFormat(apiKey.trim())

  const handleGetApiKey = () => {
    window.open(`${env.NEXT_PUBLIC_FIREWORKS_APP_URL}/settings/users/api-keys`, "_blank", "noopener,noreferrer")
  }

  const handleSaveApiKey = () => {
    if (isValidKey) {
      onApiKeySave(apiKey.trim())
      onRateLimitReset?.() // Reset rate limit state
      onOpenChange(false)
      setApiKey("") // Clear the input for security
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValidKey) {
      handleSaveApiKey()
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={() => {}}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Daily limit exceeded
          </AlertDialogTitle>
          <AlertDialogDescription>
            You've reached your free message limit for today.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Content outside of description to avoid HTML nesting issues */}
        <div className="space-y-4 px-6">
          <div>
            <strong>Add your Fireworks API Key to continue:</strong>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <Label htmlFor="api-key-input">API Key</Label>
            <div className="relative">
              <Input
                id="api-key-input"
                type={showApiKey ? "text" : "password"}
                placeholder="fw_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyPress={handleKeyPress}
                className={`w-full pr-10 ${apiKey.trim().length > 0 && !isValidKey ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                autoFocus
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
                </Button>
              )}
            </div>
            {apiKey.trim().length > 0 && !isValidKey && (
              <div className="text-xs text-destructive">
                Invalid format. API key must be 27 characters: fw_ + 24 alphanumeric characters
              </div>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <strong>With a Fireworks API Key you get:</strong>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>Unlimited messages</li>
              <li>Advanced features like speed tests</li>
              <li>Priority support</li>
            </ul>
            <div className="mt-2">
              API keys are free to create and you only pay for what you use.
            </div>
          </div>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            onClick={handleGetApiKey}
            variant="outline"
            className="w-full sm:w-auto"
          >
            Get Free API Key
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
          <AlertDialogAction asChild className="w-full sm:w-auto">
            <Button
              onClick={handleSaveApiKey}
              disabled={!isValidKey}
              className="bg-[#6720ff] hover:bg-[#5a1ce6] disabled:opacity-50"
            >
              Continue with API Key
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
