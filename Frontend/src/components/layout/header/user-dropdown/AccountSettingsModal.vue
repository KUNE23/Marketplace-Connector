<script setup lang="ts">
import { ref, watch } from 'vue'
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { changeOwnPassword, updateOwnProfile } from '@/services/users'
import { useAuthUser } from '@/composables/useAuthUser'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'openChange', open: boolean): void }>()

const { user, load } = useAuthUser()

const name = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const saving = ref(false)
const error = ref('')
const notice = ref('')

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      name.value = user.value?.name ?? ''
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      error.value = ''
      notice.value = ''
    }
  },
)

async function saveName() {
  error.value = ''
  notice.value = ''
  if (!name.value.trim()) return (error.value = 'Nama tidak boleh kosong')
  saving.value = true
  try {
    await updateOwnProfile(name.value.trim())
    await load(true)
    notice.value = 'Nama berhasil diperbarui.'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal menyimpan nama'
  } finally {
    saving.value = false
  }
}

async function savePassword() {
  error.value = ''
  notice.value = ''
  if (!currentPassword.value) return (error.value = 'Password lama wajib diisi')
  if (newPassword.value.length < 6) return (error.value = 'Password baru minimal 6 karakter')
  if (newPassword.value !== confirmPassword.value) return (error.value = 'Konfirmasi password tidak sama')

  saving.value = true
  try {
    await changeOwnPassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    notice.value = 'Password berhasil diganti.'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal mengganti password'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="isOpen" @update:open="emit('openChange', $event)">
    <DialogContent class="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-146 sm:p-10">
      <DialogHeader class="gap-2 pe-14 text-start">
        <DialogTitle class="text-xl font-semibold text-gray-800 sm:text-2xl dark:text-white/90">
          Pengaturan Akun
        </DialogTitle>
        <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
          {{ user?.email }}
        </DialogDescription>
      </DialogHeader>

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

      <form class="space-y-5" novalidate @submit.prevent="saveName">
        <Field class="gap-1.5">
          <FieldLabel>Nama</FieldLabel>
          <Input v-model="name" type="text" placeholder="Nama kamu" />
        </Field>
        <div class="flex justify-end">
          <Button type="submit" size="sm" variant="outline" :disabled="saving">Simpan Nama</Button>
        </div>
      </form>

      <div class="border-t border-gray-100 dark:border-white/5" />

      <form class="space-y-5" novalidate @submit.prevent="savePassword">
        <Field :data-invalid="Boolean(error && currentPassword)" class="gap-1.5">
          <FieldLabel>Password Lama</FieldLabel>
          <Input v-model="currentPassword" type="password" placeholder="••••••••" />
          <FieldError :errors="[{ message: '' }]" />
        </Field>

        <Field class="gap-1.5">
          <FieldLabel>Password Baru</FieldLabel>
          <Input v-model="newPassword" type="password" placeholder="minimal 6 karakter" />
        </Field>

        <Field class="gap-1.5">
          <FieldLabel>Konfirmasi Password Baru</FieldLabel>
          <Input v-model="confirmPassword" type="password" placeholder="ulangi password baru" />
        </Field>

        <div class="flex justify-end">
          <Button type="submit" size="sm" :disabled="saving">Ganti Password</Button>
        </div>
      </form>

      <DialogFooter class="mx-0 mb-0 gap-3 p-0 sm:justify-start">
        <DialogClose as-child>
          <Button variant="ghost" type="button">Tutup</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
