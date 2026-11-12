<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
import QRCode from 'qrcode'
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
import { exportOrders, listOrders, type AkulakuOrder, type OrderStatus } from '@/services/akulakuOrders'
import { listAkulakuAccounts, type AkulakuAccount } from '@/services/akulakuAccounts'
import { formatRupiah } from '@/services/products'
import { orderStatusMeta } from '@/utils/labels'

const toast = useToast()

const orders = ref<AkulakuOrder[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const search = ref('')
const statusFilter = ref<OrderStatus | 'all'>('all')
const accountFilter = ref<string>('all')
const accounts = ref<AkulakuAccount[]>([])
const loading = ref(false)
const exporting = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

// Cache QR per URL (hindari generate berulang saat re-render).
const qrCache = ref<Record<string, string>>({})

/** Generate QR (SVG data URI) untuk link Shopee produk. */
async function qrFor(url: string | null): Promise<string> {
  if (!url) return ''
  if (qrCache.value[url]) return qrCache.value[url]
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 96 })
    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    qrCache.value = { ...qrCache.value, [url]: dataUri }
    return dataUri
  } catch {
    return ''
  }
}

/** Siapkan QR untuk semua item pesanan setelah data dimuat. */
async function buildQrCodes() {
  const urls = new Set<string>()
  for (const o of orders.value) {
    for (const it of o.items) {
      if (it.shopeeUrl) urls.add(it.shopeeUrl)
    }
  }
  await Promise.all([...urls].map((u) => qrFor(u)))
}

function statusOf(status: string) {
  return orderStatusMeta[status] ?? orderStatusMeta.new
}

function statusColor(status: string) {
  if (status === 'delivered') return 'success' as const
  if (status === 'cancelled') return 'error' as const
  if (status === 'shipped') return 'info' as const
  if (status === 'processing') return 'warning' as const
  return 'gray' as const
}

async function load() {
  loading.value = true
  try {
    const res = await listOrders({
      page: page.value,
      limit,
      search: search.value.trim(),
      status: statusFilter.value,
      accountId: accountFilter.value === 'all' ? undefined : accountFilter.value,
    })
    orders.value = res.orders
    total.value = res.total
    await buildQrCodes()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat pesanan')
  } finally {
    loading.value = false
  }
}

function applySearch() {
  page.value = 1
  load()
}

function applyFilter() {
  page.value = 1
  load()
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  load()
}

async function doExport() {
  exporting.value = true
  try {
    await exportOrders({
      search: search.value.trim(),
      status: statusFilter.value,
    })
    toast.success('Pesanan diunduh.')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal mengunduh')
  } finally {
    exporting.value = false
  }
}

