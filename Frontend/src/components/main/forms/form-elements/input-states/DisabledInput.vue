<script setup lang="ts">
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
</script>

<template>
  <Field>
    <FieldLabel class="text-gray-400 dark:text-gray-500">Email</FieldLabel>
    <Input type="email" default-value="info@enzyy.com" disabled />
  </Field>
</template>
