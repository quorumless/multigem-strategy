import { createFileRoute } from '@tanstack/react-router'
import { Lab } from '@/features/lab'

export const Route = createFileRoute('/_app/')({
  component: Lab,
})
