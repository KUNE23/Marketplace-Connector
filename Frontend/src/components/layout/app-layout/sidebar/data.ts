import {
  BarChartIcon,
  BoxIcon,
  CartIcon,
  DollarIcon,
  LayoutGridIcon,
  PageIcon,
  TagIcon,
  TargetIcon,
  UserCircleIcon,
  UsersIcon,
} from '@/icons/layout'
import type { NavItem } from './types'

export interface AppNavItem extends NavItem {
  adminOnly?: boolean
  superAdminOnly?: boolean
}

export interface NavSection {
  type: string
  label: string
  adminOnly?: boolean
  superAdminOnly?: boolean
  items: AppNavItem[]
}

export const navSections: NavSection[] = [
  {
    type: 'main',
    label: 'Utama',
    items: [
      {
        icon: LayoutGridIcon,
        name: 'Dashboard',
        path: '/',
      },
      {
        icon: BoxIcon,
        name: 'Products',
        path: '/products',
      },
      {
        icon: DollarIcon,
        name: 'Penjualan',
        path: '/penjualan',
      },
    ],
  },
  {
    type: 'operational',
    label: 'Operasional',
    items: [
      {
        icon: PageIcon,
        name: 'Listing',
        path: '/listing',
      },
      {
        icon: CartIcon,
        name: 'Pesanan',
        path: '/pesanan',
      },
      {
        icon: TargetIcon,
        name: 'Iklan',
        path: '/iklan',
      },
      {
        icon: UserCircleIcon,
        name: 'Akun Akulaku',
        path: '/akun-akulaku',
      },
      {
        icon: TargetIcon,
        name: 'Pelanggaran',
        path: '/pelanggaran',
      },

    ],
  },
  {
    type: 'admin',
    label: 'Administrasi',
    adminOnly: true,
    items: [
      {
        icon: TagIcon,
        name: 'Markup',
        path: '/markup',
      },
      {
        icon: UsersIcon,
        name: 'Pegawai',
        path: '/pegawai',
      },
    ],
  },
  {
    type: 'superadmin',
    label: 'Superadmin',
    superAdminOnly: true,
    items: [
      {
        icon: BarChartIcon,
        name: 'Monitor Sistem',
        path: '/monitor',
      },
    ],
  },
]
