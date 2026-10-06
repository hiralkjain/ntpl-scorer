import { Link } from "react-router-dom";
import type { Match, Team } from "../lib/types";

export default function Fixtures({
  matches,
  teams,
}: {
  matches: Match[];
  teams: Team[];
}) {
  const name = (id: string | null) =>
    teams.find((t) => t.id === id)?.name ?? "Top 2 / TBD";

  return (
    <div className="space-y-6 text-slate-900">
      <h1 className="text-3xl font-black text-slate-900">Fixtures</h1>

      <div className="space-y-4">
        {matches.map((m) => {
          const isScheduled =
            Boolean(m.team_a_id && m.team_b_id) && m.status === "scheduled";

          const isLive = m.status === "live";
          const isCompleted = m.status === "completed";

          return (
            <div
              key={m.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm"
            >
              {/* Match header */}
              <div className="flex justify-between text-sm text-slate-500">
                <span>
                  {m.match_type === "final"
                    ? "FINAL"
                    : `ROUND ${m.round_number}`}
                </span>

                <span>{m.turf ?? "Turf TBA"}</span>
              </div>

              {/* Teams */}
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center font-bold text-slate-900">
                <span>{name(m.team_a_id)}</span>

                <span className="text-xs font-semibold text-slate-400">VS</span>

                <span>{name(m.team_b_id)}</span>
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <span className="text-xs text-slate-500">
                  Match #{m.match_number} · {m.status.toUpperCase()}
                </span>

                <div className="flex gap-2">
                  {/* Completed */}
                  {isCompleted && (
                    <Link
                      to={`/live/${m.id}`}
                      className="rounded-lg bg-[#0B4D2B] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#166534]"
                    >
                      Scorecard
                    </Link>
                  )}

                  {/* Live */}
                  {isLive && (
                    <Link
                      to={`/scorer/${m.id}`}
                      className="rounded-lg bg-[#0B4D2B] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#166534]"
                    >
                      Continue Scoring
                    </Link>
                  )}

                  {/* Scheduled */}
                  {isScheduled && (
                    <Link
                      to={`/setup/${m.id}`}
                      className="rounded-lg bg-[#0B4D2B] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#166534]"
                    >
                      Match Setup
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
