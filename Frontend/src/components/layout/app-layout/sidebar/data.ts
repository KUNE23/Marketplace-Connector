import {
  BoxIcon,
  CartIcon,
  DollarIcon,
  LayoutGridIcon,
  PageIcon,
  PluginIcon,
  TagIcon,
  TargetIcon,
  UserCircleIcon,
  UsersIcon,
} from '@/icons/layout'
import type { NavItem } from './types'

export interface AppNavItem extends NavItem {
  adminOnly?: boolean
}

export interface NavSection {
  type: string
  label: string
  adminOnly?: boolean
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
        icon: UserCircleIcon,
        name: 'Akun Akulaku',
        path: '/akun-akulaku',
      },
      {
        icon: PluginIcon,
        name: 'Jobs',
        path: '/jobs',
      },
      {
        icon: UsersIcon,
        name: 'Pegawai',
        path: '/pegawai',
      },
    ],
  },
]
