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
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Fixtures</h1>

      <div className="space-y-4">
        {matches.map((m) => {
          const isScheduled =
            Boolean(m.team_a_id && m.team_b_id) && m.status === "scheduled";

          const isLive = m.status === "live";
          const isCompleted = m.status === "completed";

          return (
            <div
              key={m.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex justify-between text-sm text-slate-500">
                <span>
                  {m.match_type === "final"
                    ? "FINAL"
                    : `ROUND ${m.round_number}`}
                </span>

                <span>{m.turf ?? "Turf TBA"}</span>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center font-bold">
                <span>{name(m.team_a_id)}</span>
                <span className="text-xs text-slate-400">VS</span>
                <span>{name(m.team_b_id)}</span>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                <span className="text-xs text-slate-500">
                  Match #{m.match_number} · {m.status.toUpperCase()}
                </span>

                <div className="flex gap-2">
                  {isCompleted && (
                    <Link
                      to={`/live/${m.id}`}
                      className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                    >
                      Scorecard
                    </Link>
                  )}

                  {isLive && (
                    <Link
                      to={`/scorer/${m.id}`}
                      className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white"
                    >
                      Continue Scoring
                    </Link>
                  )}

                  {isScheduled && (
                    <Link
                      to={`/setup/${m.id}`}
                      className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
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
