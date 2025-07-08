interface ThinkingParseResult {
  thinking: string
  content: string
  thinkingTime?: number
}

export function parseThinkingContent(fullContent: string, startTime?: number): ThinkingParseResult {
  // First, check for complete <think>...</think> tags
  const completeThinkingRegex = /<think>([\s\S]*?)<\/think>/
  const completeMatch = fullContent.match(completeThinkingRegex)
  
  if (completeMatch) {
    const thinking = completeMatch[1].trim()
    const content = fullContent.replace(completeThinkingRegex, "").trim()
    
    // Calculate thinking time - if we have content after thinking, it's complete
    let thinkingTime: number | undefined
    if (startTime && content.length > 0) {
      thinkingTime = (Date.now() - startTime) / 1000
    } else if (thinking.length > 0) {
      thinkingTime = Math.max(0.5, thinking.length / 150)
    }
    
    return {
      thinking,
      content,
      thinkingTime,
    }
  }
  
  // Check for incomplete thinking (opening tag without closing)
  const thinkStartIndex = fullContent.indexOf("<think>")
  if (thinkStartIndex !== -1) {
    const beforeThink = fullContent.substring(0, thinkStartIndex).trim()
    const afterThinkTag = fullContent.substring(thinkStartIndex + 7) // 7 = "<think>".length
    
    // For incomplete thinking, don't calculate final time yet
    let thinkingTime: number | undefined
    if (afterThinkTag.length > 0) {
      thinkingTime = Math.max(0.5, afterThinkTag.length / 150)
    }
    
    return {
      thinking: afterThinkTag,
      content: beforeThink,
      thinkingTime,
    }
  }
  
  // No thinking tags found
  return {
    thinking: "",
    content: fullContent,
  }
}