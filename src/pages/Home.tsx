import { Link } from "react-router-dom";
import type { Tournament, Team, Match } from "../lib/types";

export default function Home({
  tournament,
  teams,
  matches,
}: {
  tournament: Tournament;
  teams: Team[];
  matches: Match[];
}) {
  const live = matches.filter((m) => m.status === "live");
  const next = matches.find((m) => m.status === "scheduled");

  const name = (id: string | null) =>
    teams.find((t) => t.id === id)?.name ?? "TBD";

  return (
    <div className="space-y-6 text-slate-900">
      {/* Hero */}
      <section className="rounded-3xl bg-[#0B4D2B] p-6 text-white md:p-10">
        <p className="text-sm text-green-100">CRICKET TOURNAMENT</p>

        <h1 className="mt-2 text-3xl font-black md:text-5xl">
          NTPL Bangalore 2026
        </h1>

        <p className="mt-4 max-w-2xl text-green-100">
          Ball-by-ball live scores, fixtures, points table and player
          statistics.
        </p>

        <div className="mt-6 flex gap-3">
          <Link
            to="/live"
            className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#0B4D2B] hover:bg-green-50"
          >
            View live
          </Link>

          <Link
            to="/fixtures"
            className="rounded-xl border border-white/30 px-4 py-3 text-sm font-bold text-white hover:bg-white/10"
          >
            Fixtures
          </Link>
        </div>
      </section>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Teams", teams.length],
          ["League matches", 10],
          ["Finalists", 2],
          ["Live now", live.length],
        ].map(([l, v]) => (
          <div
            key={String(l)}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm"
          >
            <div className="text-sm text-slate-500">{l}</div>
            <div className="mt-2 text-3xl font-black text-slate-900">{v}</div>
          </div>
        ))}
      </div>

      {/* Next Match */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
        <h2 className="font-bold text-slate-900">Next scheduled match</h2>

        <p className="mt-3 text-lg font-semibold text-slate-900">
          {next
            ? `${name(next.team_a_id)} vs ${name(next.team_b_id)}`
            : "No scheduled match"}
        </p>

        <p className="mt-1 text-sm text-slate-500">{next?.turf ?? ""}</p>
      </div>
    </div>
  );
}
