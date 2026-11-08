<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ComponentCard from '@/components/common/ComponentCard.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import {
  getDashboardRecap,
  getDashboardSummary,
  getRecentOrders,
  type DashboardSummary,
  type RecapEntry,
  type RecentOrder,
} from '@/services/dashboard'
import { formatRupiah } from '@/services/products'

const summary = ref<DashboardSummary | null>(null)
const recap = ref<RecapEntry[]>([])
const recent = ref<RecentOrder[]>([])
const loading = ref(false)
const error = ref('')

const maxRevenue = computed(() => Math.max(1, ...recap.value.map((r) => r.revenue)))

const statusColor: Record<string, 'info' | 'warning' | 'primary' | 'success' | 'error' | 'gray'> = {
  new: 'info',
  processing: 'warning',
  shipped: 'primary',
  delivered: 'success',
  cancelled: 'error',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [sum, rec, orders] = await Promise.all([
      getDashboardSummary(),
      getDashboardRecap(14),
      getRecentOrders(6),
    ])
    summary.value = sum
    recap.value = rec.recap
    recent.value = orders.orders
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat dashboard'
  } finally {
    loading.value = false
  }
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Dashboard" />
      <div class="space-y-5 sm:space-y-6">
        <div
          v-if="error"
          class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
        >
          {{ error }}
        </div>

        <!-- Kartu utama -->
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Omzet Akulaku</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {{ formatRupiah(summary?.revenue.total ?? 0) }}
            </p>
            <p class="mt-1 text-xs text-gray-400">Hari ini: {{ formatRupiah(summary?.revenue.today ?? 0) }}</p>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Pesanan</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{{ summary?.orders.total ?? 0 }}</p>
            <p class="mt-1 text-xs text-gray-400">Hari ini: {{ summary?.orders.today ?? 0 }}</p>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Produk</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{{ summary?.products.total ?? 0 }}</p>
            <p class="mt-1 text-xs text-gray-400">Sudah listing: {{ summary?.products.withListing ?? 0 }}</p>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Listing</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{{ summary?.listings.total ?? 0 }}</p>
            <p class="mt-1 text-xs text-gray-400">Posted: {{ summary?.listings.posted ?? 0 }} · Gagal: {{ summary?.listings.failed ?? 0 }}</p>
          </div>
        </div>

        <!-- Ringkasan status -->
        <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ComponentCard title="Status Pesanan" desc="Ringkasan pesanan Akulaku.">
            <div class="flex flex-wrap gap-2">
              <Badge color="info" size="lg">Baru {{ summary?.orders.new ?? 0 }}</Badge>
              <Badge color="warning" size="lg">Diproses {{ summary?.orders.processing ?? 0 }}</Badge>
              <Badge color="primary" size="lg">Dikirim {{ summary?.orders.shipped ?? 0 }}</Badge>
              <Badge color="success" size="lg">Selesai {{ summary?.orders.delivered ?? 0 }}</Badge>
              <Badge color="error" size="lg">Dibatalkan {{ summary?.orders.cancelled ?? 0 }}</Badge>
            </div>
          </ComponentCard>

          <ComponentCard title="Status Listing" desc="Ringkasan listing ke Akulaku.">
            <div class="flex flex-wrap gap-2">
              <Badge color="gray" size="lg">Draft {{ summary?.listings.draft ?? 0 }}</Badge>
              <Badge color="warning" size="lg">Queued {{ summary?.listings.queued ?? 0 }}</Badge>
              <Badge color="success" size="lg">Posted {{ summary?.listings.posted ?? 0 }}</Badge>
              <Badge color="error" size="lg">Failed {{ summary?.listings.failed ?? 0 }}</Badge>
            </div>
            <div class="mt-4 flex flex-wrap gap-2">
              <Badge color="primary" size="sm">Akun aktif: {{ summary?.accounts.active ?? 0 }}/{{ summary?.accounts.total ?? 0 }}</Badge>
              <Badge color="warning" size="sm">Jobs pending: {{ summary?.jobs.pending ?? 0 }}</Badge>
              <Badge color="error" size="sm">Jobs failed: {{ summary?.jobs.failed ?? 0 }}</Badge>
            </div>
          </ComponentCard>
        </div>

        <!-- Rekap omzet -->
        <ComponentCard title="Omzet 14 Hari" desc="Omzet Akulaku per hari.">
          <div class="flex h-52 items-end gap-1.5 overflow-x-auto">
            <div
              v-for="entry in recap"
              :key="entry.date"
              class="group flex min-w-8 flex-1 flex-col items-center justify-end gap-1"
              :title="`${formatShortDate(entry.date)}: ${formatRupiah(entry.revenue)} (${entry.orders} pesanan)`"
            >
              <div
                class="w-full rounded-t bg-brand-500/80 transition-all group-hover:bg-brand-500"
                :style="{ height: Math.max(2, (entry.revenue / maxRevenue) * 180) + 'px' }"
              />
              <span class="text-[10px] text-gray-400">{{ formatShortDate(entry.date) }}</span>
            </div>
          </div>
          <div v-if="!loading && recap.every((r) => r.revenue === 0)" class="mt-2 text-center text-sm text-gray-400">
            Belum ada omzet tercatat. Data muncul setelah ada pesanan Akulaku.
          </div>
        </ComponentCard>

        <!-- Pesanan terbaru -->
        <ComponentCard title="Pesanan Terbaru" desc="6 pesanan Akulaku terakhir.">
          <div class="flex justify-end">
            <RouterLink to="/pesanan">
              <Button variant="outline" size="sm">Lihat semua</Button>
            </RouterLink>
          </div>
          <div v-if="recent.length === 0" class="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Belum ada pesanan.
          </div>
          <div v-else class="divide-y divide-gray-100 dark:divide-white/5">
            <div v-for="order in recent" :key="order.id" class="flex items-center justify-between gap-3 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-gray-800 dark:text-white/90">{{ order.externalId }}</p>
                <p class="text-xs text-gray-400">{{ order.buyerName ?? '-' }} · {{ order.accountLabel ?? '-' }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <Badge size="sm" :color="statusColor[order.status] ?? 'gray'">{{ order.status }}</Badge>
                <span class="text-sm font-medium text-gray-800 dark:text-white/90">{{ formatRupiah(order.totalAmt) }}</span>
              </div>
            </div>
          </div>
        </ComponentCard>
      </div>
    </div>
  </AdminLayout>
</template>
