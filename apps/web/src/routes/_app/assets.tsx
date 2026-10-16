import { createFileRoute } from '@tanstack/react-router'
import { AssetsPage } from '@/features/assets'

export const Route = createFileRoute('/_app/assets')({
  component: AssetsPage,
})
