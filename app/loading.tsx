export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
      {/* Welcome Header skeleton */}
      <div className="bg-procare-dark-blue rounded-2xl p-8 relative overflow-hidden">
        <div className="relative z-10">
          <div className="h-8 w-64 bg-blue-800 rounded mb-2" />
        </div>
        <div className="absolute right-8 top-4 w-32 h-32 rounded-full bg-procare-bright-blue opacity-20" />
      </div>

      {/* Stats Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 w-28 bg-gray-200 rounded mb-2" />
                <div className="h-9 w-16 bg-gray-200 rounded" />
              </div>
              <div className="w-12 h-12 rounded-full bg-gray-200" />
            </div>
          </div>
        ))}
      </div>

      {/* Upcoming Conferences skeleton */}
      <div className="card">
        <div className="h-6 w-48 bg-gray-200 rounded mb-5" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-100">
              <div className="h-5 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-32 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Recent + Priority skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="h-6 w-24 bg-gray-200 rounded mb-5" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 rounded-lg border border-gray-100">
                <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-36 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="h-6 w-32 bg-gray-200 rounded mb-5" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
