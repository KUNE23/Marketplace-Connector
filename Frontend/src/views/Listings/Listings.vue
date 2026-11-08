<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
import { listAkulakuAccounts, type AkulakuAccount } from '@/services/akulakuAccounts'
import {
  bulkCreateListings,
  createListing,
  deleteListing,
  listListings,
  updateListing,
  type Listing,
  type ListingStatus,
  type MarkupType,
} from '@/services/listings'
import { formatRupiah, listProducts, type Product } from '@/services/products'

const listings = ref<Listing[]>([])
const accounts = ref<AkulakuAccount[]>([])
const products = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const search = ref('')
const statusFilter = ref<ListingStatus | 'all'>('all')
const loading = ref(false)
const error = ref('')

const isDialogOpen = ref(false)
const form = ref({ productId: '', accountId: '', markupType: 'percent' as MarkupType, markupValue: '' })
const formError = ref('')
const saving = ref(false)

// Bulk listing
const isBulkOpen = ref(false)
const bulkForm = ref({ accountId: '', markupType: 'percent' as MarkupType, markupValue: '', count: 200 })
const bulkError = ref('')
const bulkSaving = ref(false)
const bulkNotice = ref('')
const bulkProgress = ref(0)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const statusMeta: Record<ListingStatus, { label: string; color: 'gray' | 'warning' | 'success' | 'error' }> = {
  draft: { label: 'Draft', color: 'gray' },
  queued: { label: 'Queued', color: 'warning' },
  posted: { label: 'Posted', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
}

function statusOf(listing: Listing) {
  return statusMeta[listing.status] ?? statusMeta.draft
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await listListings({
      page: page.value,
      limit,
      search: search.value.trim(),
      status: statusFilter.value,
    })
    listings.value = response.listings
    total.value = response.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat listing'
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    const [accRes, prodRes] = await Promise.all([
      listAkulakuAccounts({ page: 1, limit: 100 }),
      listProducts({ page: 1, limit: 100 }),
    ])
    accounts.value = accRes.accounts
    products.value = prodRes.products
  } catch {
    accounts.value = []
    products.value = []
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

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function openCreate() {
  form.value = { productId: '', accountId: '', markupType: 'percent', markupValue: '' }
  formError.value = ''
  isDialogOpen.value = true
  loadOptions()
}

async function submitForm() {
  formError.value = ''
  if (!form.value.productId) return (formError.value = 'Pilih produk dulu')
  if (!form.value.accountId) return (formError.value = 'Pilih akun Akulaku dulu')

  saving.value = true
  try {
    await createListing({
      productId: form.value.productId,
      accountId: form.value.accountId,
      markupType: form.value.markupType,
      markupValue: form.value.markupValue || undefined,
    })
    isDialogOpen.value = false
    await load()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Gagal membuat listing'
  } finally {
    saving.value = false
  }
}

function openBulk() {
  bulkForm.value = { accountId: '', markupType: 'percent', markupValue: '', count: 200 }
  bulkError.value = ''
  bulkNotice.value = ''
  bulkProgress.value = 0
  isBulkOpen.value = true
  loadOptions()
}

async function submitBulk() {
  bulkError.value = ''
  bulkNotice.value = ''
  if (!bulkForm.value.accountId) return (bulkError.value = 'Pilih akun Akulaku dulu')
  const target = Math.min(Math.max(Number(bulkForm.value.count) || 100, 1), 2000)

  bulkSaving.value = true
  bulkProgress.value = 0
  let totalCreated = 0
  const aggregate = { requested: 0, created: 0, skippedExisting: 0, skippedNoPrice: 0, skippedMissing: 0, failed: 0 }

  try {
    // Ambil produk yang belum punya listing, lalu proses bertahap (maks 500/request).
    while (aggregate.created + aggregate.skippedExisting < target) {
      const remaining = target - (aggregate.created + aggregate.skippedExisting)
      const batch = Math.min(remaining, 500)
      const res = await listProducts({ page: 1, limit: Math.min(batch, 100), hasListing: false })
      const ids = res.products.map((p) => p.id)
      if (ids.length === 0) break

      const result = await bulkCreateListings({
        productIds: ids,
        accountId: bulkForm.value.accountId,
        markupType: bulkForm.value.markupType,
        markupValue: bulkForm.value.markupValue || undefined,
      })
      aggregate.requested += result.requested
      aggregate.created += result.created
      aggregate.skippedExisting += result.skippedExisting
      aggregate.skippedNoPrice += result.skippedNoPrice
      aggregate.skippedMissing += result.skippedMissing
      aggregate.failed += result.failed
      bulkProgress.value = aggregate.created + aggregate.skippedExisting

      // Kalau batch ini tidak menambah apa-apa (mis. semua harga kosong), hentikan agar tidak loop.
      if (result.requested === 0 || ids.length === 0) break
      if (result.created === 0 && result.skippedExisting === 0) {
        // tidak ada progres -> hindari infinite loop
        if (result.skippedNoPrice + result.failed >= ids.length) break
      }
    }

    totalCreated = aggregate.created
    bulkNotice.value = `Selesai: ${totalCreated} listing baru dibuat. Dilewati — sudah ada: ${aggregate.skippedExisting}, tanpa harga: ${aggregate.skippedNoPrice}, gagal: ${aggregate.failed}.`
    isBulkOpen.value = false
    page.value = 1
    await load()
  } catch (err) {
    bulkError.value = err instanceof Error ? err.message : 'Gagal bulk listing'
  } finally {
    bulkSaving.value = false
  }
}

async function markPosted(listing: Listing) {
  try {
    await updateListing(listing.id, { status: 'posted' })
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal update status'
  }
}

async function removeListing(listing: Listing) {
  if (!window.confirm(`Hapus listing "${listing.product?.name}"?`)) return
  try {
    await deleteListing(listing.id)
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal menghapus listing'
  }
}

onMounted(() => {
  load()
  loadOptions()
})
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Listing" />
      <ComponentCard
        title="Listing"
        desc="Produk yang dijual di Akulaku beserta markup harga dan status posting."
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form class="flex w-full max-w-md gap-2" @submit.prevent="applySearch">
            <Input v-model="search" type="text" placeholder="Cari nama atau SKU..." />
            <Button type="submit" size="sm">Cari</Button>
          </form>
          <div class="flex items-center gap-2">
            <Select v-model="statusFilter" @update:model-value="applyFilter">
              <SelectTrigger class="w-44">
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" @click="openBulk">Bulk Listing</Button>
            <Button size="sm" @click="openCreate">+ Buat Listing</Button>
          </div>
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
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Produk</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Akun</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Harga Asal</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Markup</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Harga Jual</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Status</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && listings.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="listings.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada listing.</TableCell>
                </TableRow>
                <TableRow v-for="listing in listings" v-else :key="listing.id" class="transition hover:bg-gray-50/50 dark:hover:bg-white/2">
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">
                    <div class="font-medium">{{ listing.product?.name }}</div>
                    <div class="text-xs text-gray-400">{{ listing.product?.sku }}</div>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">
                    {{ listing.account?.label }}
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ formatRupiah(listing.basePrice) }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">
                    {{ listing.markupType === 'percent' ? `${listing.markupValue}%` : formatRupiah(listing.markupValue) }}
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm font-medium text-gray-800 sm:px-6 dark:text-white/90">{{ formatRupiah(listing.sellingPrice) }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="statusOf(listing).color">{{ statusOf(listing).label }}</Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <div class="flex gap-2">
                      <Button v-if="listing.status !== 'posted'" variant="outline" size="sm" @click="markPosted(listing)">Tandai Posted</Button>
                      <Button variant="outline" size="sm" @click="removeListing(listing)">Hapus</Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Total {{ total }} listing · Halaman {{ page }} dari {{ totalPages }}
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" :disabled="loading || page <= 1" @click="goToPage(page - 1)">Sebelumnya</Button>
            <Button variant="outline" size="sm" :disabled="loading || page >= totalPages" @click="goToPage(page + 1)">Berikutnya</Button>
          </div>
        </div>
      </ComponentCard>

      <Dialog :open="isDialogOpen" @update:open="isDialogOpen = $event">
        <DialogContent class="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-146 sm:p-10">
          <DialogHeader class="gap-2 pe-14 text-start">
            <DialogTitle class="text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90">
              Buat Listing
            </DialogTitle>
            <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
              Pilih produk dan akun Akulaku. Markup kosong = pakai aturan tier otomatis.
            </DialogDescription>
          </DialogHeader>

          <form class="space-y-5" novalidate @submit.prevent="submitForm">
            <Field class="gap-1.5">
              <FieldLabel>Produk</FieldLabel>
              <Select v-model="form.productId">
                <SelectTrigger>
                  <SelectValue placeholder="Pilih produk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="product in products" :key="product.id" :value="product.id">
                    {{ product.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Akun Akulaku</FieldLabel>
              <Select v-model="form.accountId">
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="account in accounts" :key="account.id" :value="account.id">
                    {{ account.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div class="grid grid-cols-2 gap-4">
              <Field class="gap-1.5">
                <FieldLabel>Tipe Markup</FieldLabel>
                <Select v-model="form.markupType">
                  <SelectTrigger>
                    <SelectValue placeholder="Tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Persen (%)</SelectItem>
                    <SelectItem value="fixed">Nominal (Rp)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field class="gap-1.5">
              <FieldLabel>Nilai Markup</FieldLabel>
              <Input v-model="form.markupValue" type="number" placeholder="kosongkan = pakai tier otomatis" />
              </Field>
            </div>

            <div
              v-if="formError"
              class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
            >
              {{ formError }}
            </div>

            <DialogFooter class="mx-0 mb-0 gap-3 p-0 pt-2 sm:justify-end">
              <DialogClose as-child>
                <Button variant="outline" type="button">Batal</Button>
              </DialogClose>
              <Button type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan' }}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog :open="isBulkOpen" @update:open="isBulkOpen = $event">
        <DialogContent class="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-146 sm:p-10">
          <DialogHeader class="gap-2 pe-14 text-start">
            <DialogTitle class="text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90">
              Bulk Listing
            </DialogTitle>
            <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
              Buat listing untuk banyak produk sekaligus. Produk yang sudah punya listing akan dilewati.
            </DialogDescription>
          </DialogHeader>

          <form class="space-y-5" novalidate @submit.prevent="submitBulk">
            <Field class="gap-1.5">
              <FieldLabel>Akun Akulaku</FieldLabel>
              <Select v-model="bulkForm.accountId">
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="account in accounts" :key="account.id" :value="account.id">
                    {{ account.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Jumlah produk target</FieldLabel>
              <Input v-model="bulkForm.count" type="number" min="1" max="2000" placeholder="cth: 200" />
              <p class="text-xs text-gray-400">Maksimal 2000 per proses. Sisa bisa diulang.</p>
            </Field>

            <div class="grid grid-cols-2 gap-4">
              <Field class="gap-1.5">
                <FieldLabel>Tipe Markup</FieldLabel>
                <Select v-model="bulkForm.markupType">
                  <SelectTrigger>
                    <SelectValue placeholder="Tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Persen (%)</SelectItem>
                    <SelectItem value="fixed">Nominal (Rp)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field class="gap-1.5">
              <FieldLabel>Nilai Markup</FieldLabel>
              <Input v-model="bulkForm.markupValue" type="number" placeholder="kosongkan = pakai tier otomatis" />
              </Field>
            </div>

            <div v-if="bulkSaving" class="text-sm text-gray-500 dark:text-gray-400">
              Memproses... {{ bulkProgress }} produk sudah diproses.
            </div>

            <div
              v-if="bulkNotice"
              class="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/10 dark:text-success-400"
            >
              {{ bulkNotice }}
            </div>
            <div
              v-if="bulkError"
              class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
            >
              {{ bulkError }}
            </div>

            <DialogFooter class="mx-0 mb-0 gap-3 p-0 pt-2 sm:justify-end">
              <DialogClose as-child>
                <Button variant="outline" type="button">Batal</Button>
              </DialogClose>
              <Button type="submit" :disabled="bulkSaving">{{ bulkSaving ? 'Memproses...' : 'Mulai Bulk' }}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </AdminLayout>
</template>
