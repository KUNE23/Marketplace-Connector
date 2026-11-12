<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { getDashboardSummary, type DashboardSummary } from '@/services/dashboard'
import { BUCKET_OPTIONS, getRecap, PRESET_OPTIONS, type RecapBucket, type RecapBucketRow, type RecapPreset, type RecapSummary } from '@/services/recap'
import {
  getEmployeeDetail,
  getLeaderboard,
  type EmployeeDetailResponse,
  type LeaderboardRow,
} from '@/services/leaderboard'
import { listOrders, exportOrders, type AkulakuOrder } from '@/services/akulakuOrders'
import { formatRupiah } from '@/services/products'
import { orderStatusMeta } from '@/utils/labels'

const toast = useToast()

const summary = ref<DashboardSummary | null>(null)
const recapBuckets = ref<RecapBucketRow[]>([])
const recapSummary = ref<RecapSummary>({ omzet: 0, modal: 0, adSpend: 0, profit: 0, orderCount: 0, avgOrderValue: 0 })
const preset = ref<RecapPreset>('30d')
const bucket = ref<RecapBucket>('daily')
const customFrom = ref('')
const customTo = ref('')
const orders = ref<AkulakuOrder[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const exporting = ref(false)

// Leaderboard (digabung ke halaman ini)
const leaderboard = ref<LeaderboardRow[]>([])
const lbTotals = ref({ omzet: 0, profit: 0, employees: 0 })
const isLbDetailOpen = ref(false)
const lbDetail = ref<EmployeeDetailResponse | null>(null)

async function loadLeaderboard() {
  try {
    // Ikutkan rentang tanggal dari rekap agar angkanya konsisten.
    const params =
      preset.value === 'custom'
        ? { from: customFrom.value || undefined, to: customTo.value || undefined }
        : {}
    const res = await getLeaderboard(params)
    leaderboard.value = res.leaderboard
    lbTotals.value = res.totals
  } catch {
    leaderboard.value = []
  }
}

async function openLbDetail(row: LeaderboardRow) {
  if (!row.userId) return
  isLbDetailOpen.value = true
  lbDetail.value = null
  try {
    const params =
      preset.value === 'custom'
        ? { from: customFrom.value || undefined, to: customTo.value || undefined }
        : {}
    lbDetail.value = await getEmployeeDetail(row.userId, params)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat detail')
    isLbDetailOpen.value = false
  }
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const maxRecapValue = computed(() => Math.max(1, ...recapBuckets.value.map((r) => Math.max(r.omzet, Math.max(0, r.profit)))))

function statusOf(status: string) {
  return orderStatusMeta[status] ?? orderStatusMeta.new
}

async function load() {
  loading.value = true
  try {
    const [sum, orderRes] = await Promise.all([
      getDashboardSummary(),
      listOrders({ page: page.value, limit }),
    ])
    summary.value = sum
    orders.value = orderRes.orders
    total.value = orderRes.total
    await loadRecap()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat data penjualan')
  } finally {
    loading.value = false
  }
}

async function loadRecap() {
  try {
    const res = await getRecap({
      preset: preset.value,
      bucket: bucket.value,
      from: preset.value === 'custom' ? customFrom.value || undefined : undefined,
      to: preset.value === 'custom' ? customTo.value || undefined : undefined,
    })
    recapBuckets.value = res.buckets
    recapSummary.value = res.summary
    await loadLeaderboard()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat rekap')
  }
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  load()
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

async function doExport() {
  exporting.value = true
  try {
    await exportOrders({})
    toast.success('Export selesai, file terunduh.')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal mengekspor')
  } finally {
    exporting.value = false
  }
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Penjualan" />
      <div class="space-y-5 sm:space-y-6">
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Omzet Akulaku (total)</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {{ formatRupiah(summary?.revenue.total ?? 0) }}
            </p>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Omzet Hari Ini</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {{ formatRupiah(summary?.revenue.today ?? 0) }}
            </p>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Profit Bersih</p>
            <p class="mt-2 text-2xl font-semibold text-success-600 dark:text-success-400">
              {{ formatRupiah(summary?.profit.total ?? 0) }}
            </p>
            <p class="mt-1 text-xs text-gray-400">Modal: {{ formatRupiah(summary?.profit.modal ?? 0) }} · Iklan: {{ formatRupiah(summary?.profit.adSpend ?? 0) }}</p>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Total Pesanan</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {{ summary?.orders.total ?? 0 }}
            </p>
            <p class="mt-1 text-xs text-gray-400">Hari ini: {{ summary?.orders.today ?? 0 }}</p>
          </div>
          <div class="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white p-5 dark:bg-white/3">
            <p class="text-sm text-gray-500 dark:text-gray-400">Status Pesanan</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <Badge size="sm" color="info">Baru {{ summary?.orders.new ?? 0 }}</Badge>
              <Badge size="sm" color="warning">Diproses {{ summary?.orders.processing ?? 0 }}</Badge>
              <Badge size="sm" color="primary">Dikirim {{ summary?.orders.shipped ?? 0 }}</Badge>
              <Badge size="sm" color="success">Selesai {{ summary?.orders.delivered ?? 0 }}</Badge>
            </div>
          </div>
        </div>

        <ComponentCard title="Rekap Omzet & Profit" desc="Pilih periode (hari, minggu, bulan, tahun) dan granularitas tampilan.">
          <div class="flex flex-wrap items-end gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500 dark:text-gray-400">Periode</label>
              <Select v-model="preset" @update:model-value="loadRecap">
                <SelectTrigger class="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in PRESET_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500 dark:text-gray-400">Tampilan</label>
              <Select v-model="bucket" @update:model-value="loadRecap">
                <SelectTrigger class="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in BUCKET_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <template v-if="preset === 'custom'">
              <div class="flex flex-col gap-1">
                <label class="text-xs text-gray-500 dark:text-gray-400">Dari</label>
                <Input v-model="customFrom" type="date" class="w-40" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-gray-500 dark:text-gray-400">Sampai</label>
                <Input v-model="customTo" type="date" class="w-40" />
              </div>
              <Button size="sm" @click="loadRecap">Terapkan</Button>
            </template>
          </div>

          <!-- Ringkasan periode terpilih -->
          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Omzet</p>
              <p class="text-sm font-semibold text-gray-800 dark:text-white/90">{{ formatRupiah(recapSummary.omzet) }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Modal</p>
              <p class="text-sm font-semibold text-gray-800 dark:text-white/90">{{ formatRupiah(recapSummary.modal) }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Iklan</p>
              <p class="text-sm font-semibold text-gray-800 dark:text-white/90">{{ formatRupiah(recapSummary.adSpend) }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Profit</p>
              <p class="text-sm font-semibold text-success-600 dark:text-success-400">{{ formatRupiah(recapSummary.profit) }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Pesanan</p>
              <p class="text-sm font-semibold text-gray-800 dark:text-white/90">{{ recapSummary.orderCount }}</p>
              <p class="text-[10px] text-gray-400">rata-rata {{ formatRupiah(recapSummary.avgOrderValue) }}</p>
            </div>
          </div>

          <div class="mb-3 mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500/80" /> Omzet</span>
            <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm bg-success-500/80" /> Profit</span>
          </div>
          <div class="flex h-52 items-end gap-1.5 overflow-x-auto">
            <p v-if="recapBuckets.length === 0" class="w-full py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Tidak ada data pada periode ini.
            </p>
            <div
              v-for="entry in recapBuckets"
              v-else
              :key="entry.key"
              class="group flex min-w-8 flex-1 flex-col items-center justify-end gap-1"
              :title="`${entry.label}\nOmzet: ${formatRupiah(entry.omzet)}\nModal: ${formatRupiah(entry.modal)}\nIklan: ${formatRupiah(entry.adSpend)}\nProfit: ${formatRupiah(entry.profit)}\n(${entry.orderCount} pesanan)`"
            >
              <div class="flex w-full items-end justify-center gap-0.5">
                <div
                  class="w-1/2 rounded-t bg-brand-500/80 transition-all group-hover:bg-brand-500"
                  :style="{ height: Math.max(2, (entry.omzet / maxRecapValue) * 180) + 'px' }"
                />
                <div
                  class="w-1/2 rounded-t bg-success-500/80 transition-all group-hover:bg-success-500"
                  :style="{ height: Math.max(2, (Math.max(0, entry.profit) / maxRecapValue) * 180) + 'px' }"
                />
              </div>
              <span class="text-[10px] text-gray-400">{{ entry.label }}</span>
            </div>
          </div>

          <!-- Tabel rincian per bucket -->
          <div class="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
            <div class="max-w-full overflow-x-auto">
              <Table>
                <TableHeader class="border-b border-gray-100 dark:border-white/5">
                  <TableRow>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Periode</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Pesanan</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Omzet</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Modal</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Iklan</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Profit</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                  <TableRow v-if="recapBuckets.length === 0">
                    <TableCell colspan="6" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      Tidak ada data.
                    </TableCell>
                  </TableRow>
                  <TableRow v-for="b in recapBuckets" v-else :key="b.key">
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-800 dark:text-white/90">{{ b.label }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">{{ b.orderCount }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-800 dark:text-white/90">{{ formatRupiah(b.omzet) }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">{{ formatRupiah(b.modal) }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">{{ formatRupiah(b.adSpend) }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm font-medium text-success-600 dark:text-success-400">{{ formatRupiah(b.profit) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </ComponentCard>

        <ComponentCard title="Pesanan Akulaku" desc="Transaksi yang masuk dari marketplace Akulaku.">
          <div class="flex justify-end gap-2">
            <Button variant="outline" size="sm" :disabled="exporting" @click="doExport">
              {{ exporting ? 'Mengekspor...' : 'Export Excel' }}
            </Button>
            <Button variant="outline" size="sm" :disabled="loading" @click="load">
              {{ loading ? 'Memuat...' : 'Muat Ulang' }}
            </Button>
          </div>

          <div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
            <div class="max-w-full overflow-x-auto">
              <Table>
                <TableHeader class="border-b border-gray-100 dark:border-white/5">
                  <TableRow>
                    <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">No. Order</TableCell>
                    <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Pembeli</TableCell>
                    <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Akun</TableCell>
                    <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Status</TableCell>
                    <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Total</TableCell>
                    <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Tanggal</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                  <TableRow v-if="loading && orders.length === 0">
                    <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                  </TableRow>
                  <TableRow v-else-if="orders.length === 0">
                    <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada pesanan Akulaku.</TableCell>
                  </TableRow>
                  <TableRow v-for="order in orders" v-else :key="order.id" class="transition hover:bg-gray-50/50 dark:hover:bg-white/2">
                    <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">{{ order.externalId }}</TableCell>
                    <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ order.buyerName ?? '-' }}</TableCell>
                    <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ order.accountLabel }}</TableCell>
                    <TableCell class="px-5 py-4 text-start sm:px-6">
                      <Badge size="sm" :color="statusOf(order.status).color">{{ statusOf(order.status).label }}</Badge>
                    </TableCell>
                    <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ formatRupiah(order.totalAmt) }}</TableCell>
                    <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ formatDate(order.orderedAt) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Total {{ total }} pesanan · Halaman {{ page }} dari {{ totalPages }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" :disabled="loading || page <= 1" @click="goToPage(page - 1)">Sebelumnya</Button>
              <Button variant="outline" size="sm" :disabled="loading || page >= totalPages" @click="goToPage(page + 1)">Berikutnya</Button>
            </div>
          </div>
        </ComponentCard>

        <!-- Leaderboard omzet per pegawai (digabung dari halaman terpisah). -->
        <ComponentCard
          title="Leaderboard Omzet Pegawai"
          desc="Peringkat omzet per pegawai pada periode yang dipilih di atas. Klik Detail untuk rincian per akun."
        >
          <div class="mb-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>Periode mengikuti filter Rekap di atas.</span>
            <span v-if="leaderboard.length">Total omzet: {{ formatRupiah(lbTotals.omzet) }}</span>
          </div>

          <div class="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
            <div class="max-w-full overflow-x-auto">
              <Table>
                <TableHeader class="border-b border-gray-100 dark:border-white/5">
                  <TableRow>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">#</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Pegawai</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Akun</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Pesanan</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Omzet</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Profit</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Aksi</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                  <TableRow v-if="leaderboard.length === 0">
                    <TableCell colspan="7" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      Belum ada data omzet.
                    </TableCell>
                  </TableRow>
                  <TableRow v-for="row in leaderboard" v-else :key="row.userId ?? row.name">
                    <TableCell class="px-4 py-3 text-start text-sm">
                      <Badge size="sm" :color="row.rank === 1 ? 'warning' : row.rank === 2 ? 'gray' : row.rank === 3 ? 'info' : 'gray'">
                        {{ row.rank }}
                      </Badge>
                    </TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-800 dark:text-white/90">
                      <div class="font-medium">{{ row.name }}</div>
                      <div class="text-xs text-gray-400">{{ row.email ?? '-' }}</div>
                    </TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">
                      {{ row.activeAccounts }}/{{ row.accountCount }}
                    </TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">{{ row.orderCount }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm font-medium text-gray-800 dark:text-white/90">{{ formatRupiah(row.omzet) }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm font-medium text-success-600 dark:text-success-400">{{ formatRupiah(row.profit) }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm">
                      <Button variant="outline" size="sm" :disabled="!row.userId" @click="openLbDetail(row)">Detail</Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </ComponentCard>
      </div>
    </div>

    <!-- Modal detail leaderboard per pegawai -->
    <Dialog :open="isLbDetailOpen" @update:open="isLbDetailOpen = $event">
      <DialogContent class="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-3xl sm:p-8">
        <DialogHeader class="gap-2 pe-14 text-start">
          <DialogTitle class="text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90">
            Detail Omzet Pegawai
          </DialogTitle>
          <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
            {{ lbDetail?.employee?.name ?? '-' }}
            <span v-if="lbDetail?.employee?.email"> · {{ lbDetail.employee.email }}</span>
          </DialogDescription>
        </DialogHeader>

        <div v-if="!lbDetail" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat...</div>
        <div v-else class="max-h-[65vh] space-y-3 overflow-y-auto pe-1">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Omzet</p>
              <p class="text-sm font-semibold text-gray-800 dark:text-white/90">{{ formatRupiah(lbDetail.totals.omzet) }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Modal</p>
              <p class="text-sm font-semibold text-gray-800 dark:text-white/90">{{ formatRupiah(lbDetail.totals.modal) }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Iklan</p>
              <p class="text-sm font-semibold text-gray-800 dark:text-white/90">{{ formatRupiah(lbDetail.totals.adSpend) }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <p class="text-xs text-gray-500 dark:text-gray-400">Profit</p>
              <p class="text-sm font-semibold text-success-600 dark:text-success-400">{{ formatRupiah(lbDetail.totals.profit) }}</p>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
            <div class="max-w-full overflow-x-auto">
              <Table>
                <TableHeader class="border-b border-gray-100 dark:border-white/5">
                  <TableRow>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Akun Akulaku</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Pesanan</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Omzet</TableCell>
                    <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Profit</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                  <TableRow v-if="lbDetail.accounts.length === 0">
                    <TableCell colspan="4" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada akun.</TableCell>
                  </TableRow>
                  <TableRow v-for="acc in lbDetail.accounts" v-else :key="acc.accountId">
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-800 dark:text-white/90">
                      <div class="font-medium">{{ acc.label }}</div>
                      <div class="text-xs text-gray-400">{{ acc.username }}</div>
                    </TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">{{ acc.orderCount }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm font-medium text-gray-800 dark:text-white/90">{{ formatRupiah(acc.omzet) }}</TableCell>
                    <TableCell class="px-4 py-3 text-start text-sm font-medium text-success-600 dark:text-success-400">{{ formatRupiah(acc.profit) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter class="mx-0 mb-0 gap-3 p-0 pt-2 sm:justify-end">
          <DialogClose as-child>
            <Button variant="outline" type="button">Tutup</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
