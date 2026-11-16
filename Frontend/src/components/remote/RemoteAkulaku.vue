<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import {
  saveRemoteSession,
  sendRemoteInput,
  startRemoteSession,
  stopRemoteSession,
  subscribeRemoteStream,
  type RemoteInputEvent,
} from '@/services/remote'

const props = defineProps<{
  modelValue: boolean
  accountId: string
  accountLabel: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const toast = useToast()

const sessionId = ref<string | null>(null)
const frameSrc = ref<string>('')
const viewport = ref({ width: 1366, height: 768 })
const currentUrl = ref('')
const loading = ref(false)
const errorMsg = ref('')
const needsLogin = ref(false)
const saving = ref(false)
const imageEl = ref<HTMLImageElement | null>(null)
const surfaceEl = ref<HTMLElement | null>(null)

let unsubscribe: (() => void) | null = null
let lastMoveAt = 0

const isOpen = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** Ubah koordinat layar -> koordinat halaman (viewport Chrome). */
function toPageCoords(evt: MouseEvent) {
  const el = imageEl.value
  if (!el) return { x: 0, y: 0 }
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return { x: 0, y: 0 }
  const x = ((evt.clientX - rect.left) / rect.width) * viewport.value.width
  const y = ((evt.clientY - rect.top) / rect.height) * viewport.value.height
  return {
    x: Math.round(Math.min(Math.max(x, 0), viewport.value.width - 1)),
    y: Math.round(Math.min(Math.max(y, 0), viewport.value.height - 1)),
  }
}

function send(evt: RemoteInputEvent) {
  if (!sessionId.value) return
  sendRemoteInput(sessionId.value, evt)
}

function onMouseDown(evt: MouseEvent) {
  evt.preventDefault()
  surfaceEl.value?.focus()
  const { x, y } = toPageCoords(evt)
  const button = evt.button === 2 ? 'right' : evt.button === 1 ? 'middle' : 'left'
  send({ type: 'mouse', action: 'down', x, y, button, clickCount: evt.detail || 1 })
}

function onMouseUp(evt: MouseEvent) {
  evt.preventDefault()
  const { x, y } = toPageCoords(evt)
  const button = evt.button === 2 ? 'right' : evt.button === 1 ? 'middle' : 'left'
  send({ type: 'mouse', action: 'up', x, y, button, clickCount: evt.detail || 1 })
}

function onMouseMove(evt: MouseEvent) {
  const now = Date.now()
  if (now - lastMoveAt < 60) return // throttle agar tidak membanjiri server
  lastMoveAt = now
  const { x, y } = toPageCoords(evt)
  send({ type: 'mouse', action: 'move', x, y })
}

function onWheel(evt: WheelEvent) {
  evt.preventDefault()
  const { x, y } = toPageCoords(evt)
  send({ type: 'wheel', x, y, deltaX: evt.deltaX, deltaY: evt.deltaY })
}

const SPECIAL_KEYS = new Set([
  'Enter', 'Backspace', 'Tab', 'Escape', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
])

function onKeyDown(evt: KeyboardEvent) {
  if (SPECIAL_KEYS.has(evt.key)) {
    evt.preventDefault()
    send({ type: 'key', action: 'down', key: evt.key, code: evt.code, keyCode: evt.keyCode })
    send({ type: 'key', action: 'up', key: evt.key, code: evt.code, keyCode: evt.keyCode })
    return
  }
  if (evt.key.length === 1 && !evt.ctrlKey && !evt.metaKey) {
    evt.preventDefault()
    send({ type: 'text', text: evt.key })
  }
}

async function open() {
  loading.value = true
  errorMsg.value = ''
  frameSrc.value = ''
  needsLogin.value = false

  try {
    const res = await startRemoteSession(props.accountId)
    sessionId.value = res.sessionId
    viewport.value = res.viewport
    currentUrl.value = res.url
    needsLogin.value = res.needsLogin

    if (res.needsLogin) {
      toast.info('Sesi Akulaku sudah berakhir. Silakan login (termasuk OTP) di jendela Akulaku ini.')
    }

    unsubscribe = subscribeRemoteStream(res.sessionId, {
      onMeta: (m) => { viewport.value = m },
      onFrame: (d) => { frameSrc.value = d },
      onUrl: (u) => { currentUrl.value = u },
      onError: () => { /* EventSource akan mencoba menyambung ulang otomatis */ },
    })
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal membuka Akulaku'
  } finally {
    loading.value = false
  }
}

async function close() {
  unsubscribe?.()
  unsubscribe = null
  if (sessionId.value) {
    await stopRemoteSession(sessionId.value).catch(() => {})
    sessionId.value = null
  }
  isOpen.value = false
}

async function doSaveSession() {
  if (!sessionId.value) return
  saving.value = true
  try {
    const res = await saveRemoteSession(sessionId.value)
    toast.success(`Sesi tersimpan (${res.cookies} cookie). Akun siap dipakai otomasi.`)
    needsLogin.value = false
    emit('saved')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menyimpan sesi')
  } finally {
    saving.value = false
  }
}

function doReload() {
  send({ type: 'reload' })
}

function doBack() {
  send({ type: 'back' })
}

watch(isOpen, (v) => {
  if (v) open()
  else close()
})

onMounted(() => {
  if (props.modelValue) open()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
  if (sessionId.value) stopRemoteSession(sessionId.value).catch(() => {})
})
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex flex-col bg-black/80 p-3 sm:p-6">
      <div class="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-900">
        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              {{ accountLabel }}
            </p>
            <p class="truncate text-[11px] text-gray-400">{{ currentUrl || '-' }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
              @click="doBack"
            >
              ← Kembali
            </button>
            <button
              type="button"
              class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
              @click="doReload"
            >
              ⟳ Muat Ulang
            </button>
            <button
              v-if="needsLogin"
              type="button"
              class="rounded-lg bg-success-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              :disabled="saving"
              @click="doSaveSession"
            >
              {{ saving ? 'Menyimpan...' : 'Simpan Sesi (setelah login)' }}
            </button>
            <button
              type="button"
              class="rounded-lg bg-error-600 px-2.5 py-1.5 text-xs font-medium text-white"
              @click="close"
            >
              Tutup
            </button>
          </div>
        </div>

        <!-- Area layar -->
        <div
          ref="surfaceEl"
          tabindex="0"
          class="relative flex-1 overflow-auto bg-gray-100 outline-none dark:bg-black/40"
          @keydown="onKeyDown"
        >
          <div v-if="loading" class="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Membuka browser Akulaku...
          </div>
          <div v-else-if="errorMsg" class="flex h-full items-center justify-center p-6 text-center">
            <div>
              <p class="text-sm text-error-600 dark:text-error-400">{{ errorMsg }}</p>
              <button
                type="button"
                class="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-xs dark:border-white/20 dark:text-gray-300"
                @click="close"
              >
                Tutup
              </button>
            </div>
          </div>
          <img
            v-else-if="frameSrc"
            ref="imageEl"
            :src="frameSrc"
            alt="Layar Akulaku"
            class="block w-full cursor-default select-none"
            draggable="false"
            @mousedown="onMouseDown"
            @mouseup="onMouseUp"
            @mousemove="onMouseMove"
            @wheel="onWheel"
            @contextmenu.prevent
          />
          <div v-else class="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Menunggu gambar dari server...
          </div>
        </div>

        <!-- Footer -->
        <div class="border-t border-gray-200 px-4 py-2 dark:border-white/10">
          <p class="text-[11px] text-gray-500 dark:text-gray-400">
            Klik & ketik langsung di layar di atas. Sesi otomatis ditutup setelah tidak aktif.
            <span v-if="needsLogin" class="text-warning-600 dark:text-warning-400">
              Sesi Akulaku berakhir — login dulu, lalu klik "Simpan Sesi".
            </span>
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
