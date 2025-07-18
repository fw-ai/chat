"use client"

import type { ChatModel, Message, ChatState, ComparisonChatState } from "@/types/chat"

// Define the structure for persisted chat data
interface PersistedSingleChat {
  messages: Message[]
  modelId: string
  lastUpdated: number
}

interface PersistedComparisonChat {
  leftChat: { messages: Message[] }
  rightChat: { messages: Message[] }
  leftModelId: string
  rightModelId: string
  lastUpdated: number
}

// Module-level storage for chat persistence (cleared on page refresh)
let persistedSingleChats: Map<string, PersistedSingleChat> = new Map()
let persistedComparisonChats: Map<string, PersistedComparisonChat> = new Map()

// Generate keys for storage
const generateSingleChatKey = (modelId: string): string => {
  return `single_${modelId}`
}

const generateComparisonChatKey = (leftModelId: string, rightModelId: string): string => {
  // Sort model IDs to ensure consistent key regardless of order
  const sortedIds = [leftModelId, rightModelId].sort()
  return `comparison_${sortedIds[0]}_${sortedIds[1]}`
}

export class ChatPersistenceManager {
  private static instance: ChatPersistenceManager

  public static getInstance(): ChatPersistenceManager {
    if (!ChatPersistenceManager.instance) {
      ChatPersistenceManager.instance = new ChatPersistenceManager()
    }
    return ChatPersistenceManager.instance
  }

  private constructor() {
    // Set up cleanup on page unload for security (similar to API key)
    if (typeof window !== 'undefined') {
      const handleBeforeUnload = () => {
        this.clearAllChats()
      }

      window.addEventListener('beforeunload', handleBeforeUnload)
    }
  }

  // Single Chat Methods
  public saveSingleChat(model: ChatModel, messages: Message[]): void {
    if (!model?.id) return

    const key = generateSingleChatKey(model.id)
    persistedSingleChats.set(key, {
      messages: [...messages], // Deep copy to avoid reference issues
      modelId: model.id,
      lastUpdated: Date.now()
    })
  }

  public getSingleChat(model: ChatModel): Message[] {
    if (!model?.id) return []

    const key = generateSingleChatKey(model.id)
    const persisted = persistedSingleChats.get(key)

    if (persisted && persisted.modelId === model.id) {
      return [...persisted.messages] // Return deep copy
    }

    return []
  }

  public hasSingleChat(model: ChatModel): boolean {
    if (!model?.id) return false

    const key = generateSingleChatKey(model.id)
    const persisted = persistedSingleChats.get(key)

    return persisted !== undefined && persisted.modelId === model.id && persisted.messages.length > 0
  }

  public clearSingleChat(model: ChatModel): void {
    if (!model?.id) return

    const key = generateSingleChatKey(model.id)
    persistedSingleChats.delete(key)
  }

  // Comparison Chat Methods
  public saveComparisonChat(leftModel: ChatModel, rightModel: ChatModel, leftMessages: Message[], rightMessages: Message[]): void {
    if (!leftModel?.id || !rightModel?.id) return

    const key = generateComparisonChatKey(leftModel.id, rightModel.id)
    persistedComparisonChats.set(key, {
      leftChat: { messages: [...leftMessages] },
      rightChat: { messages: [...rightMessages] },
      leftModelId: leftModel.id,
      rightModelId: rightModel.id,
      lastUpdated: Date.now()
    })
  }

  public getComparisonChat(leftModel: ChatModel, rightModel: ChatModel): { leftMessages: Message[], rightMessages: Message[] } {
    if (!leftModel?.id || !rightModel?.id) return { leftMessages: [], rightMessages: [] }

    const key = generateComparisonChatKey(leftModel.id, rightModel.id)
    const persisted = persistedComparisonChats.get(key)

    if (persisted && persisted.leftModelId === leftModel.id && persisted.rightModelId === rightModel.id) {
      return {
        leftMessages: [...persisted.leftChat.messages],
        rightMessages: [...persisted.rightChat.messages]
      }
    }

    return { leftMessages: [], rightMessages: [] }
  }

  public hasComparisonChat(leftModel: ChatModel, rightModel: ChatModel): boolean {
    if (!leftModel?.id || !rightModel?.id) return false

    const key = generateComparisonChatKey(leftModel.id, rightModel.id)
    const persisted = persistedComparisonChats.get(key)

    return persisted !== undefined &&
           persisted.leftModelId === leftModel.id &&
           persisted.rightModelId === rightModel.id &&
           (persisted.leftChat.messages.length > 0 || persisted.rightChat.messages.length > 0)
  }

  public clearComparisonChat(leftModel: ChatModel, rightModel: ChatModel): void {
    if (!leftModel?.id || !rightModel?.id) return

    const key = generateComparisonChatKey(leftModel.id, rightModel.id)
    persistedComparisonChats.delete(key)
  }

  // Utility Methods
  public clearAllChats(): void {
    persistedSingleChats.clear()
    persistedComparisonChats.clear()
  }

  public clearOldChats(maxAgeMinutes: number = 60): void {
    const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000)

    // Clear old single chats
    for (const [key, chat] of persistedSingleChats.entries()) {
      if (chat.lastUpdated < cutoffTime) {
        persistedSingleChats.delete(key)
      }
    }

    // Clear old comparison chats
    for (const [key, chat] of persistedComparisonChats.entries()) {
      if (chat.lastUpdated < cutoffTime) {
        persistedComparisonChats.delete(key)
      }
    }
  }

  // Debug methods
  public getDebugInfo(): { singleChats: number, comparisonChats: number } {
    return {
      singleChats: persistedSingleChats.size,
      comparisonChats: persistedComparisonChats.size
    }
  }
}

// Export singleton instance
export const chatPersistenceManager = ChatPersistenceManager.getInstance()
