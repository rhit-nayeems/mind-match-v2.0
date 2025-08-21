export default function Progress({ value }: { value: number }) {
  return (
    <div className="w-full h-2 bg-slate-800 rounded">
      <div className="h-2 bg-brand-500 rounded" style={{ width: `${Math.round(value*100)}%` }} />
    </div>
  )
}
