const colors = {
  open: 'bg-blue-100 text-blue-800 border border-blue-300',
  'in-progress': 'bg-purple-100 text-purple-800 border border-purple-300',
  resolved: 'bg-gray-100 text-gray-600 border border-gray-300',
}

export default function StatusBadge({ status }: { status: string }) {
  const cls = colors[status as keyof typeof colors] ?? 'bg-gray-100 text-gray-700'
  const label = status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}
