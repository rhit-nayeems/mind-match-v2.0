import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts'

export default function TraitRadar({ user, movie }: { user: Record<string, number>, movie: Record<string, number> }) {
  const keys = ['energy','mood','depth','optimism','novelty','comfort','intensity','humor','darkness']
  const data = keys.map(k => ({ trait: k, you: user[k] ?? 0, film: movie[k] ?? 0 }))
  return (
    <div className="w-full h-64">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius={80}>
          <PolarGrid />
          <PolarAngleAxis dataKey="trait" />
          <Radar name="You" dataKey="you" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} />
          <Radar name="Film" dataKey="film" stroke="#34d399" fill="#34d399" fillOpacity={0.3} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
