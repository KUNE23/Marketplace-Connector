<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import ComponentCard from '@/components/common/ComponentCard.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import {
  listOrders,
  updateOrderStatus,
  type AkulakuOrder,
  type OrderStatus,
} from '@/services/akulakuOrders'
import { formatRupiah } from '@/services/products'

const orders = ref<AkulakuOrder[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const search = ref('')
const statusFilter = ref<OrderStatus | 'all'>('all')
const loading = ref(false)
const error = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const statusMeta: Record<OrderStatus, { label: string; color: 'info' | 'warning' | 'primary' | 'success' | 'error' }> = {
  new: { label: 'Baru', color: 'info' },
  processing: { label: 'Diproses', color: 'warning' },
  shipped: { label: 'Dikirim', color: 'primary' },
  delivered: { label: 'Selesai', color: 'success' },
  cancelled: { label: 'Dibatalkan', color: 'error' },
}

const nextStatus: Record<OrderStatus, OrderStatus | null> = {
  new: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
  delivered: null,
  cancelled: null,
}

function statusOf(order: AkulakuOrder) {
  return statusMeta[order.status] ?? statusMeta.new
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await listOrders({
      page: page.value,
      limit,
      search: search.value.trim(),
      status: statusFilter.value,
    })
    orders.value = response.orders
    total.value = response.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat pesanan'
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

function formatDate(value: string) {
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

async function advanceStatus(order: AkulakuOrder) {
  const next = nextStatus[order.status]
  if (!next) return
  try {
    await updateOrderStatus(order.id, next)
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal update status'
  }
}

async function setStatus(order: AkulakuOrder, status: OrderStatus) {
  try {
    await updateOrderStatus(order.id, status)
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal update status'
  }
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Pesanan" />
      <ComponentCard title="Pesanan Akulaku" desc="Pesanan masuk dari Akulaku beserta statusnya.">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form class="flex w-full max-w-md gap-2" @submit.prevent="applySearch">
            <Input v-model="search" type="text" placeholder="Cari no. order atau pembeli..." />
            <Button type="submit" size="sm">Cari</Button>
          </form>
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
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">No. Order</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Pembeli</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Akun</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Total</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Status</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Waktu</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && orders.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="orders.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada pesanan.</TableCell>
                </TableRow>
                <TableRow v-for="order in orders" v-else :key="order.id" class="transition hover:bg-gray-50/50 dark:hover:bg-white/2">
                  <TableCell class="px-5 py-4 text-start text-sm font-medium text-gray-800 sm:px-6 dark:text-white/90">{{ order.externalId }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ order.buyerName ?? '-' }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ order.accountLabel }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm font-medium text-gray-800 sm:px-6 dark:text-white/90">{{ formatRupiah(order.totalAmt) }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="statusOf(order).color">{{ statusOf(order).label }}</Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ formatDate(order.orderedAt) }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <div class="flex flex-wrap gap-2">
                      <Button
                        v-if="nextStatus[order.status]"
                        size="sm"
                        @click="advanceStatus(order)"
                      >
                        → {{ statusMeta[nextStatus[order.status] as OrderStatus].label }}
                      </Button>
                      <Button
                        v-if="order.status !== 'cancelled' && order.status !== 'delivered'"
                        variant="outline"
                        size="sm"
                        @click="setStatus(order, 'cancelled')"
                      >
                        Batalkan
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Total {{ total }} pesanan · Halaman {{ page }} dari {{ totalPages }}
          </p>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="loading || page <= 1" @click="goToPage(page - 1)">Sebelumnya</Button>
            <Button variant="outline" size="sm" :disabled="loading || page >= totalPages" @click="goToPage(page + 1)">Berikutnya</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  </AdminLayout>
</template>
