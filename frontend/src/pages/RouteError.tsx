import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

export default function RouteError() {
  const error = useRouteError()

  let title = 'Something went wrong'
  let detail = 'A route error occurred. Please try again or return to home.'

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`
    detail = typeof error.data === 'string' ? error.data : detail
  } else if (error instanceof Error && error.message) {
    detail = error.message
  }

  return (
    <div className="mx-auto max-w-3xl py-10">
      <section className="surface p-6 md:p-8">
        <span className="outline-chip">route recovery</span>
        <h1 className="headline mt-4 text-2xl text-zinc-100 md:text-3xl">{title}</h1>
        <p className="mt-3 text-zinc-300">{detail}</p>
        <div className="mt-6">
          <Link to="/" className="btn-neo">
            Go Home
          </Link>
        </div>
      </section>
    </div>
  )
}
