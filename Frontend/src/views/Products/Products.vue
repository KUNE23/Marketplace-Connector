<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'vue-toastification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const toast = useToast()
const route = useRoute()

const products = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const search = ref('')
const hasListingFilter = ref<'all' | 'true' | 'false'>('all')
const loading = ref(false)

const scrapeStats = ref<ScrapeStats | null>(null)

// Modal detail produk
const isDetailOpen = ref(false)
const detailProduct = ref<Product | null>(null)
const activeImageIndex = ref(0)
const STOCK_DEFAULT = 100

function openDetail(product: Product) {
  detailProduct.value = product
  activeImageIndex.value = 0
  isDetailOpen.value = true
}

/** Stok efektif: pakai stok produk, kalau kosong pakai default (yang dipakai saat posting). */
function effectiveStock(product: Product | null) {
  if (!product) return STOCK_DEFAULT
  return product.stock ?? STOCK_DEFAULT
}

function isStockDefault(product: Product | null) {
  return !product || product.stock === null || product.stock === undefined
}

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
    toast.error(err instanceof Error ? err.message : 'Gagal memuat produk')
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
  resetProgress()

  try {
    // loop batch sampai selesai atau dihentikan
    for (;;) {
      if (stopRequested.value) {
        toast.info('Import dihentikan. Klik "Lanjutkan Import" untuk meneruskan.')
        break
      }
      const result = await importBatch(importBatchSize.value)
      importProgress.value.processed += result.processed
      importProgress.value.inserted += result.inserted
      importProgress.value.updated += result.updated
      importProgress.value.failed += result.failed
      scrapeStats.value = (await getScrapeStats()) ?? scrapeStats.value

      if (result.done) {
        toast.success('Import selesai: semua produk dari data scraping sudah diproses.')
        break
      }
    }
    page.value = 1
    await load()
    await loadStats()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal mengimpor')
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
    toast.success('Progres import direset. Klik Mulai Import untuk mengulang dari awal.')
    await loadStats()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal mereset')
  }
}

onMounted(() => {
  // Dukung pencarian dari navbar: /products?search=...
  const q = route.query.search
  if (typeof q === 'string' && q.trim()) {
    search.value = q.trim()
    page.value = 1
  }
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
            <Button variant="outline" size="sm" :disabled="loading" @click="load">Muat Ulang</Button>
          </div>
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
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && products.length === 0">
                  <TableCell colspan="8" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="products.length === 0">
                  <TableCell colspan="8" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada produk. Klik "Mulai Import" untuk mengambil dari data scraping.</TableCell>
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
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Button variant="outline" size="sm" @click="openDetail(product)">Detail</Button>
                  </TableCell>
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

      <!-- Modal detail produk -->
      <Dialog :open="isDetailOpen" @update:open="isDetailOpen = $event">
        <DialogContent class="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-3xl sm:p-8">
          <DialogHeader class="gap-2 pe-14 text-start">
            <DialogTitle class="text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90">
              Detail Produk
            </DialogTitle>
            <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
              {{ detailProduct?.sku ? `SKU: ${detailProduct.sku}` : 'Tanpa SKU' }}
            </DialogDescription>
          </DialogHeader>

          <div v-if="detailProduct" class="max-h-[70vh] space-y-5 overflow-y-auto pe-1">
            <!-- Galeri gambar -->
            <div class="space-y-2">
              <div
                class="flex h-64 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5"
              >
                <img
                  v-if="detailProduct.imageUrls.length"
                  :src="detailProduct.imageUrls[activeImageIndex]"
                  :alt="detailProduct.name ?? 'Gambar produk'"
                  class="h-full w-full object-contain"
                />
                <span v-else class="text-sm text-gray-400">Tidak ada gambar</span>
              </div>
              <div v-if="detailProduct.imageUrls.length > 1" class="flex flex-wrap gap-2">
                <button
                  v-for="(img, index) in detailProduct.imageUrls"
                  :key="img"
                  type="button"
                  class="h-16 w-16 overflow-hidden rounded-lg border transition"
                  :class="
                    index === activeImageIndex
                      ? 'border-brand-500 ring-2 ring-brand-500/30'
                      : 'border-gray-200 hover:border-brand-300 dark:border-white/10'
                  "
                  @click="activeImageIndex = index"
                >
                  <img :src="img" alt="" class="h-full w-full object-cover" />
                </button>
              </div>
            </div>

            <!-- Info utama -->
            <div class="space-y-1">
              <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">
                {{ detailProduct.name ?? '-' }}
              </h3>
              <p class="text-xl font-bold text-brand-600 dark:text-brand-400">
                {{ formatRupiah(detailProduct.priceIdr) }}
              </p>
            </div>

            <!-- Grid detail -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
                <p class="text-xs text-gray-500 dark:text-gray-400">Stok</p>
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">
                  {{ effectiveStock(detailProduct).toLocaleString('id-ID') }}
                  <span v-if="isStockDefault(detailProduct)" class="text-xs font-normal text-gray-400">
                    (default)
                  </span>
                </p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
                <p class="text-xs text-gray-500 dark:text-gray-400">Harga Asal</p>
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">
                  {{ formatRupiah(detailProduct.priceIdr) }}
                </p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
                <p class="text-xs text-gray-500 dark:text-gray-400">Terjual</p>
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">
                  {{ detailProduct.sold ?? '-' }}
                </p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
                <p class="text-xs text-gray-500 dark:text-gray-400">Rating</p>
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">
                  {{ detailProduct.rating ?? '-' }}
                </p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
                <p class="text-xs text-gray-500 dark:text-gray-400">Status Listing</p>
                <Badge size="sm" :color="detailProduct.hasListing ? 'success' : 'gray'">
                  {{ detailProduct.hasListing ? `Listing (${detailProduct.listingCount})` : 'Belum listing' }}
                </Badge>
              </div>
              <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
                <p class="text-xs text-gray-500 dark:text-gray-400">Sinkron Terakhir</p>
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">
                  {{ formatDate(detailProduct.lastSyncedAt) }}
                </p>
              </div>
            </div>

            <!-- Deskripsi -->
            <div>
              <p class="mb-1 text-xs text-gray-500 dark:text-gray-400">Deskripsi</p>
              <p class="max-h-40 overflow-y-auto whitespace-pre-line rounded-lg border border-gray-200 p-3 text-sm text-gray-700 dark:border-white/10 dark:text-gray-300">
                {{ detailProduct.description || 'Tidak ada deskripsi' }}
              </p>
            </div>

            <!-- Link Shopee -->
            <div v-if="detailProduct.shopeeUrl">
              <a
                :href="detailProduct.shopeeUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 text-base font-semibold text-orange-600 transition hover:border-orange-300 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20"
              >
                Buka di Shopee
              </a>
            </div>
          </div>

          <DialogFooter class="mx-0 mb-0 gap-3 p-0 pt-2 sm:justify-end">
            <DialogClose as-child>
              <Button variant="outline" type="button">Tutup</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </AdminLayout>
</template>
