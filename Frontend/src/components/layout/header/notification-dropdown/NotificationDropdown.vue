<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BellIcon, DotIcon, XIcon } from '@/icons/layout'
import { cn } from '@/utils/cn'
import {
  formatRelativeTime,
  listNotificationsSimple,
  markNotificationRead,
  type Notification,
} from '@/services/notifications'

const isOpen = ref(false)
const items = ref<Notification[]>([])
const loading = ref(false)

const unreadCount = computed(() => items.value.filter((item) => !item.readAt).length)
const hasUnread = computed(() => unreadCount.value > 0)

async function load() {
  loading.value = true
  try {
    const response = await listNotificationsSimple(20)
    items.value = response.notifications
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

async function handleOpenChange(open: boolean) {
  isOpen.value = open
  if (open) await load()
}

async function handleRead(item: Notification) {
  if (!item.readAt) {
    try {
      await markNotificationRead(item.id)
      items.value = items.value.map((n) =>
        n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
      )
    } catch {
      /* ignore */
    }
  }
}

onMounted(load)
</script>

<template>
  <DropdownMenu :open="isOpen" @update:open="handleOpenChange">
    <DropdownMenuTrigger
      :class="buttonVariants({ variant: 'outline', size: 'icon-lg', class: 'relative' })"
      aria-label="Toggle notifications"
    >
      <span
        :class="
          cn(
            'absolute end-0 -top-0.5 z-10 h-4 min-w-4 translate-x-1/2 items-center justify-center rounded-full bg-orange-400 px-1 text-[10px] font-medium text-white',
            hasUnread ? 'flex' : 'hidden',
          )
        "
      >
        {{ unreadCount }}
      </span>
      <BellIcon class="size-auto!" />
    </DropdownMenuTrigger>

    <DropdownMenuContent
      align="end"
      :side-offset="12"
      class="w-87.5 overflow-hidden p-3 sm:w-90.25 dark:bg-[#1E2635]"
    >
      <div class="flex items-center justify-between pb-3">
        <h5 class="text-lg font-semibold text-gray-800 dark:text-gray-200">Notification</h5>
        <Button variant="ghost" size="icon-xs" aria-label="Close notifications" @click="isOpen = false">
          <XIcon class="size-5" />
        </Button>
      </div>

      <DropdownMenuSeparator class="my-0" />

      <ScrollArea class="h-96">
        <div class="flex flex-col pe-2">
          <p v-if="loading" class="p-3 text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
          <p v-else-if="items.length === 0" class="p-3 text-sm text-gray-500 dark:text-gray-400">
            Belum ada notifikasi.
          </p>

          <template v-for="item in items" :key="item.id">
            <DropdownMenuItem
              class="flex items-start gap-3 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-white/5"
              @click="handleRead(item)"
            >
              <span
                :class="
                  cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    item.readAt ? 'bg-gray-300 dark:bg-gray-600' : 'bg-orange-400',
                  )
                "
              />
              <span class="block flex-1 text-start">
                <span class="mb-1 block text-sm font-medium text-gray-800 dark:text-white/90">
                  {{ item.title }}
                </span>
                <span class="block text-sm text-gray-500 dark:text-gray-400">{{ item.body }}</span>
                <span class="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{{ item.type }}</span>
                  <DotIcon class="size-2 text-gray-400 dark:text-gray-500" />
                  <span>{{ formatRelativeTime(item.createdAt) }}</span>
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator class="my-0.5 bg-gray-100 last-of-type:hidden dark:bg-gray-700" />
          </template>
        </div>
      </ScrollArea>

      <RouterLink
        to="/notifikasi"
        :class="buttonVariants({ variant: 'outline', size: 'default', class: 'mt-3 w-full' })"
        @click="isOpen = false"
      >
        Lihat Semua Notifikasi
      </RouterLink>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
