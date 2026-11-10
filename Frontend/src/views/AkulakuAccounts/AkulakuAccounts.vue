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
  cancelAkulakuLogin,
  createAkulakuAccount,
  deleteAkulakuAccount,
  listAkulakuAccounts,
  startAkulakuLogin,
  submitAkulakuOtp,
  updateAkulakuAccount,
  type AkulakuAccount,
} from '@/services/akulakuAccounts'
import { accountStatusMeta, accountStatusLabel, sessionStatusMeta, sessionStatusLabel } from '@/utils/labels'

const toast = useToast()

const accounts = ref<AkulakuAccount[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const search = ref('')
const loading = ref(false)

// Dialog login Akulaku (isi kredensial otomatis + OTP)
const isLoginOpen = ref(false)
const loginAccount = ref<AkulakuAccount | null>(null)
const loginState = ref<'idle' | 'starting' | 'otp' | 'success'>('idle')
const loginMessage = ref('')
const phoneHint = ref<string | null>(null)
const otpChannels = ref<string[]>([])
const otpCode = ref('')
const otpChannel = ref<'whatsapp' | 'sms'>('whatsapp')
const submittingOtp = ref(false)

const isDialogOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref({ label: '', username: '', password: '', status: 'active', note: '' })
const saving = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const dialogTitle = computed(() => (editingId.value ? 'Edit Akun Akulaku' : 'Tambah Akun Akulaku'))

async function load() {
  loading.value = true
  try {
    const response = await listAkulakuAccounts({
      page: page.value,
      limit,
      search: search.value.trim(),
    })
    accounts.value = response.accounts
    total.value = response.total
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal memuat akun Akulaku')
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
  isDialogOpen.value = true
}

async function submitForm() {
  if (!form.value.label.trim()) return toast.warning('Label wajib diisi')
  if (!form.value.username.trim()) return toast.warning('Username wajib diisi')
  if (!editingId.value && !form.value.password) return toast.warning('Password wajib diisi')

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
    toast.success(editingId.value ? 'Akun Akulaku diperbarui.' : 'Akun Akulaku ditambahkan.')
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menyimpan akun')
  } finally {
    saving.value = false
  }
}

async function removeAccount(account: AkulakuAccount) {
  if (!window.confirm(`Hapus akun "${account.label}"?`)) return
  try {
    await deleteAkulakuAccount(account.id)
    toast.success('Akun Akulaku dihapus.')
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menghapus akun')
  }
}

// ---- Login Akulaku lewat aplikasi ----
function openLogin(account: AkulakuAccount) {
  loginAccount.value = account
  loginState.value = 'starting'
  loginMessage.value = ''
  phoneHint.value = null
  otpChannels.value = []
  otpCode.value = ''
  otpChannel.value = 'whatsapp'
  isLoginOpen.value = true
  doStartLogin()
}

async function doStartLogin() {
  if (!loginAccount.value) return
  loginState.value = 'starting'
  loginMessage.value = 'Mengisi kredensial & memeriksa halaman Akulaku...'
  try {
    const res = await startAkulakuLogin(loginAccount.value.id)
    if (res.state === 'success') {
      loginState.value = 'success'
      loginMessage.value = res.message ?? 'Login berhasil, sesi tersimpan.'
      toast.success(loginMessage.value)
      await load()
      return
    }
    if (res.state === 'otp_required') {
      loginState.value = 'otp'
      otpChannels.value = res.channels ?? []
      phoneHint.value = res.phoneHint ?? null
      if (res.channels?.includes('whatsapp')) otpChannel.value = 'whatsapp'
      else if (res.channels?.includes('sms')) otpChannel.value = 'sms'
      loginMessage.value = 'Akulaku meminta kode verifikasi. Masukkan kode OTP yang dikirim ke HP terdaftar.'
      return
    }
    loginState.value = 'otp'
    loginMessage.value = res.message ?? 'Halaman login belum selesai. Coba kirim ulang / ulangi.'
  } catch (err) {
    loginState.value = 'idle'
    loginMessage.value = err instanceof Error ? err.message : 'Gagal memulai login'
    toast.error(loginMessage.value)
  }
}

async function doSubmitOtp() {
  if (!loginAccount.value) return
  if (!otpCode.value.trim()) return toast.warning('Masukkan kode OTP dulu')
  submittingOtp.value = true
  try {
    const res = await submitAkulakuOtp(loginAccount.value.id, otpCode.value.trim(), otpChannel.value)
    if (res.state === 'success') {
      loginState.value = 'success'
      loginMessage.value = res.message ?? 'Verifikasi berhasil, sesi tersimpan.'
      toast.success(loginMessage.value)
      await load()
      return
    }
    loginMessage.value = res.message ?? 'Kode belum diterima. Periksa lagi atau minta kode baru.'
    if (res.phoneHint) phoneHint.value = res.phoneHint
    toast.warning(loginMessage.value)
  } catch (err) {
    loginMessage.value = err instanceof Error ? err.message : 'Gagal mengirim OTP'
    toast.error(loginMessage.value)
  } finally {
    submittingOtp.value = false
  }
}

async function closeLogin() {
  const acc = loginAccount.value
  isLoginOpen.value = false
  // Batalkan proses yang masih berjalan (tutup browser di server).
  if (acc && loginState.value !== 'success') {
    try {
      await cancelAkulakuLogin(acc.id)
    } catch {
      /* abaikan */
    }
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

        <div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
          <div class="max-w-full overflow-x-auto">
            <Table>
              <TableHeader class="border-b border-gray-100 dark:border-white/5">
                <TableRow>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Label</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Username</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Listing</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Status</TableCell>
                  <TableCell isHeader class="px-5 py-3 text-start text-xs font-medium text-gray-500 sm:px-6 dark:text-gray-400">Sesi</TableCell>
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
                    <Badge size="sm" :color="accountStatusMeta[account.status]?.color ?? 'gray'">
                      {{ accountStatusLabel(account.status) }}
                    </Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <Badge size="sm" :color="sessionStatusMeta[account.sessionStatus]?.color ?? 'gray'">
                      {{ sessionStatusLabel(account.sessionStatus) }}
                    </Badge>
                  </TableCell>
                  <TableCell class="px-5 py-4 text-start text-sm sm:px-6">
                    <div class="flex flex-wrap gap-2">
                      <Button size="sm" @click="openLogin(account)">Login Akulaku</Button>
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
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field class="gap-1.5">
              <FieldLabel>Catatan (opsional)</FieldLabel>
              <Input v-model="form.note" type="text" placeholder="Catatan internal" />
            </Field>

            <DialogFooter class="mx-0 mb-0 gap-3 p-0 pt-2 sm:justify-end">
              <DialogClose as-child>
                <Button variant="outline" type="button">Batal</Button>
              </DialogClose>
              <Button type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan' }}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <!-- Dialog Login Akulaku (kredensial otomatis + OTP) -->
      <Dialog :open="isLoginOpen" @update:open="(v) => { if (!v) closeLogin() }">
        <DialogContent class="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-146 sm:p-10">
          <DialogHeader class="gap-2 pe-14 text-start">
            <DialogTitle class="text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90">
              Login Akulaku
            </DialogTitle>
            <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
              {{ loginAccount?.label }} · {{ loginAccount?.username }}
            </DialogDescription>
          </DialogHeader>

          <div class="space-y-4">
            <div
              class="rounded-lg border px-4 py-3 text-sm"
              :class="loginState === 'success'
                ? 'border-success-500/30 bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400'
                : loginState === 'otp'
                  ? 'border-warning-500/30 bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400'
                  : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-white/5 dark:text-gray-300'"
            >
              <p v-if="loginState === 'starting'" class="flex items-center gap-2">
                <span class="inline-block size-2 animate-pulse rounded-full bg-brand-500" />
                {{ loginMessage }}
              </p>
              <p v-else>{{ loginMessage }}</p>
            </div>

            <template v-if="loginState === 'otp'">
              <Field v-if="otpChannels.length > 1" class="gap-1.5">
                <FieldLabel>Kirim kode via</FieldLabel>
                <Select v-model="otpChannel">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-if="otpChannels.includes('whatsapp')" value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem v-if="otpChannels.includes('sms')" value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field class="gap-1.5">
                <FieldLabel>Kode OTP</FieldLabel>
                <Input
                  v-model="otpCode"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  placeholder="Masukkan kode dari HP"
                  @keyup.enter="doSubmitOtp"
                />
                <p v-if="phoneHint" class="text-xs text-gray-500 dark:text-gray-400">
                  Kode dikirim ke nomor: <strong>{{ phoneHint }}</strong>
                </p>
              </Field>

              <div class="flex flex-wrap gap-2">
                <Button :disabled="submittingOtp" @click="doSubmitOtp">
                  {{ submittingOtp ? 'Memverifikasi...' : 'Kirim Kode' }}
                </Button>
                <Button variant="outline" :disabled="submittingOtp" @click="doStartLogin">Ulangi Login</Button>
              </div>
            </template>

            <template v-else-if="loginState === 'success'">
              <div class="flex justify-end">
                <Button @click="closeLogin">Selesai</Button>
              </div>
            </template>
          </div>

          <DialogFooter class="mx-0 mb-0 gap-3 p-0 pt-2 sm:justify-start">
            <DialogClose as-child>
              <Button variant="ghost" type="button" @click="closeLogin">Tutup</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </AdminLayout>
</template>
