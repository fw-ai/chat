"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import type { FunctionDefinition } from "@/types/chat"
import { FUNCTION_TEMPLATES, getDefaultFunctions } from "@/lib/function-templates"

interface FunctionDefinitionModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (functions: FunctionDefinition[]) => void
  initialFunctions?: FunctionDefinition[]
}

export function FunctionDefinitionModal({
  isOpen,
  onClose,
  onSave,
  initialFunctions
}: FunctionDefinitionModalProps) {
  const [jsonValue, setJsonValue] = useState(() => {
    const initial = initialFunctions || getDefaultFunctions()
    return JSON.stringify(initial, null, 2)
  })
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")

  const validateJson = (value: string): { isValid: boolean; functions?: FunctionDefinition[]; error?: string } => {
    try {
      const parsed = JSON.parse(value)

      // Check if it's an array
      if (!Array.isArray(parsed)) {
        return { isValid: false, error: "JSON must be an array of function definitions" }
      }

      // Validate each function definition
      for (let i = 0; i < parsed.length; i++) {
        const func = parsed[i]
        if (!func.name || typeof func.name !== 'string') {
          return { isValid: false, error: `Function at index ${i} is missing a valid name` }
        }
        if (!func.description || typeof func.description !== 'string') {
          return { isValid: false, error: `Function "${func.name}" is missing a valid description` }
        }
        if (!func.parameters || typeof func.parameters !== 'object') {
          return { isValid: false, error: `Function "${func.name}" is missing parameters object` }
        }
        if (func.parameters.type !== 'object') {
          return { isValid: false, error: `Function "${func.name}" parameters must have type "object"` }
        }
        if (!func.parameters.properties || typeof func.parameters.properties !== 'object') {
          return { isValid: false, error: `Function "${func.name}" is missing parameters.properties object` }
        }
      }

      return { isValid: true, functions: parsed }
    } catch (error) {
      return { isValid: false, error: `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  const handleJsonChange = (value: string) => {
    setJsonValue(value)
    const validation = validateJson(value)
    setJsonError(validation.isValid ? null : validation.error || "Invalid JSON")
  }

  const handleTemplateSelect = (templateName: string) => {
    if (!templateName) return

    const template = FUNCTION_TEMPLATES.find(t => t.name === templateName)
    if (template) {
      const formattedJson = JSON.stringify(template.functions, null, 2)
      setJsonValue(formattedJson)
      setJsonError(null)
      setSelectedTemplate(templateName)
    }
  }

  const handleSave = () => {
    const validation = validateJson(jsonValue)
    if (validation.isValid && validation.functions) {
      onSave(validation.functions)
      onClose()
    }
  }

  const handleCancel = () => {
    // Reset to initial state
    const initial = initialFunctions || getDefaultFunctions()
    setJsonValue(JSON.stringify(initial, null, 2))
    setJsonError(null)
    setSelectedTemplate("")
    onClose()
  }

  const validation = validateJson(jsonValue)
  const isValid = validation.isValid

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Define Available Functions</DialogTitle>
          <DialogDescription>
            Configure the functions that models can call. Use the dropdown to load examples or edit the JSON directly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {/* Template Selector */}
          <div className="space-y-2">
            <Label htmlFor="template-select">Load Example Functions</Label>
            <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
              <SelectTrigger id="template-select">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {FUNCTION_TEMPLATES.map((template) => (
                  <SelectItem key={template.name} value={template.name}>
                    {template.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* JSON Editor */}
          <div className="space-y-2 flex-1 flex flex-col">
            <Label htmlFor="functions-json">Function Definitions (JSON)</Label>
            <div className="flex-1 relative">
              <Textarea
                id="functions-json"
                value={jsonValue}
                onChange={(e) => handleJsonChange(e.target.value)}
                className="font-mono text-sm min-h-[300px] resize-none"
                placeholder="Enter function definitions in JSON format..."
              />
            </div>
          </div>

          {/* Validation Status */}
          {jsonError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{jsonError}</AlertDescription>
            </Alert>
          ) : isValid ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                JSON is valid! Found {validation.functions?.length} function definition(s).
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Function Preview */}
          {isValid && validation.functions && (
            <div className="space-y-2">
              <Label>Functions Preview</Label>
              <div className="flex flex-wrap gap-2">
                {validation.functions.map((func, index) => (
                  <Badge key={index} variant="secondary">
                    {func.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            Save Functions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
