import { BookOpen, Compass, Database, GitCompare, LayoutDashboard, SlidersHorizontal } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'General',
      items: [
        { title: 'Backtest', url: '/', icon: LayoutDashboard },
        { title: 'What to hold now', url: '/now', icon: Compass },
        { title: 'Compare', url: '/compare', icon: GitCompare },
        { title: 'Robustness', url: '/sensitivity', icon: SlidersHorizontal },
        { title: 'Assets & data', url: '/assets', icon: Database },
        { title: 'How GEM works', url: '/how-it-works', icon: BookOpen },
      ],
    },
  ],
}
