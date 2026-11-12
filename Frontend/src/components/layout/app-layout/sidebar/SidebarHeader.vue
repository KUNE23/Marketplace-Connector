<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { SidebarHeader } from '@/components/ui/sidebar'
import { useAuthUser } from '@/composables/useAuthUser'

interface AppSidebarHeaderProps {
  showContent: boolean
}

defineProps<AppSidebarHeaderProps>()

// Label panel mengikuti role user yang login (Admin Panel / Panel Pegawai).
const { user } = useAuthUser()
const panelLabel = computed(() => (user.value?.role === 'ADMIN' ? 'Admin Panel' : 'Panel Pegawai'))
</script>

<template>
  <SidebarHeader class="px-5 py-6">
    <RouterLink to="/" class="flex justify-center">
      <img
        v-if="showContent"
        src="/images/logo/enzyy-logo.png"
        alt="Enzyy"
        :style="{ width: 'auto', height: '36px' }"
      />
      <img
        v-else
        src="/images/logo/enzyy-icon.png"
        alt="Enzyy"
        :style="{ width: '32px', height: '32px' }"
      />
    </RouterLink>
    <p
      v-if="showContent"
      class="mt-1.5 text-center text-xs font-medium text-gray-400 dark:text-gray-500"
    >
      {{ panelLabel }}
      <span class="mx-1 text-gray-300 dark:text-gray-600">·</span>
      Enzyy
    </p>
  </SidebarHeader>
</template>
