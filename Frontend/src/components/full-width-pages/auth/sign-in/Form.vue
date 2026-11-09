<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { useFormValidation } from '@/composables/useFormValidation'
import { EyeCloseIcon, EyeIcon } from '@/icons/layout'
import { login } from '@/services/auth'
import { validateSignIn, type SignInFormData } from './schema'

const toast = useToast()
const showPassword = ref(false)
const router = useRouter()

const { values, errorOf, touch, handleSubmit, isSubmitting } = useFormValidation<SignInFormData>(
  { email: '', password: '', keepLoggedIn: false },
  validateSignIn,
)

const onSubmit = handleSubmit(async (data) => {
  try {
    await login(data.email.trim(), data.password, Boolean(data.keepLoggedIn))
    toast.success('Berhasil masuk.')
    await router.push('/')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Gagal masuk')
  }
})

// Reset password ditangani admin (belum ada self-service).
function onForgotPassword() {
  toast.info('Lupa kata sandi? Hubungi admin untuk dibuatkan kata sandi baru.')
}
</script>

<template>
  <form class="space-y-5" novalidate @submit="onSubmit">
    <Field :data-invalid="Boolean(errorOf('email'))">
      <FieldLabel class="mb-1.5 block"> Email <span class="text-red-500">*</span> </FieldLabel>
      <Input
        v-model="values.email"
        type="email"
        placeholder="info@gmail.com"
        :aria-invalid="errorOf('email') ? 'true' : undefined"
        @blur="touch('email')"
      />
      <FieldError :errors="[{ message: errorOf('email') }]" />
    </Field>

    <Field :data-invalid="Boolean(errorOf('password'))">
      <FieldLabel class="mb-1.5 block"> Kata Sandi <span class="text-red-500">*</span> </FieldLabel>
      <InputGroup>
        <InputGroupInput
          v-model="values.password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Masukkan kata sandi"
          :aria-invalid="errorOf('password') ? 'true' : undefined"
          @blur="touch('password')"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            :aria-label="showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'"
            class="text-gray-500 dark:text-gray-400"
            @click="showPassword = !showPassword"
          >
            <EyeIcon v-if="showPassword" class="fill-current" />
            <EyeCloseIcon v-else class="fill-current" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError :errors="[{ message: errorOf('password') }]" />
    </Field>

    <div class="flex items-center justify-between">
      <Field orientation="horizontal" class="w-auto items-center gap-3">
        <Checkbox
          id="keep-logged-in"
          :model-value="values.keepLoggedIn"
          @update:model-value="values.keepLoggedIn = Boolean($event)"
        />
        <FieldLabel
          for="keep-logged-in"
          class="text-theme-sm block cursor-pointer font-normal text-gray-700 dark:text-gray-400"
        >
          Tetap masuk
        </FieldLabel>
      </Field>
      <button
        type="button"
        class="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
        @click="onForgotPassword"
      >
        Lupa kata sandi?
      </button>
    </div>

    <div>
      <Button class="w-full" size="lg" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Memproses...' : 'Masuk' }}
      </Button>
    </div>
  </form>
</template>
