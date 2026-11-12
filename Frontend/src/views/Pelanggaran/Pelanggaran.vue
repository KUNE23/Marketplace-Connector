<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import ComponentCard from '@/components/common/ComponentCard.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import { formatRupiah } from '@/services/leaderboard'
import {
  getViolationDetails,
  listViolations,
  syncAllViolations,
  syncViolations,
  type ViolationAccountSummary,
  type ViolationDetail,
} from '@/services/violations'

const toast = useToast()

const accounts = ref<ViolationAccountSummary[]>([])
const loading = ref(false)
const syncing = ref(false)
const syncingId = ref<string | null>(null)

// Detail
const isDetailOpen = ref(false)
const detailAccount = ref<ViolationAccountSummary | null>(null)
const details = ref<ViolationDetail[]>([])
const detailLoading = ref(false)

const totalViolations = computed(() => accounts.value.reduce((s, a) => s + a.violationCount, 0))
const accountsWithIssues = computed(() => accounts.value.filter((a) => a.violationCount > 0).length)

async function load() {
  loading.value = true
  try {
    const res = await listViolations()
    accounts.value = res.accounts
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat data pelanggaran')
  } finally {
    loading.value = false
  }
}

async function syncOne(account: ViolationAccountSummary) {
  syncingId.value = account.accountId
  try {
    const res = await syncViolations(account.accountId)
    toast.success(
      `Sinkron ${account.label}: skor toko ${res.shopScore ?? '-'}, ${res.violationCount} pelanggaran.`,
    )
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal sinkron')
  } finally {
    syncingId.value = null
  }
}

async function syncAll() {
  syncing.value = true
  try {
    const res = await syncAllViolations()
    toast.success(`Sinkron selesai: ${res.synced} akun berhasil, ${res.failed} gagal.`)
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal sinkron semua akun')
  } finally {
    syncing.value = false
  }
}

async function openDetail(account: ViolationAccountSummary) {
  isDetailOpen.value = true
  detailAccount.value = account
  detailLoading.value = true
  details.value = []
  try {
    const res = await getViolationDetails(account.accountId)
    details.value = res.violations
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat detail pelanggaran')
  } finally {
    detailLoading.value = false
  }
}

function conditionColor(condition: string | null) {
  if (!condition) return 'gray' as const
  if (condition.includes('sangat baik')) return 'success' as const
  if (condition.includes('perhatian')) return 'warning' as const
  return 'gray' as const
}

function severityColor(severity: string) {
  if (severity === 'critical') return 'error' as const
  if (severity === 'warning') return 'warning' as const
  return 'gray' as const
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div class="space-y-5">
      <PageBreadcrumb pageTitle="Pelanggaran Toko" />

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/5 dark:bg-white/3">
          <p class="text-sm text-gray-500 dark:text-gray-400">Total Akun</p>
          <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{{ accounts.length }}</p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/5 dark:bg-white/3">
          <p class="text-sm text-gray-500 dark:text-gray-400">Akun Dengan Pelanggaran</p>
          <p class="mt-1 text-2xl font-semibold" :class="accountsWithIssues > 0 ? 'text-error-600 dark:text-error-400' : 'text-success-600 dark:text-success-400'">
            {{ accountsWithIssues }}
          </p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/5 dark:bg-white/3">
          <p class="text-sm text-gray-500 dark:text-gray-400">Total Pelanggaran Tercatat</p>
          <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{{ totalViolations }}</p>
        </div>
      </div>

      <ComponentCard
        title="Kondisi Toko per Akun Akulaku"
        desc="Data diambil dari Seller Center Akulaku. Klik Sinkron untuk memperbarui dari Akulaku."
      >
        <div class="flex justify-end">
          <Button size="sm" :disabled="syncing || loading" @click="syncAll">
            {{ syncing ? 'Menyinkronkan...' : 'Sinkron Semua Akun' }}
          </Button>
        </div>

        <div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
          <div class="max-w-full overflow-x-auto">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Akun</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Pemilik</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Skor Toko</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Pelanggaran</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Kondisi</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Periode</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Terakhir Dicek</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && accounts.length === 0">
                  <TableCell colspan="8" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="accounts.length === 0">
                  <TableCell colspan="8" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada akun Akulaku.</TableCell>
                </TableRow>
                <TableRow v-for="acc in accounts" v-else :key="acc.accountId" class="transition hover:bg-gray-50/50 dark:hover:bg-white/2">
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">
                    <div class="font-medium">{{ acc.label }}</div>
                    <div class="text-xs text-gray-400">ID {{ acc.accountId }}</div>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">
                    {{ acc.ownerName ?? '-' }}
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">
                    {{ acc.shopScore ?? '-' }}
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="acc.violationCount > 0 ? 'error' : 'success'">
                      {{ acc.violationCount }}
                    </Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="conditionColor(acc.condition)">{{ acc.condition ?? 'belum dicek' }}</Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-xs text-gray-500 sm:px-6 dark:text-gray-400">
                    {{ acc.assessmentCycle ?? '-' }}
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-xs text-gray-500 sm:px-6 dark:text-gray-400">
                    {{ formatDate(acc.lastCheckedAt) }}
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <div class="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        :disabled="syncingId === acc.accountId"
                        @click="syncOne(acc)"
                      >
                        {{ syncingId === acc.accountId ? '...' : 'Sinkron' }}
                      </Button>
                      <Button variant="outline" size="sm" @click="openDetail(acc)">Detail</Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </ComponentCard>

      <!-- Modal detail jenis pelanggaran -->
      <Dialog :open="isDetailOpen" @update:open="isDetailOpen = $event">
        <DialogContent class="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-4xl sm:p-8">
          <DialogHeader class="gap-2 pe-14 text-start">
            <DialogTitle class="text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90">
              Detail Pelanggaran
            </DialogTitle>
            <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
              {{ detailAccount?.label ?? '-' }} · Skor toko {{ detailAccount?.shopScore ?? '-' }}
            </DialogDescription>
          </DialogHeader>

          <div v-if="detailLoading" class="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Memuat detail...
          </div>
          <div v-else class="max-h-[70vh] overflow-y-auto pe-1">
            <p v-if="details.length === 0" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Belum ada data. Klik Sinkron terlebih dahulu.
            </p>
            <div v-else class="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
              <div class="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader class="border-b border-gray-100 dark:border-white/5">
                    <TableRow>
                      <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Jenis Pelanggaran</TableCell>
                      <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Kategori</TableCell>
                      <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Skor</TableCell>
                      <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Denda</TableCell>
                      <TableCell isHeader class="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">Status</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                    <TableRow v-for="v in details" :key="v.id">
                      <TableCell class="px-4 py-3 text-start text-sm text-gray-800 dark:text-white/90">
                        <div class="font-medium">{{ v.name }}</div>
                        <div v-if="v.note" class="text-xs text-gray-400">{{ v.note }}</div>
                      </TableCell>
                      <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">{{ v.category ?? '-' }}</TableCell>
                      <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">{{ v.score ?? '-' }}</TableCell>
                      <TableCell class="px-4 py-3 text-start text-sm text-gray-500 dark:text-gray-400">
                        {{ v.penalty ? formatRupiah(v.penalty) : '-' }}
                      </TableCell>
                      <TableCell class="px-4 py-3 text-start text-sm">
                        <Badge size="sm" :color="severityColor(v.severity)">
                          {{ v.severity === 'info' ? 'Aman' : v.severity }}
                        </Badge>
                      </TableCell>
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
    </div>
  </AdminLayout>
</template>
