<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ComponentCard from '@/components/common/ComponentCard.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import {
  CATEGORY_LABEL,
  deleteNotification,
  formatRelativeTime,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
  type NotificationCategory,
  type NotificationCategoryInfo,
} from '@/services/notifications'

const toast = useToast()

const notifications = ref<Notification[]>([])
const categories = ref<NotificationCategoryInfo[]>([])
const total = ref(0)
const unread = ref(0)
const page = ref(1)
const limit = 20
const search = ref('')
const category = ref<NotificationCategory | 'all'>('all')
const unreadOnly = ref(false)
const loading = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

function categoryColor(cat?: string) {
  if (cat === 'order') return 'info' as const
  if (cat === 'violation') return 'error' as const
  if (cat === 'chat') return 'primary' as const
  return 'gray' as const
}

async function load() {
  loading.value = true
  try {
    const res = await listNotifications({
      page: page.value,
      limit,
      search: search.value.trim() || undefined,
      category: category.value,
      unreadOnly: unreadOnly.value || undefined,
    })
    notifications.value = res.notifications
    categories.value = res.categories ?? []
    total.value = res.total
    unread.value = res.unread
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat notifikasi')
  } finally {
    loading.value = false
  }
}

function applySearch() {
  page.value = 1
  load()
}

function applyCategory() {
  page.value = 1
  load()
}

function toggleUnreadOnly() {
  unreadOnly.value = !unreadOnly.value
  page.value = 1
  load()
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  load()
}

async function markRead(n: Notification) {
  if (n.readAt) return
  try {
    await markNotificationRead(n.id)
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menandai dibaca')
  }
}

async function markAll() {
  try {
    const res = await markAllNotificationsRead()
    toast.success(`${res.updated} notifikasi ditandai dibaca.`)
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal')
  }
}

async function remove(n: Notification) {
  if (!window.confirm('Hapus notifikasi ini?')) return
  try {
    await deleteNotification(n.id)
    toast.success('Notifikasi dihapus.')
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menghapus')
  }
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div class="space-y-5">
      <PageBreadcrumb pageTitle="Notifikasi" />

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/5 dark:bg-white/3">
          <p class="text-sm text-gray-500 dark:text-gray-400">Total Notifikasi</p>
          <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{{ total }}</p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/5 dark:bg-white/3">
          <p class="text-sm text-gray-500 dark:text-gray-400">Belum Dibaca</p>
          <p class="mt-1 text-2xl font-semibold" :class="unread > 0 ? 'text-warning-600 dark:text-warning-400' : 'text-gray-800 dark:text-white/90'">
            {{ unread }}
          </p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/5 dark:bg-white/3">
          <p class="text-sm text-gray-500 dark:text-gray-400">Jenis</p>
          <div class="mt-1 flex flex-wrap gap-1">
            <Badge v-for="c in categories" :key="c.key" size="sm" :color="categoryColor(c.key)">
              {{ c.label }} {{ c.count }}
            </Badge>
          </div>
        </div>
      </div>

      <ComponentCard title="Daftar Notifikasi" desc="Cari dan filter notifikasi berdasarkan jenis.">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form class="flex w-full max-w-md gap-2" @submit.prevent="applySearch">
            <Input v-model="search" type="text" placeholder="Cari judul atau isi notifikasi..." />
            <Button type="submit" size="sm">Cari</Button>
          </form>
          <div class="flex flex-wrap items-center gap-2">
            <Select v-model="category" @update:model-value="applyCategory">
              <SelectTrigger class="w-44">
                <SelectValue placeholder="Semua jenis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis</SelectItem>
                <SelectItem v-for="c in categories" :key="c.key" :value="c.key">{{ c.label }}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" @click="toggleUnreadOnly">
              {{ unreadOnly ? 'Tampilkan Semua' : 'Hanya Belum Dibaca' }}
            </Button>
            <Button variant="outline" size="sm" :disabled="unread === 0" @click="markAll">Tandai Semua Dibaca</Button>
          </div>
        </div>

        <div class="space-y-2">
          <p v-if="loading && notifications.length === 0" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Memuat notifikasi...
          </p>
          <p v-else-if="notifications.length === 0" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Tidak ada notifikasi.
          </p>

          <div
            v-for="n in notifications"
            v-else
            :key="n.id"
            class="flex items-start gap-3 rounded-xl border p-4 transition"
            :class="
              n.readAt
                ? 'border-gray-200 bg-white dark:border-white/5 dark:bg-white/3'
                : 'border-brand-200 bg-brand-50/40 dark:border-brand-500/30 dark:bg-brand-500/5'
            "
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <Badge size="sm" :color="categoryColor(n.category)">{{ CATEGORY_LABEL[n.category ?? 'system'] }}</Badge>
                <span class="text-sm font-medium text-gray-800 dark:text-white/90">{{ n.title }}</span>
                <span v-if="!n.readAt" class="h-1.5 w-1.5 rounded-full bg-brand-500" />
              </div>
              <p v-if="n.body" class="mt-1 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">{{ n.body }}</p>
              <p class="mt-1 text-xs text-gray-400">
                {{ formatRelativeTime(n.createdAt) }} · {{ new Date(n.createdAt).toLocaleString('id-ID') }}
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button v-if="!n.readAt" variant="outline" size="sm" @click="markRead(n)">Dibaca</Button>
              <Button variant="outline" size="sm" @click="remove(n)">Hapus</Button>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Total {{ total }} notifikasi · Halaman {{ page }} dari {{ totalPages }}
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" :disabled="loading || page <= 1" @click="goToPage(1)">Awal</Button>
            <Button variant="outline" size="sm" :disabled="loading || page <= 1" @click="goToPage(page - 1)">Sebelumnya</Button>
            <Button variant="outline" size="sm" :disabled="loading || page >= totalPages" @click="goToPage(page + 1)">Berikutnya</Button>
            <Button variant="outline" size="sm" :disabled="loading || page >= totalPages" @click="goToPage(totalPages)">Akhir</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  </AdminLayout>
</template>
