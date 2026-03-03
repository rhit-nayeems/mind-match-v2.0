// frontend/src/router.tsx
import { createBrowserRouter } from 'react-router-dom'
import App from './pages/App'
import Landing from './pages/Landing'
import Quiz from './pages/Quiz'
import Loading from './pages/Loading'
import Results from './pages/Results'           // <-- Lovable-style page (rewritten)
import ResultsPage from './pages/ResultsPage'   // <-- Fallback wrapper that fetches

export default createBrowserRouter([
  { path: '/', element: <App />, children: [
    { index: true, element: <Landing /> },
    { path: 'quiz', element: <Quiz /> },
    { path: 'loading', element: <Loading /> },
    // Use the Lovable-style page by default:
    { path: 'results', element: <Results /> },

    // OPTIONAL: expose the wrapper too, if you want to test it
    { path: 'results2', element: <ResultsPage /> },
  ]},
])
