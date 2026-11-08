import 'flatpickr/dist/flatpickr.css'
import 'jsvectormap/dist/jsvectormap.css'
// App styles last so they override vendor CSS
import './assets/main.css'

import { createApp } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import App from './App.vue'
import router from './router'
import { initRTL } from './composables/useRTL'
import { setUnauthenticatedHandler } from './services/api'

initRTL()

// Sesi benar-benar habis (refresh token ditolak/expired) -> kembali ke login.
setUnauthenticatedHandler(() => {
  const current = router.currentRoute.value
  if (current.name === 'Signin') return
  router.replace({ path: '/signin', query: { redirect: current.fullPath } })
})

const app = createApp(App)

app.use(router)
app.use(VueApexCharts)

app.mount('#app')
