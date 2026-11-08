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
import { enqueueSyncOrders, listJobs, retryJob, type Job, type JobStatus } from '@/services/jobs'

const jobs = ref<Job[]>([])
const total = ref(0)
const page = ref(1)
const limit = 15
const statusFilter = ref<JobStatus | 'all'>('all')
const loading = ref(false)
const error = ref('')
const notice = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const statusMeta: Record<JobStatus, { label: string; color: 'gray' | 'warning' | 'success' | 'error' }> = {
  pending: { label: 'Pending', color: 'gray' },
  running: { label: 'Running', color: 'warning' },
  done: { label: 'Done', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
}

function statusOf(job: Job) {
  return statusMeta[job.status] ?? statusMeta.pending
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await listJobs({ page: page.value, limit, status: statusFilter.value })
    jobs.value = response.jobs
    total.value = response.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat jobs'
  } finally {
    loading.value = false
  }
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

async function triggerSyncOrders() {
  notice.value = ''
  try {
    await enqueueSyncOrders()
    notice.value = 'Job sync order diantrikan. Pastikan worker jalan.'
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal enqueue'
  }
}

async function doRetry(job: Job) {
  try {
    await retryJob(job.id)
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal retry job'
  }
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Jobs" />
      <ComponentCard title="Antrian Worker" desc="Pekerjaan otomasi Akulaku (posting & sync order).">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Worker: <code class="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-white/10">npm run worker</code>
          </p>
          <div class="flex items-center gap-2">
            <Select v-model="statusFilter" @update:model-value="applyFilter">
              <SelectTrigger class="w-40">
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" :disabled="loading" @click="load">Refresh</Button>
            <Button size="sm" @click="triggerSyncOrders">Sync Order</Button>
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
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">ID</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Tipe</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Status</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Attempt</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Error</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Dibuat</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && jobs.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="jobs.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada job.</TableCell>
                </TableRow>
                <TableRow v-for="job in jobs" v-else :key="job.id" class="transition hover:bg-gray-50/50 dark:hover:bg-white/2">
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">#{{ job.id }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ job.type }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="statusOf(job).color">{{ statusOf(job).label }}</Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ job.attempts }}/{{ job.maxAttempts }}</TableCell>
                  <TableCell class="max-w-xs truncate px-5 py-4 text-start text-xs text-error-500 sm:px-6">{{ job.lastError ?? '-' }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ formatDate(job.createdAt) }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Button v-if="job.status === 'failed'" variant="outline" size="sm" @click="doRetry(job)">Retry</Button>
                    <span v-else>-</span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Total {{ total }} job · Halaman {{ page }} dari {{ totalPages }}
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" :disabled="loading || page <= 1" @click="goToPage(page - 1)">Sebelumnya</Button>
            <Button variant="outline" size="sm" :disabled="loading || page >= totalPages" @click="goToPage(page + 1)">Berikutnya</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  </AdminLayout>
</template>
