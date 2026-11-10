<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
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
import { changeOwnPassword, updateOwnProfile } from '@/services/users'
import { useAuthUser } from '@/composables/useAuthUser'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'openChange', open: boolean): void }>()

const toast = useToast()
const { user, load } = useAuthUser()

const name = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const saving = ref(false)

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      name.value = user.value?.name ?? ''
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
    }
  },
)

async function saveName() {
  if (!name.value.trim()) return toast.warning('Nama tidak boleh kosong')
  saving.value = true
  try {
    await updateOwnProfile(name.value.trim())
    await load(true)
    toast.success('Nama berhasil diperbarui.')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal menyimpan nama')
  } finally {
    saving.value = false
  }
}

async function savePassword() {
  if (!currentPassword.value) return toast.warning('Password lama wajib diisi')
  if (newPassword.value.length < 8) return toast.warning('Password baru minimal 8 karakter')
  if (newPassword.value !== confirmPassword.value) return toast.warning('Konfirmasi password tidak sama')

  saving.value = true
  try {
    await changeOwnPassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    toast.success('Password berhasil diganti.')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Gagal mengganti password')
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
        <Field class="gap-1.5">
          <FieldLabel>Password Lama</FieldLabel>
          <Input v-model="currentPassword" type="password" placeholder="••••••••" />
        </Field>

        <Field class="gap-1.5">
          <FieldLabel>Password Baru</FieldLabel>
          <Input v-model="newPassword" type="password" placeholder="minimal 8 karakter" />
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
