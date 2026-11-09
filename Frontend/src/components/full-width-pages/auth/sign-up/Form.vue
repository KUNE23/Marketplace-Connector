<script setup lang="ts">
import { ref } from 'vue'
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
import { validateSignUp, type SignUpFormData } from './schema'

const showPassword = ref(false)
const showConfirmPassword = ref(false)

const { values, errorOf, touch, handleSubmit, isSubmitting } = useFormValidation<SignUpFormData>(
  { fname: '', lname: '', email: '', password: '', confirmPassword: '', terms: false },
  validateSignUp,
)

const onSubmit = handleSubmit(async () => {
  // handle submit action
})
</script>

<template>
  <form class="space-y-5" novalidate @submit="onSubmit">
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Field :data-invalid="Boolean(errorOf('fname'))">
        <FieldLabel class="mb-1.5 block">
          Nama Depan <span class="text-red-500">*</span>
        </FieldLabel>
        <Input
          v-model="values.fname"
          type="text"
          placeholder="Masukkan nama depan"
          :aria-invalid="errorOf('fname') ? 'true' : undefined"
          @blur="touch('fname')"
        />
        <FieldError :errors="[{ message: errorOf('fname') }]" />
      </Field>

      <Field :data-invalid="Boolean(errorOf('lname'))">
        <FieldLabel class="mb-1.5 block">
          Nama Belakang <span class="text-red-500">*</span>
        </FieldLabel>
        <Input
          v-model="values.lname"
          type="text"
          placeholder="Masukkan nama belakang"
          :aria-invalid="errorOf('lname') ? 'true' : undefined"
          @blur="touch('lname')"
        />
        <FieldError :errors="[{ message: errorOf('lname') }]" />
      </Field>
    </div>

    <Field :data-invalid="Boolean(errorOf('email'))">
      <FieldLabel class="mb-1.5 block"> Email <span class="text-red-500">*</span> </FieldLabel>
      <Input
        v-model="values.email"
        type="email"
        placeholder="Masukkan email"
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

    <Field :data-invalid="Boolean(errorOf('confirmPassword'))">
      <FieldLabel class="mb-1.5 block">
        Konfirmasi Kata Sandi <span class="text-red-500">*</span>
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          v-model="values.confirmPassword"
          :type="showConfirmPassword ? 'text' : 'password'"
          placeholder="Ulangi kata sandi"
          :aria-invalid="errorOf('confirmPassword') ? 'true' : undefined"
          @blur="touch('confirmPassword')"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            :aria-label="showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Tampilkan konfirmasi kata sandi'"
            class="text-gray-500 dark:text-gray-400"
            @click="showConfirmPassword = !showConfirmPassword"
          >
            <EyeIcon v-if="showConfirmPassword" class="fill-current" />
            <EyeCloseIcon v-else class="fill-current" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError :errors="[{ message: errorOf('confirmPassword') }]" />
    </Field>

    <Field
      orientation="horizontal"
      class="items-start gap-3"
      :data-invalid="Boolean(errorOf('terms'))"
    >
      <Checkbox
        id="terms"
        class="mt-0.5"
        :model-value="values.terms"
        :aria-invalid="errorOf('terms') ? 'true' : undefined"
        @update:model-value="values.terms = Boolean($event)"
      />
      <div class="flex flex-col gap-1">
        <FieldLabel
          for="terms"
          class="inline-block cursor-pointer text-sm font-normal text-gray-500 dark:text-gray-400"
        >
          Dengan membuat akun berarti Anda menyetujui
          <span class="text-gray-800 dark:text-white/90">Syarat dan Ketentuan,</span>
          serta
          <span class="text-gray-800 dark:text-white">Kebijakan Privasi</span>
        </FieldLabel>
        <FieldError :errors="[{ message: errorOf('terms') }]" />
      </div>
    </Field>

    <div>
      <Button class="w-full" size="lg" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Memproses...' : 'Daftar' }}
      </Button>
    </div>
  </form>
</template>
