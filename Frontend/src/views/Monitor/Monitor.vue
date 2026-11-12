<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
import {
  getAuditLog,
  getMonitorOverview,
  getRequestStats,
  type AuditLogEntry,
  type MonitorOverview,
  type RequestStats,
} from '@/services/monitor'
import {
  backupDownloadUrl,
  cleanupLogs,
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
  type BackupItem,
  type BackupScheduler,
} from '@/services/backups'
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

const toast = useToast()

const data = ref<MonitorOverview | null>(null)
const stats = ref<RequestStats | null>(null)
const audit = ref<AuditLogEntry[]>([])
const auditActions = ref<string[]>([])
const actionFilter = ref('all')
const windowMinutes = ref(60)
const loading = ref(false)
const autoRefresh = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

// === Backup ===
const backups = ref<BackupItem[]>([])
const backupDir = ref('')
const backupTotalMb = ref(0)
const scheduler = ref<BackupScheduler | null>(null)
const backupBusy = ref(false)
const isRestoreOpen = ref(false)
const restoreTarget = ref<BackupItem | null>(null)
const restoreConfirm = ref('')

const maxTimeline = computed(() => Math.max(1, ...(stats.value?.timeline ?? []).map((t) => t.requests)))

async function load() {
  loading.value = true
  try {
    const [ov, st, au] = await Promise.all([
      getMonitorOverview(),
      getRequestStats(windowMinutes.value),
      getAuditLog({ limit: 50, action: actionFilter.value === 'all' ? undefined : actionFilter.value }),
    ])
    data.value = ov
    stats.value = st
    audit.value = au.logs
    auditActions.value = au.actions
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal memuat data monitor'
    toast.error(msg)
  } finally {
    loading.value = false
  }
}

function refreshWindow(value: unknown) {
  windowMinutes.value = Number(value) || 60
  load()
}

function applyAction() {
  load()
}

function toggleAuto() {
  autoRefresh.value = !autoRefresh.value
  setupTimer()
}

function setupTimer() {
  if (timer) clearInterval(timer)
  if (autoRefresh.value) timer = setInterval(load, 15000)
}

function roleColor(role: string | null) {
  if (role === 'SUPERADMIN') return 'error' as const
  if (role === 'ADMIN') return 'warning' as const
  return 'gray' as const
}

function statusColor(s: string) {
  return s === 'success' ? ('success' as const) : ('error' as const)
}

function formatTime(v: string) {
  return new Date(v).toLocaleString('id-ID')
}

async function loadBackups() {
  try {
    const res = await listBackups()
    backups.value = res.items
    backupDir.value = res.dir
    backupTotalMb.value = res.totalMb
    scheduler.value = res.scheduler
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat daftar backup')
  }
}

async function doBackup() {
  backupBusy.value = true
  try {
    const res = await createBackup()
    toast.success(`Backup dibuat: ${res.fileName} (${res.sizeMb} MB, ${res.totalRows} baris)`)
    await loadBackups()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal membuat backup')
  } finally {
    backupBusy.value = false
  }
}

async function doDeleteBackup(item: BackupItem) {
  if (!window.confirm(`Hapus backup "${item.fileName}"?`)) return
  try {
    await deleteBackup(item.fileName)
    toast.success('Backup dihapus.')
    await loadBackups()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menghapus backup')
  }
}

function openRestore(item: BackupItem) {
  restoreTarget.value = item
  restoreConfirm.value = ''
  isRestoreOpen.value = true
}

async function doRestore() {
  if (!restoreTarget.value) return
  if (restoreConfirm.value !== restoreTarget.value.fileName) {
    return toast.warning('Ketik nama file persis sama untuk konfirmasi.')
  }
  backupBusy.value = true
  try {
    const res = await restoreBackup(restoreTarget.value.fileName, restoreConfirm.value)
    toast.success(`Restore selesai. Backup pengaman: ${res.safetyBackup}`)
    isRestoreOpen.value = false
    await Promise.all([loadBackups(), load()])
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal restore')
  } finally {
    backupBusy.value = false
  }
}

async function doCleanupLogs() {
  if (!window.confirm('Hapus log lama (AuditLog & RequestMetric) sesuai retensi?')) return
  try {
    const res = await cleanupLogs()
    toast.success(`Log dihapus: audit ${res.auditDeleted}, metrik ${res.metricsDeleted}.`)
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal membersihkan log')
  }
}

function formatDate(v: string) {
  return new Date(v).toLocaleString('id-ID')
}

