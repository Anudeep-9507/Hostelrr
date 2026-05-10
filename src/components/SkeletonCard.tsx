/**
 * Reusable shimmer card placeholder matching Hostelrr card shapes.
 * Usage: <SkeletonCard /> or <SkeletonCard count={3} />
 */
export default function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm animate-pulse flex flex-col gap-4"
        >
          {/* Avatar + Name */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-100 rounded-lg w-3/4" />
              <div className="h-3 bg-gray-100 rounded-lg w-1/2" />
            </div>
          </div>

          {/* Details rows */}
          <div className="space-y-2 border-b border-gray-100 pb-4 pt-2">
            <div className="h-3 bg-gray-100 rounded-lg w-2/3" />
            <div className="h-3 bg-gray-100 rounded-lg w-1/3" />
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-between pt-1">
            <div className="h-4 bg-gray-100 rounded-lg w-20" />
            <div className="h-6 bg-gray-100 rounded-full w-16" />
          </div>
        </div>
      ))}
    </>
  );
}
