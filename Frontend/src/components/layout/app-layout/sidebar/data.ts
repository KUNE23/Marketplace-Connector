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
} from '@/icons/layout'
import type { NavItem } from './types'

export const navItems: NavItem[] = [
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
  {
    icon: PageIcon,
    name: 'Listing',
    path: '/listing',
  },
  {
    icon: TagIcon,
    name: 'Markup',
    path: '/markup',
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
    icon: PluginIcon,
    name: 'Jobs',
    path: '/jobs',
  },
]

export const othersItems: NavItem[] = []
