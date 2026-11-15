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
  getImportRunnerStatus,
  getMonitorOverview,
  getRequestStats,
  getShopeeDbInfo,
  getWorkerLogFile,
  getWorkerStatus,
  LOG_FILE_OPTIONS,
  pruneWorkerLogs,
  startImportRunner,
  stopImportRunner,
  uploadShopeeDb,
  type AuditLogEntry,
  type ImportRunnerStatus,
  type MonitorOverview,
  type RequestStats,
  type ShopeeDbInfo,
  type WorkerStatus,
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

// === Worker ===
const worker = ref<WorkerStatus | null>(null)
const logFile = ref('worker.out')
const logLines = ref<string[]>([])
const logMeta = ref<{ exists: boolean; totalBytes: number; modifiedAt?: string } | null>(null)
const logLoading = ref(false)

// === Berkas scraping Shopee ===
const shopeeDb = ref<ShopeeDbInfo | null>(null)
const uploadPercent = ref<number | null>(null)
const importStatus = ref<ImportRunnerStatus | null>(null)
const importBusy = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)

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
  if (autoRefresh.value) {
    timer = setInterval(() => {
      load()
      loadWorker()
      loadImportStatus()
    }, 15000)
  }
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

async function loadWorker() {
  try {
    worker.value = await getWorkerStatus()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat status worker')
  }
}

async function loadLogFile() {
  logLoading.value = true
  try {
    const res = await getWorkerLogFile(logFile.value, 300)
    logLines.value = res.lines
    logMeta.value = { exists: res.exists, totalBytes: res.totalBytes, modifiedAt: res.modifiedAt }
  } catch (err) {
    logLines.value = []
    logMeta.value = null
    toast.error(err instanceof Error ? err.message : 'Gagal membaca berkas log')
  } finally {
    logLoading.value = false
  }
}

async function doPruneWorkerLogs() {
  if (!window.confirm('Hapus catatan aktivitas worker lama (sisakan 2000 terbaru)?')) return
  try {
    const r = await pruneWorkerLogs(2000)
    toast.success(`Dihapus ${r.removed} catatan. Sisa ${r.remaining}.`)
    await loadWorker()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal membersihkan catatan')
  }
}

function workerColor(w?: { alive: boolean; status: string }) {
  if (!w) return 'gray' as const
  if (w.alive && w.status === 'working') return 'info' as const
  if (w.alive) return 'success' as const
  return 'error' as const
}

function logLevelColor(level: string) {
  if (level === 'error') return 'error' as const
  if (level === 'warn') return 'warning' as const
  return 'gray' as const
}

function formatBytes(n: number) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

async function loadShopeeDb() {
  try {
    shopeeDb.value = await getShopeeDbInfo()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat info shopee.db')
  }
}

async function loadImportStatus() {
  try {
    importStatus.value = await getImportRunnerStatus()
  } catch {
    importStatus.value = null
  }
}

async function onShopeeDbPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.name.toLowerCase().endsWith('.db')) {
    toast.warning('Pilih berkas shopee.db (SQLite).')
    input.value = ''
    return
  }
  const maxMb = shopeeDb.value?.maxUploadMb ?? 500
  if (file.size > maxMb * 1024 * 1024) {
    toast.error(`Berkas ${(file.size / 1024 / 1024).toFixed(0)} MB melebihi batas ${maxMb} MB.`)
    input.value = ''
    return
  }

  uploadPercent.value = 0
  try {
    const res = await uploadShopeeDb(file, (p) => {
      uploadPercent.value = p
    })
    shopeeDb.value = res
    toast.success(`shopee.db terunggah (${res.sizeMb} MB, ${res.db?.products ?? '?'} produk).`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal mengunggah shopee.db')
  } finally {
    uploadPercent.value = null
    input.value = ''
  }
}

async function doStartImport(reset = false) {
  importBusy.value = true
  try {
    const res = await startImportRunner(reset)
    toast.success(res.message)
    await loadImportStatus()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memulai import')
  } finally {
    importBusy.value = false
  }
}

