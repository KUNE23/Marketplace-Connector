<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Sidebar, SidebarContent, useSidebar } from '@/components/ui/sidebar'
import { navSections } from './data'
import AppSidebarHeader from './SidebarHeader.vue'
import SidebarNavGroup from './SidebarNavGroup.vue'
import { useAuthUser } from '@/composables/useAuthUser'
import { logout } from '@/services/auth'
import { LogOutIcon } from '@/icons/layout'
import type { MenuType, NavItem } from './types'

const { user: authUser, load } = useAuthUser()
const router = useRouter()

const isAdmin = computed(
  () => authUser.value?.role === 'ADMIN' || authUser.value?.role === 'SUPERADMIN',
)
const isSuperAdmin = computed(() => authUser.value?.role === 'SUPERADMIN')

const visibleSections = computed<{ type: MenuType; label: string; items: NavItem[] }[]>(() =>
  navSections
    .map((section) => ({
      type: section.type as MenuType,
      label: section.label,
      sectionAdminOnly: section.adminOnly ?? false,
      sectionSuperAdminOnly: section.superAdminOnly ?? false,
      items: section.items
        .filter((item) => isAdmin.value || !item.adminOnly)
        .filter((item) => isSuperAdmin.value || !item.superAdminOnly)
        .map(({ adminOnly: _a, superAdminOnly: _sa, ...item }) => item),
    }))
    .filter((s) => (isAdmin.value || !s.sectionAdminOnly) && (isSuperAdmin.value || !s.sectionSuperAdminOnly))
    .filter((s) => s.items.length > 0)
    .map(({ sectionAdminOnly: _s, sectionSuperAdminOnly: _ss, ...rest }) => rest),
)

const findMatchingSubmenu = (path: string) => {
  for (const section of visibleSections.value) {
    for (let index = 0; index < section.items.length; index++) {
      const nav = section.items[index]
      if (nav.subItems?.some((subItem) => subItem.path === path)) {
        return { type: section.type, index }
      }
    }
  }
  return null
}

const route = useRoute()
const { open, isMobile, isHovered } = useSidebar()

const pathname = computed(() => route.path)

const showContent = computed(() => open.value || isHovered.value || isMobile.value)

const openSubmenu = ref<{ type: MenuType; index: number } | null>(
  findMatchingSubmenu(pathname.value),
)

watch(pathname, (path) => {
  openSubmenu.value = findMatchingSubmenu(path)
})

const handleSubmenuToggle = (index: number, menuType: MenuType) => {
  const prevOpenSubmenu = openSubmenu.value
  if (prevOpenSubmenu && prevOpenSubmenu.type === menuType && prevOpenSubmenu.index === index) {
    openSubmenu.value = null
    return
  }
  openSubmenu.value = { type: menuType, index }
}

const isLoggingOut = ref(false)

const handleLogout = async () => {
  if (isLoggingOut.value) return
  isLoggingOut.value = true
  try {
    await logout()
  } finally {
    isLoggingOut.value = false
    router.push('/signin')
  }
}

onMounted(() => {
  load()
})
</script>

<template>
  <Sidebar side="left" collapsible="icon">
    <AppSidebarHeader :show-content="showContent" />

    <SidebarContent class="flex overflow-y-auto px-5 duration-300 ease-linear">
      <nav class="mb-6 flex-1">
        <div class="flex flex-col gap-4">
          <SidebarNavGroup
            v-for="section in visibleSections"
            :key="section.type"
            :label="section.label"
            :menu-type="section.type"
            :items="section.items"
            :open-submenu="openSubmenu"
            :show-content="showContent"
            :pathname="pathname"
            @toggle-submenu="handleSubmenuToggle"
          />
        </div>
      </nav>

      <div class="border-t border-gray-100 py-4 dark:border-white/5">
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-error-500 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-error-400"
          :disabled="isLoggingOut"
          @click="handleLogout"
        >
          <LogOutIcon class="size-5" />
          <span v-if="showContent">{{ isLoggingOut ? 'Keluar...' : 'Keluar' }}</span>
        </button>
      </div>
    </SidebarContent>
  </Sidebar>
</template>
