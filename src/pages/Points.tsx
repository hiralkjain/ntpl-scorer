import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Team, Match } from "../lib/types";

type Innings = {
  match_id: string;
  batting_team_id: string;
  total_runs: number;
  wickets: number;
  legal_balls: number;
  overs_limit: number;
};

type Standing = {
  team: Team;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  runsScored: number;
  ballsFaced: number;
  runsConceded: number;
  ballsBowled: number;
  nrr: number;
};

export default function Points({
  teams,
  matches,
}: {
  teams: Team[];
  matches: Match[];
}) {
  const [innings, setInnings] = useState<Innings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadInnings() {
      setLoading(true);
      setError("");

      const completedLeagueMatches = matches.filter(
        (match) =>
          match.match_type === "league" &&
          match.status === "completed"
      );

      if (completedLeagueMatches.length === 0) {
        if (active) {
          setInnings([]);
          setLoading(false);
        }
        return;
      }

      const matchIds = completedLeagueMatches.map((match) => match.id);

      const { data, error } = await supabase
        .from("innings")
        .select(
          "match_id, batting_team_id, total_runs, wickets, legal_balls, overs_limit"
        )
        .in("match_id", matchIds);

      if (!active) return;

      if (error) {
        setError(error.message);
        setInnings([]);
      } else {
        setInnings((data ?? []) as Innings[]);
      }

      setLoading(false);
    }

    void loadInnings();

    return () => {
      active = false;
    };
  }, [matches]);

  const completedMatches = matches.filter(
    (match) =>
      match.match_type === "league" &&
      match.status === "completed" &&
      match.team_a_id &&
      match.team_b_id
  );

  const standings: Standing[] = teams.map((team) => ({
    team,
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    points: 0,
    runsScored: 0,
    ballsFaced: 0,
    runsConceded: 0,
    ballsBowled: 0,
    nrr: 0,
  }));

  const standingById = new Map(
    standings.map((standing) => [standing.team.id, standing])
  );

  for (const match of completedMatches) {
    const teamA = match.team_a_id!;
    const teamB = match.team_b_id!;

    const a = standingById.get(teamA);
    const b = standingById.get(teamB);
    if (!a || !b) continue;

    a.played++;
    b.played++;

    if (match.winner_team_id === teamA) {
      a.won++;
      a.points += 2;
      b.lost++;
    } else if (match.winner_team_id === teamB) {
      b.won++;
      b.points += 2;
      a.lost++;
    } else {
      a.tied++;
      b.tied++;
      a.points++;
      b.points++;
    }
  }

  for (const match of completedMatches) {
    const matchInnings = innings.filter(
      (inning) => inning.match_id === match.id
    );

    for (const inning of matchInnings) {
      const batting = standingById.get(inning.batting_team_id);
      const bowlingTeamId =
        inning.batting_team_id === match.team_a_id
          ? match.team_b_id
          : match.team_a_id;
      const bowling = bowlingTeamId
        ? standingById.get(bowlingTeamId)
        : undefined;

      if (!batting || !bowling) continue;

      const runs = Number(inning.total_runs) || 0;
      const legalBalls = Number(inning.legal_balls) || 0;
      const wickets = Number(inning.wickets) || 0;
      const oversLimit = Number(inning.overs_limit) || 7;

      // With 9 players, 8 wickets means the team is all out.
      const ballsForNRR =
        wickets >= 8 ? oversLimit * 6 : legalBalls;

      batting.runsScored += runs;
      batting.ballsFaced += ballsForNRR;

      bowling.runsConceded += runs;
      bowling.ballsBowled += ballsForNRR;
    }
  }

  for (const standing of standings) {
    const oversFaced = standing.ballsFaced / 6;
    const oversBowled = standing.ballsBowled / 6;

    standing.nrr =
      oversFaced > 0 && oversBowled > 0
        ? standing.runsScored / oversFaced -
          standing.runsConceded / oversBowled
        : 0;
  }

  standings.sort(
    (a, b) =>
      b.points - a.points ||
      b.nrr - a.nrr ||
      a.team.name.localeCompare(b.team.name)
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Points Table</h1>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load innings: {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Calculating standings...</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-950 text-white">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3 text-center">P</th>
                  <th className="px-4 py-3 text-center">W</th>
                  <th className="px-4 py-3 text-center">L</th>
                  <th className="px-4 py-3 text-center">T</th>
                  <th className="px-4 py-3 text-center">Pts</th>
                  <th className="px-4 py-3 text-center">NRR</th>
                </tr>
              </thead>

              <tbody>
                {standings.map((standing, index) => (
                  <tr
                    key={standing.team.id}
                    className={`border-t ${
                      index < 2 ? "bg-green-50" : ""
                    }`}
                  >
                    <td className="px-4 py-4 font-bold">
                      {index + 1}
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {standing.team.name}
                      {index < 2 && (
                        <span className="ml-2 text-xs font-medium text-green-700">
                          Final
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {standing.played}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {standing.won}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {standing.lost}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {standing.tied}
                    </td>
                    <td className="px-4 py-4 text-center font-bold">
                      {standing.points}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {standing.nrr.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-slate-500">
            P: Played · W: Won · L: Lost · T: Tie · Pts: Points · NRR: Net Run Rate
          </p>
          <p className="text-sm text-slate-500">
            Wins earn 2 points. Unresolved ties and no-result matches earn
            1 point per team. The top two teams are highlighted.
          </p>
        </>
      )}
    </div>
  );
}
