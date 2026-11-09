<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import ComponentCard from '@/components/common/ComponentCard.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import { listMarkupTiers, saveMarkupTiers, type MarkupTierInput } from '@/services/markupTiers'
import { formatRupiah } from '@/services/products'

const toast = useToast()

const tiers = ref<MarkupTierInput[]>([])
const loading = ref(false)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await listMarkupTiers()
    tiers.value = res.tiers.map((t) => ({
      label: t.label,
      minPrice: t.minPrice,
      maxPrice: t.maxPrice,
      markupType: t.markupType,
      markupValue: t.markupValue,
      active: t.active,
      sortOrder: t.sortOrder,
    }))
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat tier')
  } finally {
    loading.value = false
  }
}

function addTier() {
  tiers.value.push({
    label: 'Tier baru',
    minPrice: '0',
    maxPrice: null,
    markupType: 'percent',
    markupValue: '0',
    active: true,
    sortOrder: tiers.value.length + 1,
  })
}

function removeTier(index: number) {
  tiers.value.splice(index, 1)
}

function cleanNumber(value: string) {
  return value.replace(/[^0-9.]/g, '')
}

async function save() {
  saving.value = true
  try {
    const payload = tiers.value
      .map((t, i) => ({
        label: t.label || `Tier ${i + 1}`,
        minPrice: String(Math.max(0, Math.floor(Number(cleanNumber(t.minPrice)) || 0))),
        maxPrice: t.maxPrice === null || t.maxPrice === '' ? null : String(Math.floor(Number(cleanNumber(t.maxPrice)) || 0)),
        markupType: t.markupType ?? 'percent',
        markupValue: String(Number(cleanNumber(t.markupValue)) || 0),
        active: t.active ?? true,
        sortOrder: i + 1,
      }))
      .sort((a, b) => Number(a.minPrice) - Number(b.minPrice))
    await saveMarkupTiers(payload)
    toast.success('Aturan markup disimpan.')
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Markup" />
      <ComponentCard
        title="Aturan Markup Harga"
        desc="Markup otomatis berdasarkan harga asal produk. Dipakai saat membuat listing bila markup tidak diisi manual."
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="loading" @click="load">Muat Ulang</Button>
            <Button size="sm" @click="addTier">+ Tambah Tier</Button>
          </div>
          <Button size="sm" :disabled="saving" @click="save">{{ saving ? 'Menyimpan...' : 'Simpan' }}</Button>
        </div>

        <div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
          <div class="max-w-full overflow-x-auto">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Label</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Harga Min (Rp)</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Harga Max (Rp)</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Markup (%)</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aktif</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && tiers.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="tiers.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada tier.</TableCell>
                </TableRow>
                <TableRow v-for="(tier, index) in tiers" v-else :key="index">
                  <TableCell class="px-5 py-3 sm:px-6">
                    <Input v-model="tier.label" type="text" class="h-9" />
                  </TableCell>
                  <TableCell class="px-5 py-3 sm:px-6">
                    <Input v-model="tier.minPrice" type="number" class="h-9" />
                  </TableCell>
                  <TableCell class="px-5 py-3 sm:px-6">
                    <Input
                      :model-value="tier.maxPrice ?? ''"
                      type="number"
                      class="h-9"
                      placeholder="(tak terbatas)"
                      @update:model-value="(v) => (tier.maxPrice = v === '' ? null : String(v))"
                    />
                  </TableCell>
                  <TableCell class="px-5 py-3 sm:px-6">
                    <Input v-model="tier.markupValue" type="number" class="h-9 w-24" />
                  </TableCell>
                  <TableCell class="px-5 py-3 sm:px-6">
                    <Badge size="sm" :color="tier.active ? 'success' : 'gray'">{{ tier.active ? 'Aktif' : 'Nonaktif' }}</Badge>
                  </TableCell>
                  <TableCell class="px-5 py-3 sm:px-6">
                    <Button variant="outline" size="sm" @click="removeTier(index)">Hapus</Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <p class="text-xs text-gray-400">
          Rumus: harga jual = harga asal + (harga asal × markup%). Batas: min ≤ harga ≤ max. Max kosong = tak terbatas.
        </p>
        <p class="text-xs text-gray-400">
          Contoh aktif: {{ formatRupiah(50000) }} → +45%, {{ formatRupiah(200000) }} → +30%, {{ formatRupiah(800000) }} → +25%
        </p>
      </ComponentCard>
    </div>
  </AdminLayout>
</template>
