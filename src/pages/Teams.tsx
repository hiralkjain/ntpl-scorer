import type { Team } from "../lib/types";

export default function Teams({ teams }: { teams: Team[] }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black text-slate-900">Teams</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <div key={t.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 font-black text-green-700">
              {t.short_name}
            </div>

            <h2 className="mt-4 font-bold">{t.name}</h2>

            <p className="mt-1 text-sm text-slate-500">13 registered players</p>
          </div>
        ))}
      </div>
    </div>
  );
}
