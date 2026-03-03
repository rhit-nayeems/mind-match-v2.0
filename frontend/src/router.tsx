// frontend/src/router.tsx
import { createBrowserRouter } from 'react-router-dom'
import App from './pages/App'
import Landing from './pages/Landing'
import Quiz from './pages/Quiz'
import Loading from './pages/Loading'
import Results from './pages/Results'
import ResultsPage from './pages/ResultsPage'
import RouteError from './pages/RouteError'

export default createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Landing /> },
      { path: 'quiz', element: <Quiz /> },
      { path: 'loading', element: <Loading /> },
      { path: 'results', element: <Results /> },
      { path: 'results2', element: <ResultsPage /> },
    ],
  },
])
