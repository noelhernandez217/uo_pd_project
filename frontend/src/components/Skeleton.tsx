function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />
}

export function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <SkeletonBlock className="h-6 w-48" />
        <SkeletonBlock className="h-4 w-64" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-7 w-12" />
          </div>
        ))}
      </div>

      {/* Queue header */}
      <div className="space-y-2">
        <SkeletonBlock className="h-5 w-32" />
        <SkeletonBlock className="h-8 w-full" />
      </div>

      {/* Queue cards */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-4 w-16" />
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-4 w-24 ml-auto" />
          </div>
          <SkeletonBlock className="h-3 w-48" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-6 w-20" />
            <SkeletonBlock className="h-6 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function IncidentLogSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <SkeletonBlock className="h-6 w-36" />
        <SkeletonBlock className="h-4 w-56" />
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
        <SkeletonBlock className="h-9 flex-1" />
        <SkeletonBlock className="h-9 w-32" />
        <SkeletonBlock className="h-9 w-32" />
        <SkeletonBlock className="h-9 w-48" />
      </div>

      {/* Month groups */}
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 flex items-center gap-3">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
