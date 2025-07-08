"use client"

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Components } from 'react-markdown'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  const components: Components = {
    // Custom code block with copy button
    code: ({ node, inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : ''
      const code = String(children).replace(/\n$/, '')
      
      if (!inline) {
        return (
          <div className="relative group">
            <div className="flex items-center justify-between bg-muted px-4 py-2 rounded-t-lg border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">
                {language || 'code'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                onClick={() => copyCode(code)}
              >
                {copiedCode === code ? (
                  <Check size={12} className="text-green-500" />
                ) : (
                  <Copy size={12} />
                )}
              </Button>
            </div>
            <pre className="bg-muted/50 rounded-b-lg p-4 overflow-x-auto">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          </div>
        )
      }
      
      return (
        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      )
    },
    
    // Custom styling for other elements
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold mb-4 text-foreground border-b border-border pb-2">
        {children}
      </h1>
    ),
    
    h2: ({ children }) => (
      <h2 className="text-xl font-semibold mb-3 text-foreground border-b border-border pb-1">
        {children}
      </h2>
    ),
    
    h3: ({ children }) => (
      <h3 className="text-lg font-semibold mb-2 text-foreground">
        {children}
      </h3>
    ),
    
    h4: ({ children }) => (
      <h4 className="text-base font-semibold mb-2 text-foreground">
        {children}
      </h4>
    ),
    
    h5: ({ children }) => (
      <h5 className="text-sm font-semibold mb-2 text-foreground">
        {children}
      </h5>
    ),
    
    h6: ({ children }) => (
      <h6 className="text-xs font-semibold mb-2 text-foreground">
        {children}
      </h6>
    ),
    
    p: ({ children }) => (
      <p className="mb-3 text-foreground leading-relaxed">
        {children}
      </p>
    ),
    
    ul: ({ children }) => (
      <ul className="list-disc pl-6 mb-3 space-y-1">
        {children}
      </ul>
    ),
    
    ol: ({ children }) => (
      <ol className="list-decimal pl-6 mb-3 space-y-1">
        {children}
      </ol>
    ),
    
    li: ({ children }) => (
      <li className="text-foreground">
        {children}
      </li>
    ),
    
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-primary pl-4 py-2 mb-3 bg-muted/50 rounded-r-lg">
        {children}
      </blockquote>
    ),
    
    table: ({ children }) => (
      <div className="overflow-x-auto mb-3">
        <table className="min-w-full border-collapse border border-border">
          {children}
        </table>
      </div>
    ),
    
    th: ({ children }) => (
      <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">
        {children}
      </th>
    ),
    
    td: ({ children }) => (
      <td className="border border-border px-3 py-2">
        {children}
      </td>
    ),
    
    a: ({ children, href }) => (
      <a
        href={href}
        className="text-primary hover:underline font-medium"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    
    strong: ({ children }) => (
      <strong className="font-bold text-foreground">
        {children}
      </strong>
    ),
    
    em: ({ children }) => (
      <em className="italic text-foreground">
        {children}
      </em>
    ),
    
    hr: () => (
      <hr className="my-6 border-border" />
    ),
  }

  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}