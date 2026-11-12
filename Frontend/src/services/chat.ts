import { apiFetch } from './api'

export interface ChatConversation {
  id: string
  accountId: string
  accountLabel: string | null
  convKey: string
  buyerLabel: string
  lastPreview: string | null
  lastMessageAt: string | null
  unread: number
  messageCount: number
}

export interface ChatMessage {
  id: string
  from: 'us' | 'buyer'
  sender: string | null
  text: string
  createdAt: string
}

export interface ChatSyncResult {
  accountId: string
  label?: string
  ok?: boolean
  error?: string
  conversationsFound?: number
  conversationsSaved?: number
  durationMs?: number
}

export function listConversations(accountId?: string) {
  const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
  return apiFetch<{ conversations: ChatConversation[] }>(`/chat${qs}`)
}

export function getConversationMessages(id: string) {
  return apiFetch<{ conversation: ChatConversation; messages: ChatMessage[] }>(`/chat/${id}/messages`)
}

export function syncChat(payload: { accountId?: string; maxConversations?: number } = {}) {
  return apiFetch<
    | ChatSyncResult
    | { synced: number; failed: number; results: ChatSyncResult[] }
  >('/chat/sync', { method: 'POST', body: payload })
}

export function sendChatMessage(id: string, text: string) {
  return apiFetch<{ ok: boolean; sent: boolean }>(`/chat/${id}/send`, {
    method: 'POST',
    body: { text },
  })
}

export function formatChatTime(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
}
