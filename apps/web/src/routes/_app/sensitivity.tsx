import { createFileRoute } from '@tanstack/react-router'
import { Sensitivity } from '@/features/sensitivity'

export const Route = createFileRoute('/_app/sensitivity')({
  component: Sensitivity,
})
