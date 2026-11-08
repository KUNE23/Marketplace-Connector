<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
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

const showPassword = ref(false)
const serverError = ref('')
const router = useRouter()

const { values, errorOf, touch, handleSubmit, isSubmitting } = useFormValidation<SignInFormData>(
  { email: '', password: '', keepLoggedIn: false },
  validateSignIn,
)

const onSubmit = handleSubmit(async (data) => {
  serverError.value = ''
  try {
    await login(data.email.trim(), data.password, Boolean(data.keepLoggedIn))
    await router.push('/')
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : 'Failed to sign in'
  }
})
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
      <FieldLabel class="mb-1.5 block"> Password <span class="text-red-500">*</span> </FieldLabel>
      <InputGroup>
        <InputGroupInput
          v-model="values.password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Enter your password"
          :aria-invalid="errorOf('password') ? 'true' : undefined"
          @blur="touch('password')"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
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
          Keep me logged in
        </FieldLabel>
      </Field>
      <RouterLink
        to="/reset-password"
        class="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
      >
        Forgot password?
      </RouterLink>
    </div>

    <div
      v-if="serverError"
      class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ serverError }}
    </div>

    <div>
      <Button class="w-full" size="lg" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Signing In...' : 'Sign In' }}
      </Button>
    </div>
  </form>
</template>
