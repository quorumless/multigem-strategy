import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Header>
        <h1 className='me-auto font-semibold'>{title}</h1>
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>
      <Main className='space-y-4'>{children}</Main>
    </>
  )
}
