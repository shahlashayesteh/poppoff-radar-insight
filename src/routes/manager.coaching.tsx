import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/manager/coaching')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/manager/coaching"!</div>
}
