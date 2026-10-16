import { createFileRoute } from '@tanstack/react-router'
import { Now } from '@/features/now'

export const Route = createFileRoute('/_app/now')({
  component: Now,
})
