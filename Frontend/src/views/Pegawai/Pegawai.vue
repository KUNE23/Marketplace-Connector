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
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type User,
  type UserRole,
} from '@/services/users'

const users = ref<User[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const search = ref('')
const loading = ref(false)
const error = ref('')
const notice = ref('')

const isDialogOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref({ name: '', email: '', password: '', role: 'EMPLOYEE' as UserRole | string, active: true })
const formError = ref('')
const saving = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const dialogTitle = computed(() => (editingId.value ? 'Edit Pegawai' : 'Tambah Pegawai'))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await listUsers({ page: page.value, limit, search: search.value.trim() })
    users.value = response.users
    total.value = response.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat pegawai'
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
  form.value = { name: '', email: '', password: '', role: 'EMPLOYEE', active: true }
  formError.value = ''
  isDialogOpen.value = true
}

function openEdit(user: User) {
  editingId.value = user.id
  form.value = {
    name: user.name ?? '',
    email: user.email,
    password: '',
    role: user.role,
    active: user.active,
  }
  formError.value = ''
  isDialogOpen.value = true
}

async function submitForm() {
  formError.value = ''
  if (!form.value.email.trim()) return (formError.value = 'Email wajib diisi')
  if (!editingId.value && !form.value.password) return (formError.value = 'Password wajib diisi')
  if (form.value.password && form.value.password.length < 6) {
    return (formError.value = 'Password minimal 6 karakter')
  }

  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name.trim() || undefined,
      email: form.value.email.trim(),
      role: form.value.role,
      active: form.value.active,
    }
    if (form.value.password) payload.password = form.value.password
    if (editingId.value) {
      await updateUser(editingId.value, payload)
    } else {
      await createUser(payload as { email: string; password: string })
    }
    isDialogOpen.value = false
    notice.value = editingId.value ? 'Pegawai diperbarui.' : 'Pegawai ditambahkan.'
    await load()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Gagal menyimpan pegawai'
  } finally {
    saving.value = false
  }
}

async function removeUser(user: User) {
  if (!window.confirm(`Hapus pegawai "${user.name ?? user.email}"?`)) return
  try {
    await deleteUser(user.id)
    notice.value = 'Pegawai dihapus.'
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal menghapus pegawai'
  }
}

onMounted(load)
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Pegawai" />
      <ComponentCard title="Manajemen Pegawai" desc="Kelola akun admin & pegawai aplikasi.">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form class="flex w-full max-w-md gap-2" @submit.prevent="applySearch">
            <Input v-model="search" type="text" placeholder="Cari nama atau email..." />
            <Button type="submit" size="sm">Cari</Button>
          </form>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" :disabled="loading" @click="load">Refresh</Button>
            <Button size="sm" @click="openCreate">+ Tambah Pegawai</Button>
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
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Nama</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Email</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Role</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Status</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Aksi</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody class="divide-y divide-gray-100 dark:divide-white/5">
                <TableRow v-if="loading && users.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Memuat data...</TableCell>
                </TableRow>
                <TableRow v-else-if="users.length === 0">
                  <TableCell class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada pegawai.</TableCell>
                </TableRow>
                <TableRow v-for="user in users" v-else :key="user.id" class="transition hover:bg-gray-50/50 dark:hover:bg-white/2">
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-800 sm:px-6 dark:text-white/90">{{ user.name ?? '-' }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm text-gray-500 sm:px-6 dark:text-gray-400">{{ user.email }}</TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="user.role === 'ADMIN' ? 'primary' : 'gray'">{{ user.role }}</Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="user.active ? 'success' : 'error'">{{ user.active ? 'Aktif' : 'Nonaktif' }}</Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <div class="flex gap-2">
                      <Button variant="outline" size="sm" @click="openEdit(user)">Edit</Button>
                      <Button variant="outline" size="sm" @click="removeUser(user)">Hapus</Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Total {{ total }} pegawai · Halaman {{ page }} dari {{ totalPages }}
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
              Pegawai hanya bisa melihat data. Admin bisa mengelola semuanya.
            </DialogDescription>
          </DialogHeader>

          <form class="space-y-5" novalidate @submit.prevent="submitForm">
            <Field class="gap-1.5">
              <FieldLabel>Nama</FieldLabel>
              <Input v-model="form.name" type="text" placeholder="cth: Budi" />
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Email</FieldLabel>
              <Input v-model="form.email" type="email" placeholder="pegawai@enzyy.com" />
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Password {{ editingId ? '(kosongkan jika tidak diubah)' : '' }}</FieldLabel>
              <Input v-model="form.password" type="password" placeholder="minimal 6 karakter" />
            </Field>

            <div class="grid grid-cols-2 gap-4">
              <Field class="gap-1.5">
                <FieldLabel>Role</FieldLabel>
                <Select v-model="form.role">
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Pegawai</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field class="gap-1.5">
                <FieldLabel>Status</FieldLabel>
                <Select
                  :model-value="form.active ? 'true' : 'false'"
                  @update:model-value="(v) => (form.active = v === 'true')"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Aktif</SelectItem>
                    <SelectItem value="false">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

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
