import { apiRequest } from '../lib/api.js'
import { createChatApi } from './chatApi.js'

export const chatApi = createChatApi(apiRequest)

export function createSubmissionLock() {
  let pending = false
  return {
    get pending() {
      return pending
    },
    async run(action) {
      if (pending) return false
      pending = true
      try {
        return await action()
      } finally {
        pending = false
      }
    },
  }
}

export function getOrCreateChatSessionId() {
  const storage = globalThis.sessionStorage
  const existing = storage?.getItem('cyber-chat-session-id')
  if (existing) return existing

  const sessionId = globalThis.crypto?.randomUUID?.()
  if (!sessionId) throw new Error('This browser cannot create a secure chat session identifier.')
  storage?.setItem('cyber-chat-session-id', sessionId)
  return sessionId
}
