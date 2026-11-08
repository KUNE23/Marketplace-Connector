<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import ComponentCard from '@/components/common/ComponentCard.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import {
  formatRupiah,
  getScrapeStats,
  importBatch,
  listProducts,
  resetImport,
  type Product,
  type ScrapeStats,
} from '@/services/products'

const MAX_LIMIT = 100

const products = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const search = ref('')
const hasListingFilter = ref<'all' | 'true' | 'false'>('all')
const loading = ref(false)
const error = ref('')
const notice = ref('')

const scrapeStats = ref<ScrapeStats | null>(null)

// state import massal
const importing = ref(false)
const stopRequested = ref(false)
const importBatchSize = ref(50)
const importProgress = ref({ processed: 0, inserted: 0, updated: 0, failed: 0 })

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const progressPercent = computed(() => {
  const stats = scrapeStats.value
  if (!stats || !stats.total) return 0
  const done = stats.state.imported + stats.state.updated
  return Math.min(100, Math.round((done / stats.total) * 100))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await listProducts({
      page: page.value,
      limit: limit.value,
      search: search.value.trim(),
      hasListing: hasListingFilter.value === 'all' ? undefined : hasListingFilter.value === 'true',
    })
    products.value = response.products
    total.value = response.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat products'
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    scrapeStats.value = await getScrapeStats()
  } catch {
    scrapeStats.value = null
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

function changeImportBatch(value: unknown) {
  importBatchSize.value = Number(value) || 50
}

function changeLimit(value: unknown) {
  limit.value = Math.min(Number(value) || 20, MAX_LIMIT)
  page.value = 1
  load()
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  load()
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function resetProgress() {
  importProgress.value = { processed: 0, inserted: 0, updated: 0, failed: 0 }
}

async function runImport() {
  if (importing.value) return
  importing.value = true
  stopRequested.value = false
  error.value = ''
  notice.value = ''
  resetProgress()

  try {
    // loop batch sampai selesai atau dihentikan
    for (;;) {
      if (stopRequested.value) {
        notice.value = 'Import dihentikan. Klik "Lanjutkan Import" untuk meneruskan.'
        break
      }
      const result = await importBatch(importBatchSize.value)
      importProgress.value.processed += result.processed
      importProgress.value.inserted += result.inserted
      importProgress.value.updated += result.updated
      importProgress.value.failed += result.failed
      scrapeStats.value = (await getScrapeStats()) ?? scrapeStats.value

      if (result.done) {
        notice.value = 'Import selesai semua produk dari data scraping.'
        break
      }
    }
    page.value = 1
    await load()
    await loadStats()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal import'
  } finally {
    importing.value = false
  }
}

function stopImport() {
  stopRequested.value = true
}

async function restartImport() {
  if (importing.value) return
  if (!window.confirm('Reset progres import ke awal? Produk yang sudah masuk tidak dihapus.')) return
  try {
    await resetImport()
    resetProgress()
    notice.value = 'Progres import direset. Klik Mulai Import untuk mengulang dari awal.'
    await loadStats()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal reset'
  }
}

onMounted(() => {
  load()
  loadStats()
})
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Products" />
      <ComponentCard
        title="Daftar Products"
        desc="Produk hasil scraping Shopee. Import dari shopee.db lalu buat listing untuk Akulaku."
      >
        <!-- Panel import massal -->
        <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-sm text-gray-700 dark:text-gray-300">
              <div>
                Data scraping:
                <strong>{{ scrapeStats ? scrapeStats.total.toLocaleString('id-ID') : '?' }}</strong> produk
                · Sudah diproses:
                <strong>{{ scrapeStats ? (scrapeStats.state.imported + scrapeStats.state.updated).toLocaleString('id-ID') : 0 }}</strong>
                · Sisa: <strong>{{ scrapeStats ? scrapeStats.remaining.toLocaleString('id-ID') : '?' }}</strong>
              </div>
              <div v-if="scrapeStats" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Baru: {{ scrapeStats.state.imported.toLocaleString('id-ID') }} ·
                Update: {{ scrapeStats.state.updated.toLocaleString('id-ID') }} ·
                Gagal: {{ scrapeStats.state.failed.toLocaleString('id-ID') }} ·
                Status: {{ scrapeStats.state.status }}
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Select :model-value="String(importBatchSize)" @update:model-value="changeImportBatch">
                <SelectTrigger class="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25/batch</SelectItem>
                  <SelectItem value="50">50/batch</SelectItem>
                  <SelectItem value="100">100/batch</SelectItem>
                </SelectContent>
              </Select>
              <Button v-if="!importing" size="sm" @click="runImport">
                {{ scrapeStats && scrapeStats.state.lastRowId > 0 ? 'Lanjutkan Import' : 'Mulai Import' }}
              </Button>
              <Button v-else variant="outline" size="sm" @click="stopImport">Hentikan</Button>
              <Button variant="outline" size="sm" :disabled="importing" @click="restartImport">Reset</Button>
            </div>
          </div>

          <div class="mt-3">
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                class="h-full rounded-full bg-brand-500 transition-all"
                :style="{ width: progressPercent + '%' }"
              />
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ progressPercent }}% selesai
              <span v-if="importing">· batch terakhir: +{{ importProgress.inserted }} baru, {{ importProgress.updated }} update</span>
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form class="flex w-full max-w-md gap-2" @submit.prevent="applySearch">
            <input
              v-model="search"
              type="text"
              placeholder="Cari nama atau SKU..."
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
            />
            <Button type="submit" size="sm">Cari</Button>
          </form>
          <div class="flex flex-wrap items-center gap-2">
            <Select v-model="hasListingFilter" @update:model-value="applyFilter">
              <SelectTrigger class="w-44">
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua produk</SelectItem>
                <SelectItem value="true">Sudah ada listing</SelectItem>
                <SelectItem value="false">Belum ada listing</SelectItem>
              </SelectContent>
            </Select>
            <Select :model-value="String(limit)" @update:model-value="changeLimit">
              <SelectTrigger class="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / halaman</SelectItem>
                <SelectItem value="20">20 / halaman</SelectItem>
                <SelectItem value="50">50 / halaman</SelectItem>
                <SelectItem value="100">100 / halaman</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" :disabled="loading" @click="load">Refresh</Button>
          </div>
        </div>

        <div
          v-if="notice"
          class="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/10 dark:text-success-400"
        >
          {{ notice }}
        </div>
        <div
          v-if="error"
          class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
        >
          {{ error }}
        </div>

        <div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
          <div class="max-w-full overflow-x-auto">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">SKU</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Nama</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Harga</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Terjual</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Rating</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Status</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Sinkron</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && products.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="products.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada produk. Klik "Mulai Import" untuk mengambil dari data scraping.</TableCell>
                </TableRow>
                <TableRow
                  v-for="product in products"
                  v-else
                  :key="product.id"
                  class="transition hover:bg-gray-50/50 dark:hover:bg-white/2"
                >
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">{{ product.sku }}</TableCell>
                  <TableCell class="max-w-md truncate px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ product.name }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ formatRupiah(product.priceIdr) }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ product.sold ?? '-' }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ product.rating ?? '-' }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="product.hasListing ? 'success' : 'gray'">
                      {{ product.hasListing ? `Listing (${product.listingCount})` : 'Belum listing' }}
                    </Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ formatDate(product.lastSyncedAt) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Total {{ total.toLocaleString('id-ID') }} produk · Halaman {{ page }} dari {{ totalPages }}
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
