import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/manager/reports')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/manager/reports"!</div>
}
