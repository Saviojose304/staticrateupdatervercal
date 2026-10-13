// Shown instantly on slow connections while the server fetches the latest rate.
export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-md animate-pulse rounded-3xl bg-white p-8 shadow-[0_8px_30px_rgb(15_23_42/0.08)] ring-1 ring-slate-200"
        role="status"
        aria-label="Loading the latest rate"
      >
        <div className="mx-auto h-4 w-32 rounded bg-slate-200" />
        <div className="mx-auto mt-3 h-3 w-40 rounded bg-emerald-100" />
        <div className="mx-auto mt-8 h-14 w-56 rounded-lg bg-slate-200" />
        <div className="mx-auto mt-5 h-6 w-36 rounded-full bg-emerald-50" />
        <div className="mt-8 h-24 rounded-2xl bg-slate-100" />
        <div className="mt-6 h-12 rounded-2xl bg-emerald-100" />
        <span className="sr-only">Loading the latest rate…</span>
      </div>
    </main>
  );
}