function openChat() {
  // Widget chat ada di kanan bawah (ChatWidget) — beri petunjuk lokasinya.
  toast.info('Chat buyer ada di tombol bulat kanan bawah.')
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function variantLabel(variant: string | null) {
  if (!variant) return null
  try {
    const o = JSON.parse(variant)
    return Object.entries(o)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ')
  } catch {
    return variant
  }
}

async function loadAccounts() {
  try {
    const res = await listAkulakuAccounts({ page: 1, limit: 100 })
    accounts.value = res.accounts
  } catch {
    accounts.value = []
  }
}

onMounted(() => {
  loadAccounts()
  load()
})
</script>

<template>
  <AdminLayout>
    <div class="space-y-5">
      <PageBreadcrumb pageTitle="Pesanan" />

      <ComponentCard
        title="Pesanan Akulaku"
        desc="Daftar pesanan beserta produk, pembayaran, status, dan akses cepat ke Seller Center."
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form class="flex w-full max-w-md gap-2" @submit.prevent="applySearch">
            <Input v-model="search" type="text" placeholder="Cari ID pesanan atau nama pembeli..." />
            <Button type="submit" size="sm">Cari</Button>
          </form>
          <div class="flex flex-wrap items-center gap-2">
            <Select v-model="accountFilter" @update:model-value="applyFilter">
              <SelectTrigger class="w-44">
                <SelectValue placeholder="Semua akun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua akun</SelectItem>
                <SelectItem v-for="a in accounts" :key="a.id" :value="a.id">{{ a.label }}</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="statusFilter" @update:model-value="applyFilter">
              <SelectTrigger class="w-44">
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="new">Baru</SelectItem>
                <SelectItem value="processing">Diproses</SelectItem>
                <SelectItem value="shipped">Dikirim</SelectItem>
                <SelectItem value="delivered">Selesai</SelectItem>
                <SelectItem value="cancelled">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" :disabled="loading" @click="load">Muat Ulang</Button>
            <Button variant="outline" size="sm" :disabled="exporting" @click="doExport">
              {{ exporting ? 'Mengunduh...' : 'Export CSV' }}
            </Button>
          </div>
        </div>

        <div class="space-y-3">
          <p v-if="loading && orders.length === 0" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Memuat pesanan...
          </p>
          <p v-else-if="orders.length === 0" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Belum ada pesanan.
          </p>

          <!-- Kartu pesanan -->
          <div
            v-for="order in orders"
            v-else
            :key="order.id"
            class="rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3"
          >
            <!-- Header pesanan -->
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-white/5">
              <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span class="font-medium text-gray-800 dark:text-white/90">#{{ order.externalId }}</span>
                <span>·</span>
                <span>{{ formatDateTime(order.orderedAt) }}</span>
                <span>·</span>
                <Badge size="sm" color="gray">{{ order.accountLabel ?? '-' }}</Badge>
              </div>
              <div class="flex items-center gap-2">
                <Badge size="sm" :color="statusColor(order.status)">{{ statusOf(order.status).label }}</Badge>
              </div>
            </div>

            <!-- Produk -->
            <div class="divide-y divide-gray-50 dark:divide-white/5">
              <div v-for="item in order.items" :key="item.id" class="flex items-start gap-3 px-4 py-3">
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.name ?? 'produk'"
                  class="h-14 w-14 shrink-0 rounded-lg border border-gray-100 object-cover dark:border-white/10"
                />
                <div v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400 dark:bg-white/5">
                  -
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-3">
                    <p class="line-clamp-2 text-sm text-gray-800 dark:text-white/90">{{ item.name ?? '-' }}</p>
                    <span class="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                      x{{ item.qty }}
                    </span>
                  </div>
                  <p v-if="item.variant" class="mt-0.5 text-xs text-gray-400">{{ variantLabel(item.variant) }}</p>
                  <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ formatRupiah(item.unitPrice) }} × {{ item.qty }} = {{ formatRupiah(item.total) }}
                  </p>
                </div>

                <!-- Kolom barcode: scan -> buka produk di Shopee -->
                <div class="flex w-20 shrink-0 flex-col items-center gap-1">
                  <template v-if="item.shopeeUrl">
                    <img
                      v-if="qrCache[item.shopeeUrl]"
                      :src="qrCache[item.shopeeUrl]"
                      :alt="`Barcode produk Shopee ${item.sku ?? ''}`"
                      class="h-16 w-16 rounded border border-gray-200 bg-white p-0.5 dark:border-white/10"
                      :title="`Scan untuk membuka di Shopee: ${item.shopeeItemId ?? ''}`"
                    />
                    <div v-else class="flex h-16 w-16 items-center justify-center rounded border border-dashed border-gray-200 text-[10px] text-gray-400 dark:border-white/10">
                      QR
                    </div>
                    <a
                      :href="item.shopeeUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-[10px] text-brand-600 underline hover:text-brand-700 dark:text-brand-400"
                    >
                      Shopee
                    </a>
                  </template>
                  <span v-else class="text-[10px] text-gray-400">-</span>
                </div>
              </div>
            </div>

            <!-- Footer: pembayaran, total, aksi -->
            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 dark:border-white/5">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  Pembayaran:
                  <strong class="text-gray-700 dark:text-gray-300">{{ order.payment?.label ?? 'Transfer Bank' }}</strong>
                  <span v-if="order.payment?.orderCode"> · Kode {{ order.payment.orderCode }}</span>
                </span>
                <span>Pembeli: <strong class="text-gray-700 dark:text-gray-300">{{ order.buyerName ?? '-' }}</strong></span>
                <span class="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Total: {{ formatRupiah(order.totalAmt) }}
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" @click="openChat">Live Chat</Button>
                <a
                  :href="order.akulakuUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex h-8 items-center rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Selengkapnya di Akulaku
                </a>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Total {{ total.toLocaleString('id-ID') }} pesanan · Halaman {{ page }} dari {{ totalPages }}
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