async function doStopImport() {
  importBusy.value = true
  try {
    const res = await stopImportRunner()
    toast.info(res.message)
    await loadImportStatus()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menghentikan import')
  } finally {
    importBusy.value = false
  }
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
  loadWorker()
  loadLogFile()
  loadShopeeDb()
  loadImportStatus()
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
      <!-- Worker & Log -->
      <ComponentCard
        title="Worker & Log Sistem"
        desc="Status proses worker, antrean job, catatan aktivitas, dan ekor berkas log PM2."
      >
        <!-- Peringatan -->
        <div v-if="(worker?.warnings?.length ?? 0) > 0" class="mb-3 space-y-1">
          <p
            v-for="w in worker!.warnings"
            :key="w"
            class="rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-500/10 dark:text-error-400"
          >
            {{ w }}
          </p>
        </div>

        <!-- Kartu worker -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <p
            v-if="!worker?.workers?.length"
            class="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500 sm:col-span-2 xl:col-span-3 dark:border-white/10 dark:text-gray-400"
          >
            Worker belum pernah melapor. Jalankan worker dengan kode terbaru
            (<code>pm2 restart enzyy-worker</code>).
          </p>
          <div
            v-for="w in worker?.workers ?? []"
            :key="w.name"
            class="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-white/3"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-800 dark:text-white/90">{{ w.name }}</span>
              <Badge size="sm" :color="workerColor(w)">
                {{ w.status === 'working' ? 'Bekerja' : w.alive ? 'Siap' : 'Mati' }}
              </Badge>
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              PID {{ w.pid ?? '-' }} · {{ w.hostname ?? '-' }} · Node {{ w.version ?? '-' }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Detak terakhir: {{ w.staleSeconds }} detik lalu
            </p>
            <p v-if="w.currentJob" class="text-xs text-info-600 dark:text-info-400">
              Sedang memproses job #{{ w.currentJob }}
            </p>
            <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p class="text-gray-500 dark:text-gray-400">Poll</p>
                <p class="font-semibold text-gray-800 dark:text-white/90">{{ w.polls }}</p>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400">Sukses</p>
                <p class="font-semibold text-success-600 dark:text-success-400">{{ w.jobsDone }}</p>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400">Gagal</p>
                <p class="font-semibold" :class="w.jobsFailed > 0 ? 'text-error-600 dark:text-error-400' : 'text-gray-800 dark:text-white/90'">
                  {{ w.jobsFailed }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Antrean job -->
        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
            <p class="text-xs text-gray-500 dark:text-gray-400">Menunggu</p>
            <p class="text-lg font-semibold" :class="(worker?.queue.pending ?? 0) > 20 ? 'text-warning-600 dark:text-warning-400' : 'text-gray-800 dark:text-white/90'">
              {{ worker?.queue.pending ?? 0 }}
            </p>
          </div>
          <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
            <p class="text-xs text-gray-500 dark:text-gray-400">Dijalankan</p>
            <p class="text-lg font-semibold text-info-600 dark:text-info-400">{{ worker?.queue.running ?? 0 }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
            <p class="text-xs text-gray-500 dark:text-gray-400">Selesai</p>
            <p class="text-lg font-semibold text-success-600 dark:text-success-400">{{ worker?.queue.done ?? 0 }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 p-3 dark:border-white/10">
            <p class="text-xs text-gray-500 dark:text-gray-400">Gagal</p>
            <p class="text-lg font-semibold" :class="(worker?.queue.failed ?? 0) > 0 ? 'text-error-600 dark:text-error-400' : 'text-gray-800 dark:text-white/90'">
              {{ worker?.queue.failed ?? 0 }}
            </p>
          </div>
        </div>

        <p v-if="worker?.queue.oldestPending" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Job terlama menunggu: #{{ worker.queue.oldestPending.id }} ({{ worker.queue.oldestPending.type }})
          · {{ worker.queue.oldestPending.waitingSeconds }} detik · percobaan ke-{{ worker.queue.oldestPending.attempts }}
        </p>

        <!-- Catatan aktivitas worker -->
        <div class="mt-4 flex items-center justify-between">
          <p class="text-sm font-medium text-gray-700 dark:text-white/90">Catatan Aktivitas Worker</p>
          <Button variant="outline" size="sm" @click="doPruneWorkerLogs">Bersihkan Catatan</Button>
        </div>
        <div class="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
          <div class="max-h-64 max-w-full overflow-auto">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-3 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Waktu</TableCell>
                  <TableCell isHeader class="px-3 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Level</TableCell>
                  <TableCell isHeader class="px-3 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Job</TableCell>
                  <TableCell isHeader class="px-3 py-2 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Pesan</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="!worker?.logs?.length">
                  <TableCell colspan="4" class="px-3 py-4 text-center text-xs text-gray-400">
                    Belum ada catatan. Jalankan worker dengan kode terbaru.
                  </TableCell>
                </TableRow>
                <TableRow v-for="l in worker?.logs ?? []" v-else :key="l.id">
                  <TableCell class="px-3 py-2 text-start text-[11px] text-gray-500 dark:text-gray-400">
                    {{ formatTime(l.createdAt) }}
                  </TableCell>
                  <TableCell class="px-3 py-2 text-start text-xs">
                    <Badge size="sm" :color="logLevelColor(l.level)">{{ l.level }}</Badge>
                  </TableCell>
                  <TableCell class="px-3 py-2 text-start text-[11px] text-gray-500 dark:text-gray-400">
                    {{ l.jobId ? `#${l.jobId} ${l.jobType ?? ''}` : '-' }}
                  </TableCell>
                  <TableCell class="px-3 py-2 text-start text-xs text-gray-700 dark:text-gray-300">{{ l.message }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <!-- Ekor berkas log PM2 -->
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <p class="text-sm font-medium text-gray-700 dark:text-white/90">Berkas Log PM2</p>
          <Select v-model="logFile" @update:model-value="loadLogFile">
            <SelectTrigger class="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="f in LOG_FILE_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" :disabled="logLoading" @click="loadLogFile">
            {{ logLoading ? 'Memuat...' : 'Muat Ulang' }}
          </Button>
          <span v-if="logMeta" class="text-xs text-gray-500 dark:text-gray-400">
            {{ logMeta.exists ? `${formatBytes(logMeta.totalBytes)} · ${logMeta.modifiedAt ? formatTime(logMeta.modifiedAt) : '-'}` : 'berkas belum ada' }}
          </span>
        </div>
        <pre
          class="mt-2 max-h-64 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-800 dark:border-white/10 dark:bg-black/30 dark:text-gray-300"
        >{{ logLines.length ? logLines.join('\n') : '(kosong — berkas hanya ada bila worker/API dijalankan lewat PM2)' }}</pre>
      </ComponentCard>

      <!-- Scraping Shopee: unggah shopee.db + import -->
      <ComponentCard
        title="Data Scraping Shopee"
        desc="Unggah shopee.db hasil scraping dari komputer Anda, lalu impor produknya ke database."
      >
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <!-- Info berkas -->
          <div class="rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-gray-800 dark:text-white/90">Berkas shopee.db</p>
              <Badge size="sm" :color="shopeeDb?.exists ? 'success' : 'warning'">
                {{ shopeeDb?.exists ? 'Ada' : 'Belum ada' }}
              </Badge>
            </div>
            <p v-if="!shopeeDb?.exists" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ shopeeDb?.message ?? 'Berkas belum ada di server.' }}
            </p>
            <div v-else class="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <p>Ukuran: <strong class="text-gray-700 dark:text-gray-300">{{ shopeeDb.sizeMb }} MB</strong></p>
              <p>Diubah: {{ shopeeDb.modifiedAt ? formatTime(shopeeDb.modifiedAt) : '-' }}</p>
              <p>Produk di SQLite: <strong class="text-gray-700 dark:text-gray-300">{{ shopeeDb.db?.products?.toLocaleString('id-ID') ?? '?' }}</strong></p>
              <p>Data terakhir: {{ shopeeDb.db?.lastSeen ?? '-' }}</p>
              <p v-if="shopeeDb.db?.lastRun">
                Scrape terakhir: #{{ shopeeDb.db.lastRun.id }} ({{ shopeeDb.db.lastRun.status }})
                · {{ shopeeDb.db.lastRun.started_at }}
              </p>
              <div v-if="shopeeDb.db?.progress" class="flex flex-wrap gap-1 pt-1">
                <Badge v-for="(v, k) in shopeeDb.db.progress" :key="String(k)" size="sm" color="gray">
                  {{ k }}: {{ v }}
                </Badge>
              </div>
              <p class="pt-1 text-[10px] break-all">{{ shopeeDb.path }}</p>
            </div>

            <div class="mt-3">
              <input
                ref="importFileInput"
                type="file"
                accept=".db"
                class="hidden"
                @change="onShopeeDbPicked"
              />
              <Button
                size="sm"
                :disabled="uploadPercent !== null"
                @click="importFileInput?.click()"
              >
                {{ uploadPercent !== null ? `Mengunggah ${uploadPercent}%` : 'Unggah shopee.db' }}
              </Button>
              <p class="mt-1 text-[10px] text-gray-400">
                Maksimal {{ shopeeDb?.maxUploadMb ?? 500 }} MB · berkas sebelumnya disimpan sebagai .sebelum-upload
              </p>
            </div>
          </div>

          <!-- Import -->
          <div class="rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-gray-800 dark:text-white/90">Import ke Database</p>
              <Badge size="sm" :color="importStatus?.runner.running ? 'info' : 'gray'">
                {{ importStatus?.runner.running ? 'Berjalan' : 'Berhenti' }}
              </Badge>
            </div>

            <div class="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <p>
                Total di SQLite: <strong class="text-gray-700 dark:text-gray-300">{{ importStatus?.progress.total?.toLocaleString('id-ID') ?? '?' }}</strong>
              </p>
              <p>
                Sudah diproses:
                <strong class="text-gray-700 dark:text-gray-300">
                  {{ ((importStatus?.progress.state.imported ?? 0) + (importStatus?.progress.state.updated ?? 0)).toLocaleString('id-ID') }}
                </strong>
                · Sisa:
                <strong class="text-gray-700 dark:text-gray-300">{{ importStatus?.progress.remaining?.toLocaleString('id-ID') ?? '?' }}</strong>
              </p>
              <p v-if="importStatus?.runner.running" class="text-info-600 dark:text-info-400">
                Sesi ini: +{{ importStatus.runner.session.inserted }} baru,
                {{ importStatus.runner.session.updated }} update,
                {{ importStatus.runner.batchCount }} batch
              </p>
              <p v-if="importStatus?.runner.lastError" class="text-error-600 dark:text-error-400">
                Error terakhir: {{ importStatus.runner.lastError }}
              </p>
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              <Button
                v-if="!importStatus?.runner.running"
                size="sm"
                :disabled="importBusy || !shopeeDb?.exists"
                @click="doStartImport(false)"
              >
                {{ importBusy ? 'Memproses...' : 'Mulai Import' }}
              </Button>
              <Button v-else variant="outline" size="sm" :disabled="importBusy" @click="doStopImport">
                Hentikan
              </Button>
              <Button variant="outline" size="sm" :disabled="importBusy || !shopeeDb?.exists" @click="doStartImport(true)">
                Import Ulang dari Awal
              </Button>
            </div>
            <p class="mt-1 text-[10px] text-gray-400">
              Import berjalan di server — boleh ditinggal / tab ditutup. Lanjut otomatis setelah restart.
            </p>
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
