import { createRouter, createWebHistory } from 'vue-router'
import { ApiError, apiFetch, tryRefreshSession } from '@/services/api'
import { useAuthUser } from '@/composables/useAuthUser'

const { load: loadAuthUser } = useAuthUser()

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { left: 0, top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'Ecommerce',
      component: () => import('../views/Dashboard/Ecommerce.vue'),
      meta: {
        title: 'eCommerce Dashboard',
      },
    },
    {
      path: '/products',
      name: 'Products',
      component: () => import('../views/Products/Products.vue'),
      meta: {
        title: 'Products',
      },
    },
    {
      path: '/penjualan',
      name: 'Penjualan',
      component: () => import('../views/Penjualan/Penjualan.vue'),
      meta: {
        title: 'Penjualan',
      },
    },
    {
      path: '/listing',
      name: 'Listing',
      component: () => import('../views/Listings/Listings.vue'),
      meta: {
        title: 'Listing',
      },
    },
    {
      path: '/markup',
      name: 'Markup',
      component: () => import('../views/Markup/Markup.vue'),
      meta: {
        title: 'Markup',
        adminOnly: true,
      },
    },
    {
      path: '/pesanan',
      name: 'Pesanan',
      component: () => import('../views/Orders/Orders.vue'),
      meta: {
        title: 'Pesanan',
      },
    },
    {
      path: '/jobs',
      name: 'Jobs',
      component: () => import('../views/Jobs/Jobs.vue'),
      meta: {
        title: 'Jobs',
        adminOnly: true,
      },
    },
    {
      path: '/iklan',
      name: 'Iklan',
      component: () => import('../views/Iklan/Iklan.vue'),
      meta: {
        title: 'Iklan',
      },
    },
    {
      path: '/akun-akulaku',
      name: 'Akun Akulaku',
      component: () => import('../views/AkulakuAccounts/AkulakuAccounts.vue'),
      meta: {
        title: 'Akun Akulaku',
        adminOnly: true,
      },
    },
    {
      path: '/pegawai',
      name: 'Pegawai',
      component: () => import('../views/Pegawai/Pegawai.vue'),
      meta: {
        title: 'Pegawai',
        adminOnly: true,
      },
    },
    {
      path: '/calendar',
      name: 'Calendar',
      component: () => import('../views/Calendar.vue'),
      meta: {
        title: 'Calendar',
      },
    },
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('../views/Profile.vue'),
      meta: {
        title: 'Profile',
      },
    },
    {
      path: '/form-elements',
      name: 'Form Elements',
      component: () => import('../views/Forms/FormElements.vue'),
      meta: {
        title: 'Form Elements',
      },
    },
    {
      path: '/basic-tables',
      name: 'Basic Tables',
      component: () => import('../views/Tables/BasicTables.vue'),
      meta: {
        title: 'Basic Tables',
      },
    },
    {
      path: '/line-chart',
      name: 'Line Chart',
      component: () => import('../views/Charts/LineChart.vue'),
    },
    {
      path: '/bar-chart',
      name: 'Bar Chart',
      component: () => import('../views/Charts/BarChart.vue'),
    },
    {
      path: '/alerts',
      name: 'Alerts',
      component: () => import('../views/UiElements/Alerts.vue'),
      meta: {
        title: 'Alerts',
      },
    },
    {
      path: '/avatars',
      name: 'Avatars',
      component: () => import('../views/UiElements/Avatars.vue'),
      meta: {
        title: 'Avatars',
      },
    },
    {
      path: '/badge',
      name: 'Badge',
      component: () => import('../views/UiElements/Badge.vue'),
      meta: {
        title: 'Badge',
      },
    },

    {
      path: '/buttons',
      name: 'Buttons',
      component: () => import('../views/UiElements/Buttons.vue'),
      meta: {
        title: 'Buttons',
      },
    },

    {
      path: '/images',
      name: 'Images',
      component: () => import('../views/UiElements/Images.vue'),
      meta: {
        title: 'Images',
      },
    },
    {
      path: '/videos',
      name: 'Videos',
      component: () => import('../views/UiElements/Videos.vue'),
      meta: {
        title: 'Videos',
      },
    },
    {
      path: '/blank',
      name: 'Blank',
      component: () => import('../views/Pages/BlankPage.vue'),
      meta: {
        title: 'Blank',
      },
    },

    {
      path: '/error-404',
      name: '404 Error',
      component: () => import('../views/Errors/FourZeroFour.vue'),
      meta: {
        title: '404 Error',
      },
    },

    {
      path: '/signin',
      name: 'Signin',
      component: () => import('../views/Auth/Signin.vue'),
      meta: {
        title: 'Signin',
      },
    },
    {
      path: '/signup',
      name: 'Signup',
      component: () => import('../views/Auth/Signup.vue'),
      meta: {
        title: 'Signup',
      },
    },
  ],
})

export default router

async function hasUsableSession(): Promise<boolean> {
  try {
    // Access cookie masih valid?
    await apiFetch('/auth/me', { skipAuthRefresh: true })
    return true
  } catch (err) {
    // 401 -> coba perbarui sesi via refresh cookie.
    if (err instanceof ApiError && err.status === 401) {
      return tryRefreshSession()
    }
    return false
  }
}

router.beforeEach(async (to, from, next) => {
  document.title = `Vue.js ${to.meta.title} | Enzyy - Vue.js Tailwind CSS Dashboard Template`

  const isPublicRoute = to.name === 'Signin' || to.name === 'Signup'
  const hasSession = await hasUsableSession()

  if (isPublicRoute) {
    if (hasSession) return next({ path: '/', replace: true })
    return next()
  }

  if (!hasSession) {
    return next({ path: '/signin', query: { redirect: to.fullPath } })
  }

  // Route khusus admin: pegawai dialihkan ke dashboard.
  if (to.meta.adminOnly) {
    const user = await loadAuthUser()
    if (user && user.role !== 'ADMIN') {
      return next({ path: '/', replace: true })
    }
  }

  return next()
})


