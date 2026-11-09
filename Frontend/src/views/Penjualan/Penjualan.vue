<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
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
import { getDashboardRecap, getDashboardSummary, type DashboardSummary, type RecapEntry } from '@/services/dashboard'
import { listOrders, type AkulakuOrder } from '@/services/akulakuOrders'
import { formatRupiah } from '@/services/products'
import { orderStatusMeta } from '@/utils/labels'

const toast = useToast()

const summary = ref<DashboardSummary | null>(null)
const recap = ref<RecapEntry[]>([])
const orders = ref<AkulakuOrder[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const recapDays = ref(14)
const loading = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const maxRevenue = computed(() => Math.max(1, ...recap.value.map((r) => r.revenue)))

function statusOf(status: string) {
  return orderStatusMeta[status] ?? orderStatusMeta.new
}

async function load() {
  loading.value = true
  try {
    const [sum, rec, orderRes] = await Promise.all([
      getDashboardSummary(),
      getDashboardRecap(recapDays.value),
      listOrders({ page: page.value, limit }),
    ])
    summary.value = sum
    recap.value = rec.recap
    orders.value = orderRes.orders
    total.value = orderRes.total
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat data penjualan')
  } finally {
    loading.value = false
  }
}

async function loadRecap() {
  try {
    recap.value = (await getDashboardRecap(recapDays.value)).recap
  } catch {
    /* biarkan */
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

        <ComponentCard title="Rekap Omzet & Profit" desc="Omzet, modal, biaya iklan & profit Akulaku per hari.">
          <div class="flex items-center justify-end gap-2">
            <Select :model-value="String(recapDays)" @update:model-value="(v) => { recapDays = Number(v); loadRecap() }">
              <SelectTrigger class="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 hari</SelectItem>
                <SelectItem value="14">14 hari</SelectItem>
                <SelectItem value="30">30 hari</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="mb-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500/80" /> Omzet</span>
            <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm bg-success-500/80" /> Profit</span>
          </div>
          <div class="flex h-52 items-end gap-1.5 overflow-x-auto">
            <div
              v-for="entry in recap"
              :key="entry.date"
              class="group flex min-w-8 flex-1 flex-col items-center justify-end gap-1"
              :title="`${formatShortDate(entry.date)}\nOmzet: ${formatRupiah(entry.revenue)}\nModal: ${formatRupiah(entry.modal)}\nIklan: ${formatRupiah(entry.adSpend)}\nProfit: ${formatRupiah(entry.profit)}\n(${entry.orders} pesanan)`"
            >
              <div class="flex w-full items-end justify-center gap-0.5">
                <div
                  class="w-1/2 rounded-t bg-brand-500/80 transition-all group-hover:bg-brand-500"
                  :style="{ height: Math.max(2, (entry.revenue / maxRevenue) * 180) + 'px' }"
                />
                <div
                  class="w-1/2 rounded-t bg-success-500/80 transition-all group-hover:bg-success-500"
                  :style="{ height: Math.max(2, (Math.max(0, entry.profit) / maxRevenue) * 180) + 'px' }"
                />
              </div>
              <span class="text-[10px] text-gray-400">{{ formatShortDate(entry.date) }}</span>
            </div>
          </div>
        </ComponentCard>

        <ComponentCard title="Pesanan Akulaku" desc="Transaksi yang masuk dari marketplace Akulaku.">
          <div class="flex justify-end">
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
      </div>
    </div>
  </AdminLayout>
</template>
