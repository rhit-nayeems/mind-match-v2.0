import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

export default function RouteError() {
  const err = useRouteError()

  let title = 'Something went wrong'
  let detail = 'Please retry or go back to the home page.'

  if (isRouteErrorResponse(err)) {
    title = `${err.status} ${err.statusText}`
    detail = typeof err.data === 'string' && err.data ? err.data : detail
  } else if (err instanceof Error && err.message) {
    detail = err.message
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="surface p-6 text-center">
        <h1 className="headline text-2xl text-zinc-100">{title}</h1>
        <p className="mt-2 text-zinc-400">{detail}</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link className="btn-neo" to="/">Go Home</Link>
          <Link className="btn-ghost" to="/quiz">Restart Quiz</Link>
        </div>
      </div>
    </div>
  )
}
