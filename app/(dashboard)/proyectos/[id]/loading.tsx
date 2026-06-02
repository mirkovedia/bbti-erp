export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 bg-slate-800 rounded animate-pulse" />
      <div className="h-10 w-full max-w-md bg-slate-800/60 rounded animate-pulse" />
      <div className="h-64 bg-slate-800/50 rounded-xl animate-pulse" />
    </div>
  );
}
