<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { useAuthUser } from '@/composables/useAuthUser'
import { useSidebar } from '@/composables/useSidebar'
import { HorizontalDotsIcon, MenuTwoIcon, SearchIcon, XIcon } from '@/icons/layout'
import NotificationDropdown from '../../header/notification-dropdown/NotificationDropdown.vue'
import ThemeToggleButton from '../../header/theme-toggler/ThemeToggler.vue'
import UserDropdown from '../../header/user-dropdown/UserDropdown.vue'
import { navSections } from '../sidebar/data'
import { cn } from '@/utils/cn'

const inputRef = ref<InstanceType<typeof InputGroupInput> | null>(null)
const isApplicationMenuOpen = ref(false)
const { openMobile, toggleSidebar } = useSidebar()

// ---- Pencarian cepat (menu + produk) ----
const router = useRouter()
const { user } = useAuthUser()
const query = ref('')
const searchOpen = ref(false)
const activeIndex = ref(0)
const searchWrapper = ref<HTMLElement | null>(null)

const isAdmin = computed(() => user.value?.role === 'ADMIN')

const menuItems = computed<{ name: string; path: string }[]>(() =>
  navSections
    .filter((section) => isAdmin.value || !section.adminOnly)
    .flatMap((section) => section.items.filter((item) => isAdmin.value || !item.adminOnly))
    .filter((item): item is { name: string; path: string } & typeof item => Boolean(item.path))
    .map((item) => ({ name: item.name, path: item.path })),
)

interface SearchResult {
  label: string
  path: string
  hint: string
}

const results = computed<SearchResult[]>(() => {
  const q = query.value.trim()
  if (!q) return []
  const lower = q.toLowerCase()
  const menus = menuItems.value
    .filter((item) => item.name.toLowerCase().includes(lower) || item.path.toLowerCase().includes(lower))
    .slice(0, 5)
    .map((item) => ({ label: item.name, path: item.path, hint: 'Halaman' }))
  return [...menus, { label: `Cari produk "${q}"`, path: `/products?search=${encodeURIComponent(q)}`, hint: 'Produk' }]
})

function goTo(path: string) {
  searchOpen.value = false
  query.value = ''
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  router.push(path)
}

function onEnter() {
  const item = results.value[activeIndex.value]
  if (item) goTo(item.path)
}

function moveActive(step: number) {
  if (!results.value.length) return
  activeIndex.value = (activeIndex.value + step + results.value.length) % results.value.length
}

function onQueryInput() {
  activeIndex.value = 0
  searchOpen.value = true
}

function onClickOutside(event: MouseEvent) {
  if (!searchWrapper.value) return
  if (!searchWrapper.value.contains(event.target as Node)) searchOpen.value = false
}

const toggleApplicationMenu = () => {
  isApplicationMenuOpen.value = !isApplicationMenuOpen.value
}

const handleKeyDown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault()
    inputRef.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('click', onClickOutside)
})
</script>

<template>
  <header
    class="sticky top-0 z-50 flex w-full shrink-0 border-gray-200 bg-white xl:border-b dark:border-gray-800 dark:bg-gray-900"
  >
    <div class="flex grow flex-col items-center justify-between xl:flex-row xl:px-6">
      <!-- Left side content -->
      <div
        class="flex w-full items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 sm:gap-4 xl:justify-normal xl:border-b-0 xl:px-0 xl:py-4 dark:border-gray-800"
      >
        <Button
          variant="outline"
          size="icon"
          class="text-gray-500 lg:size-11 dark:text-gray-400"
          aria-label="Toggle Sidebar"
          @click="toggleSidebar"
        >
          <XIcon v-if="openMobile" class="size-6" />
          <MenuTwoIcon v-else class="size-auto! rtl:-scale-x-100" />
        </Button>

        <RouterLink to="/" class="xl:hidden">
          <img
            width="154"
            height="32"
            src="/images/logo/enzyy-logo.png"
            alt="Enzyy"
            :style="{ height: '32px', width: 'auto' }"
          />
        </RouterLink>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle application menu"
          class="text-gray-700 xl:hidden dark:text-gray-400"
          @click="toggleApplicationMenu"
        >
          <HorizontalDotsIcon />
        </Button>

        <div ref="searchWrapper" class="relative hidden xl:block">
          <form @submit.prevent="onEnter">
            <Field class="xl:w-107.5">
              <InputGroup
                class="border-gray-200 bg-transparent dark:border-gray-800 dark:bg-white/3"
              >
                <InputGroupAddon align="inline-start">
                  <SearchIcon class="size-5 text-gray-500 dark:text-gray-400" />
                </InputGroupAddon>
                <InputGroupInput
                  ref="inputRef"
                  v-model="query"
                  type="text"
                  placeholder="Cari halaman atau produk..."
                  class="text-gray-800 placeholder:text-gray-400 dark:text-white/90 dark:placeholder:text-white/30"
                  @input="onQueryInput"
                  @focus="onQueryInput"
                  @keydown.down.prevent="moveActive(1)"
                  @keydown.up.prevent="moveActive(-1)"
                  @keydown.esc="searchOpen = false"
                />
                <InputGroupAddon align="inline-end">
                  <Badge
                    variant="light"
                    color="gray"
                    size="sm"
                    class="cursor-pointer gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-1.75 py-[4.5px] text-xs tracking-[-0.2px] text-gray-500 shadow-none dark:border-gray-800 dark:bg-white/3 dark:text-gray-400"
                  >
                    <span>⌘</span>
                    <span>K</span>
                  </Badge>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </form>

          <!-- Hasil pencarian cepat -->
          <div
            v-if="searchOpen && results.length"
            class="absolute z-99999 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-theme-lg dark:border-gray-800 dark:bg-[#1E2635]"
          >
            <button
              v-for="(item, index) in results"
              :key="item.path + item.hint"
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm transition-colors"
              :class="
                index === activeIndex
                  ? 'bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-white/90'
                  : 'text-gray-600 dark:text-gray-300'
              "
              @mouseenter="activeIndex = index"
              @click="goTo(item.path)"
            >
              <span class="min-w-0 truncate">{{ item.label }}</span>
              <span class="shrink-0 text-xs text-gray-400">{{ item.hint }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Right side content -->
      <div
        :class="
          cn(
            'flex w-full items-center justify-between gap-4 px-5 py-4 shadow-theme-md xl:flex xl:justify-end xl:px-0 xl:shadow-none',
            isApplicationMenuOpen ? 'flex' : 'hidden',
          )
        "
      >
        <div class="2xsm:gap-3 flex items-center gap-2">
          <ThemeToggleButton />

          <NotificationDropdown />
        </div>
        <UserDropdown />
      </div>
    </div>
  </header>
</template>
