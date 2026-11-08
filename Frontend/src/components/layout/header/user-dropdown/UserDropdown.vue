<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthUser } from '@/composables/useAuthUser'
import { useRTL } from '@/composables/useRTL'
import { ChevronDownIcon, GearIcon } from '@/icons/layout'
import { cn } from '@/utils/cn'
import AccountSettingsModal from './AccountSettingsModal.vue'

const { isRtl, setRTL } = useRTL()
const isOpen = ref(false)
const isSettingsOpen = ref(false)
const { user: authUser, load } = useAuthUser()

const displayName = computed(() => authUser.value?.name ?? authUser.value?.email ?? '')
const roleLabel = computed(() => (authUser.value?.role === 'ADMIN' ? 'Admin' : 'Pegawai'))

onMounted(() => {
  load()
})

const handleSelectLanguage = (id: string) => {
  if (id === 'ar') {
    setRTL(true)
  } else {
    setRTL(false)
  }
}
</script>

<template>
  <DropdownMenu :open="isOpen" @update:open="isOpen = $event">
    <DropdownMenuTrigger class="dropdown-toggle flex items-center text-gray-700 dark:text-gray-400">
      <span
        class="me-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white"
      >
        {{ displayName.slice(0, 2).toUpperCase() }}
      </span>

      <span class="me-1 block text-sm font-medium">{{ displayName }}</span>

      <ChevronDownIcon
        :class="
          cn(
            'size-5 text-gray-500 duration-200 dark:text-gray-400',
            isOpen ? 'rotate-180' : 'rotate-0',
          )
        "
      />
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" :side-offset="12" class="w-65 p-3">
      <div class="px-3 py-2">
        <span class="block text-sm font-medium text-gray-700 dark:text-gray-400">
          {{ displayName }}
        </span>
        <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
          {{ authUser?.email }} · {{ roleLabel }}
        </span>
      </div>

      <DropdownMenuItem
        class="flex items-center gap-3 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-white/5"
        @click="
          () => {
            isOpen = false
            isSettingsOpen = true
          }
        "
      >
        <GearIcon class="size-5 text-gray-500 dark:text-gray-400" />
        <span class="text-sm text-gray-700 dark:text-gray-300">Pengaturan Akun</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <AccountSettingsModal :is-open="isSettingsOpen" @open-change="isSettingsOpen = $event" />
</template>
