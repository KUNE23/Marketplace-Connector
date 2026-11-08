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
import {
  createAkulakuAccount,
  deleteAkulakuAccount,
  listAkulakuAccounts,
  updateAkulakuAccount,
  type AkulakuAccount,
} from '@/services/akulakuAccounts'

const accounts = ref<AkulakuAccount[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const search = ref('')
const loading = ref(false)
const error = ref('')

const isDialogOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref({ label: '', username: '', password: '', status: 'active', note: '' })
const formError = ref('')
const saving = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const dialogTitle = computed(() => (editingId.value ? 'Edit Akun Akulaku' : 'Tambah Akun Akulaku'))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await listAkulakuAccounts({
      page: page.value,
      limit,
      search: search.value.trim(),
    })
    accounts.value = response.accounts
    total.value = response.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat akun Akulaku'
  } finally {
    loading.value = false
  }
}

function applySearch() {
  page.value = 1
  load()
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  load()
}

function openCreate() {
  editingId.value = null
  form.value = { label: '', username: '', password: '', status: 'active', note: '' }
  formError.value = ''
  isDialogOpen.value = true
}

function openEdit(account: AkulakuAccount) {
  editingId.value = account.id
  form.value = {
    label: account.label,
    username: account.username,
    password: '',
    status: account.status,
    note: account.note ?? '',
  }
  formError.value = ''
  isDialogOpen.value = true
}

async function submitForm() {
  formError.value = ''
  if (!form.value.label.trim()) return (formError.value = 'Label wajib diisi')
  if (!form.value.username.trim()) return (formError.value = 'Username wajib diisi')
  if (!editingId.value && !form.value.password) return (formError.value = 'Password wajib diisi')

  saving.value = true
  try {
    const payload = {
      label: form.value.label.trim(),
      username: form.value.username.trim(),
      password: form.value.password || undefined,
      status: form.value.status,
      note: form.value.note || null,
    }
    if (editingId.value) {
      await updateAkulakuAccount(editingId.value, payload)
    } else {
      await createAkulakuAccount(payload)
    }
    isDialogOpen.value = false
    await load()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Gagal menyimpan akun'
  } finally {
    saving.value = false
  }
}

async function removeAccount(account: AkulakuAccount) {
  if (!window.confirm(`Hapus akun "${account.label}"?`)) return
  try {
    await deleteAkulakuAccount(account.id)
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal menghapus akun'
  }
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Akun Akulaku" />
      <ComponentCard title="Akun Akulaku" desc="Kredensial akun Akulaku untuk posting produk.">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form class="flex w-full max-w-md gap-2" @submit.prevent="applySearch">
            <Input v-model="search" type="text" placeholder="Cari label atau username..." />
            <Button type="submit" size="sm">Cari</Button>
          </form>
          <Button size="sm" @click="openCreate">+ Tambah Akun</Button>
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
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Label</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Username</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Listing</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Status</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && accounts.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="accounts.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada akun Akulaku.</TableCell>
                </TableRow>
                <TableRow v-for="account in accounts" v-else :key="account.id" class="transition hover:bg-gray-50/50 dark:hover:bg-white/2">
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">{{ account.label }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ account.username }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ account.listingCount }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="account.status === 'active' ? 'success' : 'gray'">
                      {{ account.status }}
                    </Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <div class="flex gap-2">
                      <Button variant="outline" size="sm" @click="openEdit(account)">Edit</Button>
                      <Button variant="outline" size="sm" @click="removeAccount(account)">Hapus</Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Total {{ total }} akun · Halaman {{ page }} dari {{ totalPages }}
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
              {{ dialogTitle }}
            </DialogTitle>
            <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
              Kredensial disimpan terenkripsi dan tidak pernah ditampilkan kembali.
            </DialogDescription>
          </DialogHeader>

          <form class="space-y-5" novalidate @submit.prevent="submitForm">
            <Field class="gap-1.5">
              <FieldLabel>Label</FieldLabel>
              <Input v-model="form.label" type="text" placeholder="cth: Toko Elektronik" />
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Username Akulaku</FieldLabel>
              <Input v-model="form.username" type="text" placeholder="username / email Akulaku" />
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Password {{ editingId ? '(kosongkan jika tidak diubah)' : '' }}</FieldLabel>
              <Input v-model="form.password" type="password" placeholder="••••••••" />
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Status</FieldLabel>
              <Select v-model="form.status">
                <SelectTrigger>
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Catatan (opsional)</FieldLabel>
              <Input v-model="form.note" type="text" placeholder="Catatan internal" />
            </Field>

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
    </div>
  </AdminLayout>
</template>
