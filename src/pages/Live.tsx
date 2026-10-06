import { Link } from "react-router-dom";
import type { Match, Team } from "../lib/types";

export default function Live({
  matches,
  teams,
}: {
  matches: Match[];
  teams: Team[];
}) {
  const live = matches.filter((m) => m.status === "live");

  const name = (id: string | null) =>
    teams.find((t) => t.id === id)?.short_name ?? "TBD";

  return (
    <div className="min-h-screen space-y-6 rounded-3xl bg-slate-50 p-4 md:p-6">
      {/* PAGE HEADER */}

      <div>
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#0B4D2B]">
          Tournament
        </div>

        <h1 className="mt-1 text-3xl font-black text-slate-900">
          Live Matches
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Follow matches currently being scored live.
        </p>
      </div>

      {/* NO LIVE MATCH */}

      {live.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl text-[#0B4D2B]">
            ●
          </div>

          <div className="mt-4 font-black text-slate-900">
            No live match right now
          </div>

          <p className="mt-2 text-sm text-slate-500">
            A match will appear here as soon as the scorer starts it.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {live.map((m) => (
            <Link
              key={m.id}
              to={`/live/${m.id}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-[#0B4D2B] hover:shadow-lg"
            >
              {/* LIVE HEADER */}

              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-black text-[#0B4D2B]">
                  <span className="animate-pulse text-green-600">●</span>
                  LIVE
                </span>

                <span className="text-xs font-semibold text-slate-400">
                  Match #{m.match_number}
                </span>
              </div>

              {/* TEAMS */}

              <div className="mt-6 rounded-2xl bg-slate-50 p-5 transition group-hover:bg-green-50/50">
                <div className="flex items-center justify-center gap-4 text-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-2xl font-black text-slate-900">
                      {name(m.team_a_id)}
                    </div>

                    <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Team A
                    </div>
                  </div>

                  <div className="shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-black text-slate-400 shadow-sm">
                      VS
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-2xl font-black text-slate-900">
                      {name(m.team_b_id)}
                    </div>

                    <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Team B
                    </div>
                  </div>
                </div>
              </div>

              {/* WATCH */}

              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">
                  Match in progress
                </span>

                <span className="font-black text-[#0B4D2B] transition group-hover:translate-x-1">
                  View Live →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
