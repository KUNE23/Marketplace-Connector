<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import ComponentCard from '@/components/common/ComponentCard.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import { createAdSpend, deleteAdSpend, listAdSpends, type AdSpend } from '@/services/adSpends'
import { formatRupiah } from '@/services/products'

const toast = useToast()

const adSpends = ref<AdSpend[]>([])
const total = ref('0')
const loading = ref(false)

const saving = ref(false)
const form = ref({ period: todayIso(), amount: '', note: '' })

const totalLabel = computed(() => formatRupiah(total.value))

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', { dateStyle: 'medium' })
}

async function load() {
  loading.value = true
  try {
    const res = await listAdSpends()
    adSpends.value = res.adSpends
    total.value = res.total
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat biaya iklan')
  } finally {
    loading.value = false
  }
}

async function submit() {
  const amount = Number(form.value.amount)
  if (!form.value.period) return toast.warning('Tanggal wajib diisi')
  if (!amount || amount <= 0) return toast.warning('Nominal harus lebih dari 0')

  saving.value = true
  try {
    await createAdSpend({
      period: form.value.period,
      amount: String(Math.floor(amount)),
      note: form.value.note.trim() || null,
    })
    toast.success('Biaya iklan disimpan.')
    form.value = { period: todayIso(), amount: '', note: '' }
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menyimpan biaya iklan')
  } finally {
    saving.value = false
  }
}

async function remove(row: AdSpend) {
  if (!window.confirm(`Hapus biaya iklan ${formatRupiah(row.amount)} (${formatDate(row.period)})?`)) return
  try {
    await deleteAdSpend(row.id)
    toast.success('Biaya iklan dihapus.')
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menghapus')
  }
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Iklan" />
      <ComponentCard
        title="Biaya Iklan"
        desc="Catat pengeluaran iklan. Dipakai untuk menghitung profit: Profit = Omzet − Modal − Biaya Iklan."
      >
        <form class="grid gap-3 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end" novalidate @submit.prevent="submit">
          <Field class="gap-1.5">
            <FieldLabel>Tanggal</FieldLabel>
            <Input v-model="form.period" type="date" />
          </Field>
          <Field class="gap-1.5">
            <FieldLabel>Nominal (Rp)</FieldLabel>
            <Input v-model="form.amount" type="number" min="0" placeholder="cth: 150000" />
          </Field>
          <Field class="gap-1.5">
            <FieldLabel>Catatan (opsional)</FieldLabel>
            <Input v-model="form.note" type="text" placeholder="cth: Iklan Shopee Ads" />
          </Field>
          <Button type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Tambah' }}</Button>
        </form>

        <div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
          <div class="max-w-full overflow-x-auto">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Tanggal</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Nominal</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Catatan</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && adSpends.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="adSpends.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada biaya iklan.</TableCell>
                </TableRow>
                <TableRow v-for="row in adSpends" v-else :key="row.id" class="transition hover:bg-gray-50/50 dark:hover:bg-white/2">
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">{{ formatDate(row.period) }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ formatRupiah(row.amount) }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ row.note ?? '-' }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Button variant="outline" size="sm" @click="remove(row)">Hapus</Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <p class="text-sm text-gray-500 dark:text-gray-400">Total biaya iklan: <strong>{{ totalLabel }}</strong></p>
      </ComponentCard>
    </div>
  </AdminLayout>
</template>
