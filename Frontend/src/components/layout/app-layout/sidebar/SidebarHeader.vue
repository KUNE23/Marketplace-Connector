<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { SidebarHeader } from '@/components/ui/sidebar'

interface AppSidebarHeaderProps {
  showContent: boolean
}

defineProps<AppSidebarHeaderProps>()
</script>

<template>
  <SidebarHeader class="px-5 py-8">
    <RouterLink to="/" class="flex justify-center">
      <img
        v-if="showContent"
        src="/images/logo/enzyy-logo.png"
        alt="Enzyy"
        :style="{ width: 'auto', height: '40px' }"
      />
      <img
        v-else
        src="/images/logo/enzyy-icon.png"
        alt="Enzyy"
        :style="{ width: '32px', height: '32px' }"
      />
    </RouterLink>
  </SidebarHeader>
</template>
