import { createFileRoute } from '@tanstack/react-router'
import { HowItWorks } from '@/features/how-it-works'

export const Route = createFileRoute('/_app/how-it-works')({
  component: HowItWorks,
})
