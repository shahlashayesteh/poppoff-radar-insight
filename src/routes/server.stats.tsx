import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/server/stats')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/server/stats"!</div>
}
