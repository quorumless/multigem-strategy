import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

/** Page frame: slim toolbar, then the page title and a one-line plain-language lede. */
export function PageShell({ title, lede, children }: { title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <Header>
        <span className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>
      <Main className='space-y-6 pt-2'>
        <div className='space-y-1'>
          <h1 className='font-display text-2xl font-bold tracking-tight sm:text-3xl'>{title}</h1>
          {lede && <p className='max-w-prose text-muted-foreground'>{lede}</p>}
        </div>
        {children}
      </Main>
    </>
  )
}
