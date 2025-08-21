// frontend/src/pages/ResultsPage.tsx
import { useEffect, useState } from "react"
import Results from "./Results"
import { mapApiToResults } from "../adapters/mapApiToResults"

export default function ResultsPage() {
  const [data, setData] = useState<ReturnType<typeof mapApiToResults> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/recommend", {
          method: "GET",
          headers: { "Accept": "application/json" },
        })
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const json = await res.json()
        setData(mapApiToResults(json))
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load recommendations")
      }
    })()
  }, [])

  if (err) return <div className="p-6 text-red-300">Error: {err}</div>
  if (!data) return <div className="p-6 opacity-70">Loading…</div>

  return (
    <Results
      userTraits={data.userTraits}
      recommendations={data.recommendations}
      profileSummary={data.profileSummary}
      onRestart={() => (window.location.href = "/")}
    />
  )
}
