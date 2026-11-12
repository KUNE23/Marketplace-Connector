<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { ChatIcon, XIcon } from '@/icons/layout'
import { formatChatTime, getConversationMessages, listConversations, sendChatMessage, syncChat, type ChatConversation, type ChatMessage } from '@/services/chat'

const toast = useToast()

const isOpen = ref(false)
const conversations = ref<ChatConversation[]>([])
const selectedId = ref<string | null>(null)
const messages = ref<ChatMessage[]>([])
const loading = ref(false)
const sending = ref(false)
const syncing = ref(false)
const draft = ref('')
const threadRef = ref<HTMLElement | null>(null)

const selected = computed(() => conversations.value.find((c) => c.id === selectedId.value) ?? null)
const canSend = computed(() => draft.value.trim().length > 0 && !sending.value && Boolean(selectedId.value))

async function loadConversations() {
  loading.value = true
  try {
    const res = await listConversations()
    conversations.value = res.conversations
    if (!selectedId.value && res.conversations.length) await openConversation(res.conversations[0].id)
  } catch {
    conversations.value = []
  } finally {
    loading.value = false
  }
}

async function openConversation(id: string) {
  selectedId.value = id
  try {
    const res = await getConversationMessages(id)
    messages.value = res.messages
    await nextTick()
    if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat pesan')
  }
}

async function sync() {
  syncing.value = true
  try {
    await syncChat({ maxConversations: 5 })
    await loadConversations()
    toast.success('Percakapan diperbarui dari Akulaku.')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal sinkron')
  } finally {
    syncing.value = false
  }
}

async function send() {
  const text = draft.value.trim()
  if (!text || !selectedId.value) return
  sending.value = true
  try {
    await sendChatMessage(selectedId.value, text)
    draft.value = ''
    await openConversation(selectedId.value)
    await loadConversations()
    toast.success('Pesan terkirim.')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal mengirim pesan')
  } finally {
    sending.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

watch(isOpen, (open) => {
  if (open && conversations.value.length === 0) loadConversations()
})

onMounted(() => {
  // Muat jumlah percakapan ringan saat pertama kali (untuk badge).
  listConversations()
    .then((res) => {
      conversations.value = res.conversations
    })
    .catch(() => {})
})
</script>

<template>
  <!-- Tombol bulat kanan bawah -->
  <div class="fixed end-5 bottom-5 z-50">
    <button
      v-if="!isOpen"
      type="button"
      class="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition hover:bg-brand-600"
      title="Chat Buyer"
      @click="isOpen = true"
    >
      <ChatIcon class="h-6 w-6" />
      <span
        v-if="conversations.length"
        class="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-error-500 text-[10px] font-semibold text-white"
      >
        {{ conversations.length }}
      </span>
    </button>

    <!-- Panel chat -->
    <div
      v-else
      class="flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900"
    >
      <header class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {{ selected?.buyerLabel ?? 'Chat Buyer' }}
          </p>
          <p class="truncate text-xs text-gray-400">{{ selected?.accountLabel ?? 'Semua akun' }}</p>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
            :disabled="syncing"
            @click="sync"
          >
            {{ syncing ? '...' : 'Sync' }}
          </button>
          <button
            type="button"
            class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
            @click="isOpen = false"
          >
            <XIcon class="h-4 w-4" />
          </button>
        </div>
      </header>

      <!-- Daftar percakapan ringkas -->
      <div class="max-h-24 shrink-0 overflow-y-auto border-b border-gray-100 dark:border-white/10">
        <p v-if="loading" class="px-3 py-2 text-xs text-gray-400">Memuat...</p>
        <p v-else-if="conversations.length === 0" class="px-3 py-2 text-xs text-gray-400">
          Belum ada percakapan. Klik Sync.
        </p>
        <button
          v-for="c in conversations"
          v-else
          :key="c.id"
          type="button"
          class="block w-full truncate px-3 py-2 text-start text-xs transition hover:bg-gray-50 dark:hover:bg-white/5"
          :class="c.id === selectedId ? 'bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400' : 'text-gray-600 dark:text-gray-300'"
          @click="openConversation(c.id)"
        >
          {{ c.buyerLabel }} · {{ c.messageCount }} pesan
        </button>
      </div>

      <!-- Thread -->
      <div ref="threadRef" class="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <p v-if="!selectedId" class="text-center text-xs text-gray-400">Pilih percakapan.</p>
        <p v-else-if="messages.length === 0" class="text-center text-xs text-gray-400">Belum ada pesan.</p>
        <div
          v-for="m in messages"
          v-else
          :key="m.id"
          class="flex"
          :class="m.from === 'us' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[80%] rounded-2xl px-3 py-2 text-xs"
            :class="m.from === 'us' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white/90'"
          >
            <p class="whitespace-pre-line">{{ m.text }}</p>
            <p class="mt-0.5 text-[10px] opacity-60">{{ formatChatTime(m.createdAt) }}</p>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="shrink-0 border-t border-gray-100 p-2 dark:border-white/10">
        <div class="flex items-end gap-2">
          <textarea
            v-model="draft"
            rows="1"
            :disabled="!selectedId || sending"
            placeholder="Tulis pesan..."
            class="h-10 w-full resize-none rounded-lg border border-gray-300 bg-transparent px-2 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden disabled:opacity-60 dark:border-gray-700 dark:text-white/90"
            @keydown="onKeydown"
          />
          <button
            type="button"
            class="h-10 shrink-0 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white disabled:opacity-50"
            :disabled="!canSend"
            @click="send"
          >
            {{ sending ? '...' : 'Kirim' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
