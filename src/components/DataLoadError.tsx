export default function DataLoadError({ message }: { message?: string }) {
  return (
    <div className="p-6 text-center">
      <p className="text-rose-400 mb-2">{message || 'No data available'}</p>
      <p className="text-sm text-slate-500">
        We couldn&apos;t load player ratings. Please try again in a moment. Data is
        usually refreshed Tuesday morning and Friday evening.
      </p>
    </div>
  )
}
