/**
 * Reusable shimmer row placeholder for list/table views.
 * Usage: <SkeletonTable rows={5} />
 */
export default function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-5 flex items-center gap-4 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-100 rounded-lg w-1/3" />
            <div className="h-3 bg-gray-100 rounded-lg w-1/4" />
          </div>
          <div className="h-4 bg-gray-100 rounded-lg w-20" />
          <div className="h-6 bg-gray-100 rounded-full w-16" />
        </div>
      ))}
    </div>
  );
}
