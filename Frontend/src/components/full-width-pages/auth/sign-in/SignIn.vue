<script setup lang="ts">
import SignInFormFields from './Form.vue'
import SignInHeader from './Header.vue'
</script>

<template>
  <div class="flex w-full flex-1 flex-col lg:w-1/2">
    <div class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
      <div>
        <SignInHeader />

        <SignInFormFields />
      </div>
    </div>
  </div>
</template>