onMounted(() => {
  load()
  loadBackups()
  setupTimer()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <AdminLayout>
    <div class="space-y-5">
      <PageBreadcrumb pageTitle="Monitor Sistem" />

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Khusus SUPERADMIN · pembaruan otomatis tiap 15 detik
        </p>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="toggleAuto">
            {{ autoRefresh ? 'Matikan Auto' : 'Nyalakan Auto' }}
          </Button>
          <Button size="sm" :disabled="loading" @click="load">{{ loading ? 'Memuat...' : 'Muat Ulang' }}</Button>
        </div>
      </div>

      <!-- Ringkasan data -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <div v-for="(val, key) in (data?.overview ?? {})" :key="String(key)" class="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-white/3">
          <p class="text-xs capitalize text-gray-500 dark:text-gray-400">{{ String(key).replace('24h', ' (24 jam)') }}</p>
          <p class="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">{{ val }}</p>
        </div>
      </div>

      <!-- Server -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ComponentCard title="Kinerja Server" desc="CPU, memori, dan proses Node.">
          <div class="space-y-3">
            <div>
              <div class="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>CPU ({{ data?.server.cpu.cores }} core)</span>
                <span>{{ data?.server.cpu.usagePercent ?? 0 }}%</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  class="h-full rounded-full bg-brand-500 transition-all"
                  :style="{ width: (data?.server.cpu.usagePercent ?? 0) + '%' }"
                />
              </div>
              <p class="mt-1 text-[10px] text-gray-400">
                load: {{ data?.server.cpu.loadAvg1 }} / {{ data?.server.cpu.loadAvg5 }} / {{ data?.server.cpu.loadAvg15 }}
              </p>
            </div>

            <div>
              <div class="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Memori</span>
                <span>{{ data?.server.memory.usedMb }} / {{ data?.server.memory.totalMb }} MB</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  class="h-full rounded-full bg-warning-500 transition-all"
                  :style="{ width: (data?.server.memory.usedPercent ?? 0) + '%' }"
                />
              </div>
              <p class="mt-1 text-[10px] text-gray-400">{{ data?.server.memory.usedPercent ?? 0 }}% terpakai</p>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div class="rounded-lg border border-gray-200 p-2 dark:border-white/10">
                <p class="text-gray-500 dark:text-gray-400">Node</p>
                <p class="font-medium text-gray-800 dark:text-white/90">{{ data?.server.process.nodeVersion }}</p>
              </div>
              <div class="rounded-lg border border-gray-200 p-2 dark:border-white/10">
                <p class="text-gray-500 dark:text-gray-400">Uptime Proses</p>
                <p class="font-medium text-gray-800 dark:text-white/90">{{ data?.server.process.uptimeHuman }}</p>
              </div>
              <div class="rounded-lg border border-gray-200 p-2 dark:border-white/10">
                <p class="text-gray-500 dark:text-gray-400">Heap</p>
                <p class="font-medium text-gray-800 dark:text-white/90">{{ data?.server.process.heapUsedMb }} MB</p>
              </div>
              <div class="rounded-lg border border-gray-200 p-2 dark:border-white/10">
                <p class="text-gray-500 dark:text-gray-400">Database</p>
                <p class="font-medium" :class="data?.database.ok ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'">
                  {{ data?.database.ok ? `OK (${data.database.latencyMs}ms)` : 'GAGAL' }}
                </p>
              </div>
            </div>

            <p class="text-[10px] text-gray-400">
              {{ data?.server.system.platform }} · {{ data?.server.system.arch }} · {{ data?.server.system.hostname }}
              · system uptime {{ data?.server.system.systemUptimeHuman }}
            </p>
          </div>
        </ComponentCard>

        <ComponentCard title="Kecepatan API" desc="Statistik request pada rentang waktu terpilih.">
          <div class="mb-3 flex items-center gap-2">
            <Select :model-value="String(windowMinutes)" @update:model-value="refreshWindow">
              <SelectTrigger class="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 menit</SelectItem>
                <SelectItem value="60">1 jam</SelectItem>
                <SelectItem value="360">6 jam</SelectItem>
                <SelectItem value="1440">24 jam</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div class="rounded-lg border border-gray-200 p-2 dark:border-white/10">
              <p class="text-gray-500 dark:text-gray-400">Request</p>
              <p class="font-semibold text-gray-800 dark:text-white/90">{{ stats?.total ?? 0 }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-2 dark:border-white/10">
              <p class="text-gray-500 dark:text-gray-400">Rata-rata</p>
              <p class="font-semibold text-gray-800 dark:text-white/90">{{ stats?.avgMs ?? 0 }} ms</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-2 dark:border-white/10">
              <p class="text-gray-500 dark:text-gray-400">p95</p>
              <p class="font-semibold text-gray-800 dark:text-white/90">{{ stats?.p95Ms ?? 0 }} ms</p>
            </div>
            <div class="rounded-lg border border-gray-200 p-2 dark:border-white/10">
              <p class="text-gray-500 dark:text-gray-400">Error</p>
              <p class="font-semibold" :class="(stats?.errorRate ?? 0) > 5 ? 'text-error-600 dark:text-error-400' : 'text-success-600 dark:text-success-400'">
                {{ stats?.errorRate ?? 0 }}%
              </p>
            </div>
          </div>

          <!-- Timeline -->
          <div class="mt-3 flex h-24 items-end gap-0.5 overflow-x-auto">
            <div
              v-for="t in stats?.timeline ?? []"
              :key="t.minute"
              class="min-w-1 flex-1 rounded-t"
              :class="t.errors > 0 ? 'bg-error-400' : 'bg-brand-400'"
              :style="{ height: Math.max(2, (t.requests / maxTimeline) * 90) + 'px' }"
              :title="`${t.minute} · ${t.requests} request · ${t.errors} error · ${t.avgMs}ms`"
            />
          </div>
        </ComponentCard>
      </div>

      <!-- Endpoint -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ComponentCard title="Endpoint Tersibuk" desc="Paling banyak dipanggil.">
          <div class="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Endpoint</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Jumlah</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="!stats?.busiest?.length">
                  <TableCell colspan="2" class="px-4 py-4 text-center text-xs text-gray-400">Belum ada data.</TableCell>
                </TableRow>
                <TableRow v-for="e in stats?.busiest ?? []" v-else :key="e.endpoint">
                  <TableCell class="px-4 py-2 text-start text-xs text-gray-700 dark:text-gray-300">{{ e.endpoint }}</TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs font-medium text-gray-800 dark:text-white/90">{{ e.count }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </ComponentCard>

        <ComponentCard title="Endpoint Terlambat" desc="Rata-rata durasi tertinggi.">
          <div class="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Endpoint</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Rata-rata</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="!stats?.slowest?.length">
                  <TableCell colspan="2" class="px-4 py-4 text-center text-xs text-gray-400">Belum ada data.</TableCell>
                </TableRow>
                <TableRow v-for="e in stats?.slowest ?? []" v-else :key="e.endpoint">
                  <TableCell class="px-4 py-2 text-start text-xs text-gray-700 dark:text-gray-300">{{ e.endpoint }}</TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs font-medium" :class="(e.avgMs ?? 0) > 1000 ? 'text-error-600 dark:text-error-400' : 'text-gray-800 dark:text-white/90'">
                    {{ e.avgMs }} ms
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </ComponentCard>
      </div>

      <!-- Audit log -->
      <ComponentCard title="Log Aktivitas" desc="Siapa melakukan apa, kapan, dari IP mana.">
        <div class="mb-3 flex items-center gap-2">
          <Select v-model="actionFilter" @update:model-value="applyAction">
            <SelectTrigger class="w-48">
              <SelectValue placeholder="Semua aksi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua aksi</SelectItem>
              <SelectItem v-for="a in auditActions" :key="a" :value="a">{{ a }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
          <div class="max-w-full overflow-x-auto">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Waktu</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">User</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Aksi</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Resource</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Status</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">IP</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="audit.length === 0">
                  <TableCell colspan="6" class="px-4 py-6 text-center text-xs text-gray-400">Belum ada aktivitas tercatat.</TableCell>
                </TableRow>
                <TableRow v-for="log in audit" v-else :key="log.id">
                  <TableCell class="px-4 py-2 text-start text-xs text-gray-500 dark:text-gray-400">{{ formatTime(log.createdAt) }}</TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs text-gray-700 dark:text-gray-300">
                    <div>{{ log.userEmail ?? '-' }}</div>
                    <Badge v-if="log.userRole" size="sm" :color="roleColor(log.userRole)">{{ log.userRole }}</Badge>
                  </TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs font-medium text-gray-800 dark:text-white/90">{{ log.action }}</TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs text-gray-500 dark:text-gray-400">
                    {{ log.resource ?? '-' }}{{ log.resourceId ? ` #${log.resourceId}` : '' }}
                  </TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs">
                    <Badge size="sm" :color="statusColor(log.status)">{{ log.status }}</Badge>
                  </TableCell>
                  <TableCell class="px-4 py-2 text-start text-[10px] text-gray-400">{{ log.ip ?? '-' }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </ComponentCard>
      <!-- Backup & Restore -->
      <ComponentCard
        title="Backup & Restore Database"
        desc="Backup manual, otomatis, dan restore penuh. Restore akan MENGGANTI seluruh data dengan isi backup."
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <p>Folder: <code class="text-gray-700 dark:text-gray-300">{{ backupDir }}</code></p>
            <p>
              {{ backups.length }} file · total {{ backupTotalMb }} MB ·
              auto-backup
              <strong :class="scheduler?.enabled ? 'text-success-600 dark:text-success-400' : 'text-gray-500'">
                {{ scheduler?.enabled ? `aktif tiap ${scheduler?.intervalHours} jam` : 'nonaktif' }}
              </strong>
              · simpan {{ scheduler?.retentionKeep }} terakhir · log {{ scheduler?.logRetentionDays }} hari
            </p>
            <p v-if="scheduler?.lastRun">Terakhir jalan: {{ formatDate(scheduler.lastRun) }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" :disabled="backupBusy" @click="doBackup">
              {{ backupBusy ? 'Memproses...' : 'Backup Sekarang' }}
            </Button>
            <Button variant="outline" size="sm" :disabled="backupBusy" @click="doCleanupLogs">Bersihkan Log Lama</Button>
            <Button variant="outline" size="sm" :disabled="backupBusy" @click="loadBackups">Muat Ulang</Button>
          </div>
        </div>

        <div class="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
          <div class="max-w-full overflow-x-auto">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Nama File</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Ukuran</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Dibuat</TableCell>
                  <TableCell isHeader class="px-4 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="backups.length === 0">
                  <TableCell colspan="4" class="px-4 py-6 text-center text-xs text-gray-400">
                    Belum ada backup. Klik "Backup Sekarang".
                  </TableCell>
                </TableRow>
                <TableRow v-for="b in backups" v-else :key="b.fileName">
                  <TableCell class="px-4 py-2 text-start text-xs text-gray-700 dark:text-gray-300">{{ b.fileName }}</TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs text-gray-500 dark:text-gray-400">{{ b.sizeMb }} MB</TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs text-gray-500 dark:text-gray-400">{{ formatDate(b.createdAt) }}</TableCell>
                  <TableCell class="px-4 py-2 text-start text-xs">
                    <div class="flex flex-wrap gap-2">
                      <a
                        :href="backupDownloadUrl(b.fileName)"
                        class="inline-flex h-8 items-center rounded-lg border border-gray-200 px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                      >
                        Unduh
                      </a>
                      <Button variant="outline" size="sm" :disabled="backupBusy" @click="openRestore(b)">Restore</Button>
                      <Button variant="outline" size="sm" :disabled="backupBusy" @click="doDeleteBackup(b)">Hapus</Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </ComponentCard>
    </div>

    <!-- Dialog konfirmasi restore -->
    <Dialog :open="isRestoreOpen" @update:open="isRestoreOpen = $event">
      <DialogContent class="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-lg sm:p-8">
        <DialogHeader class="gap-2 pe-14 text-start">
          <DialogTitle class="text-xl font-semibold text-error-600 dark:text-error-400">
            Restore Database
          </DialogTitle>
          <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
            PERINGATAN: seluruh data saat ini akan DIHAPUS dan digantikan isi backup.
            Sistem otomatis membuat backup pengaman terlebih dahulu.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3">
          <p class="rounded-lg bg-warning-50 p-3 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
            Ketik nama file berikut untuk mengonfirmasi:
            <strong class="mt-1 block break-all">{{ restoreTarget?.fileName }}</strong>
          </p>
          <Input v-model="restoreConfirm" type="text" placeholder="ketik nama file persis" />
        </div>

        <DialogFooter class="mx-0 mb-0 gap-3 p-0 pt-2 sm:justify-end">
          <DialogClose as-child>
            <Button variant="outline" type="button" :disabled="backupBusy">Batal</Button>
          </DialogClose>
          <Button
            type="button"
            :disabled="backupBusy || restoreConfirm !== restoreTarget?.fileName"
            @click="doRestore"
          >
            {{ backupBusy ? 'Memulihkan...' : 'Ya, Restore' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
