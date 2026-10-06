import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Match = {
  id: string;
  match_number: number;
  status: string;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_team_id: string | null;
  result_type: string | null;
  result_margin: number | null;
  result_margin_type: string | null;
  man_of_match_player_id: string | null;
  woman_of_match_player_id: string | null;
};

type Team = {
  id: string;
  name: string;
  short_name: string;
};

type Player = {
  id: string;
  name: string;
  team_id: string;
  gender?: string | null;
};

type Innings = {
  id: string;
  innings_number: number;
  batting_team_id: string;
  bowling_team_id: string;
  total_runs: number;
  wickets: number;
  legal_balls: number;
  overs_limit: number;
  target_runs: number | null;
  innings_status: string;
  status: string;
  striker_id: string | null;
  non_striker_id: string | null;
  current_bowler_id: string | null;
};

type Ball = {
  id: string;
  innings_id: string;
  over_number: number;
  ball_number: number;
  ball_sequence: number;

  striker_id: string | null;
  bowler_id: string | null;

  runs_batter: number;
  runs_extras: number;
  runs_total: number;

  batter_runs: number;
  extras_runs: number;
  total_runs: number;

  wides: number;
  no_balls: number;
  byes: number;
  leg_byes: number;
  penalty_runs: number;

  is_legal_delivery: boolean;
  legal_delivery: boolean;

  is_boundary: boolean;
  boundary_type: string | null;

  wicket: boolean;
  wicket_type: string | null;
  dismissed_player_id: string | null;
  fielder_id: string | null;

  special_event: string | null;
  score_adjustment: number;
};

type BattingStat = {
  playerId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissed: boolean;
  dismissal: string;
};

type BowlingStat = {
  playerId: string;
  balls: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
};

function oversText(balls: number) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function strikeRate(runs: number, balls: number) {
  if (balls === 0) return "0.00";
  return ((runs / balls) * 100).toFixed(2);
}

function economy(runs: number, balls: number) {
  if (balls === 0) return "0.00";

  const overs = balls / 6;
  return (runs / overs).toFixed(2);
}

function isBowlerWicket(wicketType: string | null) {
  if (!wicketType) return true;

  const excluded = [
    "run_out",
    "run out",
    "retired_hurt",
    "retired hurt",
    "obstructing",
    "obstructing_the_field",
    "timed_out",
    "timed out",
    "retired_out",
    "retired out",
  ];

  return !excluded.includes(wicketType.toLowerCase());
}

function formatDismissal(ball: Ball, players: Record<string, Player>) {
  const dismissed = ball.dismissed_player_id
    ? (players[ball.dismissed_player_id]?.name ?? "Batter")
    : "Batter";

  if (!ball.wicket) return "";

  switch (ball.wicket_type?.toLowerCase()) {
    case "bowled":
      return `b ${players[ball.bowler_id ?? ""]?.name ?? "Bowler"}`;

    case "lbw":
      return `lbw b ${players[ball.bowler_id ?? ""]?.name ?? "Bowler"}`;

    case "caught":
    case "caught_behind":
      return `c ${players[ball.fielder_id ?? ""]?.name ?? "Fielder"} b ${
        players[ball.bowler_id ?? ""]?.name ?? "Bowler"
      }`;

    case "stumped":
      return `st ${players[ball.fielder_id ?? ""]?.name ?? "Wicketkeeper"} b ${
        players[ball.bowler_id ?? ""]?.name ?? "Bowler"
      }`;

    case "run_out":
    case "run out":
      return `run out (${players[ball.fielder_id ?? ""]?.name ?? "Fielder"})`;

    case "hit_wicket":
    case "hit wicket":
      return "hit wicket";

    case "retired_hurt":
      return "retired hurt";

    default:
      return ball.wicket_type
        ? ball.wicket_type.replaceAll("_", " ")
        : `${dismissed} out`;
  }
}

export default function LiveMatch() {
  const { matchId } = useParams();

  const [match, setMatch] = useState<Match | null>(null);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [innings, setInnings] = useState<Innings[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!matchId) return;

    let mounted = true;

    async function load() {
      try {
        setError("");

        const { data: matchData, error: matchError } = await supabase
          .from("matches")
          .select("*")
          .eq("id", matchId)
          .single();

        if (matchError) throw matchError;

        const { data: inningsData, error: inningsError } = await supabase
          .from("innings")
          .select("*")
          .eq("match_id", matchId)
          .order("innings_number");

        if (inningsError) throw inningsError;

        const inningsRows = (inningsData ?? []) as Innings[];

        const teamIds = [
          matchData.team_a_id,
          matchData.team_b_id,
          ...inningsRows.flatMap((i) => [i.batting_team_id, i.bowling_team_id]),
        ].filter(Boolean) as string[];

        const uniqueTeamIds = [...new Set(teamIds)];

        const { data: teamData, error: teamError } =
          uniqueTeamIds.length > 0
            ? await supabase
                .from("teams")
                .select("id,name,short_name")
                .in("id", uniqueTeamIds)
            : { data: [], error: null };

        if (teamError) throw teamError;

        const teamMap: Record<string, Team> = {};

        (teamData ?? []).forEach((team) => {
          teamMap[team.id] = team as Team;
        });

        const { data: squadData, error: squadError } = await supabase
          .from("match_squads")
          .select("player_id,team_id")
          .eq("match_id", matchId)
          .eq("is_playing", true);

        if (squadError) throw squadError;

        const playerIds = [
          ...new Set(
            (squadData ?? []).map((row) => row.player_id).filter(Boolean),
          ),
        ];

        let playerMap: Record<string, Player> = {};

        if (playerIds.length > 0) {
          const { data: playerData, error: playerError } = await supabase
            .from("players")
            .select("id,name,team_id,gender")
            .in("id", playerIds);

          if (playerError) throw playerError;

          (playerData ?? []).forEach((player) => {
            playerMap[player.id] = player as Player;
          });
        }

        let ballRows: Ball[] = [];

        if (inningsRows.length > 0) {
          const inningsIds = inningsRows.map((i) => i.id);

          const { data: ballData, error: ballError } = await supabase
            .from("balls")
            .select("*")
            .in("innings_id", inningsIds)
            .order("ball_sequence");

          if (ballError) throw ballError;

          ballRows = (ballData ?? []) as Ball[];
        }

        if (!mounted) return;

        setMatch(matchData as Match);
        setInnings(inningsRows);
        setBalls(ballRows);
        setTeams(teamMap);
        setPlayers(playerMap);
      } catch (e) {
        if (!mounted) return;

        setError(e instanceof Error ? e.message : "Failed to load scorecard.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    const channel = supabase
      .channel(`scorecard-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "innings",
          filter: `match_id=eq.${matchId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "balls",
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [matchId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        Loading scorecard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error}
      </div>
    );
  }

  if (!match) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        Match not found.
      </div>
    );
  }

  const currentInnings =
    innings.find((i) => i.innings_status === "live") ??
    innings[innings.length - 1];

  const firstInnings = innings.find((i) => i.innings_number === 1);

  const battingTeam = currentInnings
    ? teams[currentInnings.batting_team_id]
    : null;

  const bowlingTeam = currentInnings
    ? teams[currentInnings.bowling_team_id]
    : null;

  const striker = currentInnings?.striker_id
    ? players[currentInnings.striker_id]
    : null;

  const nonStriker = currentInnings?.non_striker_id
    ? players[currentInnings.non_striker_id]
    : null;

  const bowler = currentInnings?.current_bowler_id
    ? players[currentInnings.current_bowler_id]
    : null;

  const target =
    currentInnings?.innings_number === 2
      ? (currentInnings.target_runs ?? (firstInnings?.total_runs ?? 0) + 1)
      : null;

  const requiredRuns =
    target !== null
      ? Math.max(target - (currentInnings?.total_runs ?? 0), 0)
      : null;

  function getBattingStats(inning: Innings): BattingStat[] {
    const map: Record<string, BattingStat> = {};

    const inningBalls = balls
      .filter((b) => b.innings_id === inning.id)
      .sort((a, b) => a.ball_sequence - b.ball_sequence);

    inningBalls.forEach((ball) => {
      if (!ball.striker_id) return;

      if (!map[ball.striker_id]) {
        map[ball.striker_id] = {
          playerId: ball.striker_id,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          dismissed: false,
          dismissal: "",
        };
      }

      const stat = map[ball.striker_id];

      stat.runs += ball.runs_batter ?? ball.batter_runs ?? 0;

      const legalForBatting =
        ball.is_legal_delivery && ball.wides === 0 && ball.no_balls === 0;

      if (legalForBatting) {
        stat.balls += 1;
      }

      if (
        ball.is_boundary &&
        (ball.runs_batter ?? ball.batter_runs ?? 0) === 4
      ) {
        stat.fours += 1;
      }

      if (
        ball.is_boundary &&
        (ball.runs_batter ?? ball.batter_runs ?? 0) === 6
      ) {
        stat.sixes += 1;
      }

      if (ball.wicket && ball.dismissed_player_id === ball.striker_id) {
        stat.dismissed = true;
        stat.dismissal = formatDismissal(ball, players);
      }
    });

    return Object.values(map).sort((a, b) => {
      if (a.dismissed !== b.dismissed) {
        return a.dismissed ? -1 : 1;
      }

      return b.runs - a.runs;
    });
  }

  function getBowlingStats(inning: Innings): BowlingStat[] {
    const map: Record<string, BowlingStat> = {};

    const inningBalls = balls.filter((b) => b.innings_id === inning.id);

    inningBalls.forEach((ball) => {
      if (!ball.bowler_id) return;

      if (!map[ball.bowler_id]) {
        map[ball.bowler_id] = {
          playerId: ball.bowler_id,
          balls: 0,
          runs: 0,
          wickets: 0,
          wides: 0,
          noBalls: 0,
        };
      }

      const stat = map[ball.bowler_id];

      if (ball.is_legal_delivery) {
        stat.balls += 1;
      }

      const totalRuns = ball.runs_total ?? ball.total_runs ?? 0;

      const byes = ball.byes ?? 0;
      const legByes = ball.leg_byes ?? 0;
      const penalty = ball.penalty_runs ?? 0;

      stat.runs += Math.max(totalRuns - byes - legByes - penalty, 0);

      stat.wides += ball.wides ?? 0;
      stat.noBalls += ball.no_balls ?? 0;

      if (ball.wicket && isBowlerWicket(ball.wicket_type)) {
        stat.wickets += 1;
      }
    });

    return Object.values(map).sort((a, b) => {
      if (a.wickets !== b.wickets) {
        return b.wickets - a.wickets;
      }

      return b.balls - a.balls;
    });
  }

  function getExtras(inning: Innings) {
    const inningBalls = balls.filter((b) => b.innings_id === inning.id);

    return {
      wides: inningBalls.reduce((sum, b) => sum + (b.wides ?? 0), 0),
      noBalls: inningBalls.reduce((sum, b) => sum + (b.no_balls ?? 0), 0),
      byes: inningBalls.reduce((sum, b) => sum + (b.byes ?? 0), 0),
      legByes: inningBalls.reduce((sum, b) => sum + (b.leg_byes ?? 0), 0),
      penalty: inningBalls.reduce((sum, b) => sum + (b.penalty_runs ?? 0), 0),
      adjustments: inningBalls.reduce(
        (sum, b) => sum + (b.score_adjustment ?? 0),
        0,
      ),
    };
  }

  function getFallOfWickets(inning: Innings) {
    const inningBalls = balls
      .filter(
        (b) => b.innings_id === inning.id && b.wicket && b.dismissed_player_id,
      )
      .sort((a, b) => a.ball_sequence - b.ball_sequence);

    let wickets = 0;

    return inningBalls.map((ball) => {
      wickets += 1;

      return {
        wicket: wickets,
        score: getScoreAtBall(inning, ball.ball_sequence),
        player: players[ball.dismissed_player_id ?? ""]?.name ?? "Batter",
        dismissal: formatDismissal(ball, players),
      };
    });
  }

  function getScoreAtBall(inning: Innings, sequence: number) {
    return balls
      .filter((b) => b.innings_id === inning.id && b.ball_sequence <= sequence)
      .reduce(
        (sum, b) =>
          sum + (b.runs_total ?? b.total_runs ?? 0) + (b.score_adjustment ?? 0),
        0,
      );
  }

  function getRecentBalls(inning: Innings) {
    return balls
      .filter((b) => b.innings_id === inning.id)
      .sort((a, b) => b.ball_sequence - a.ball_sequence)
      .slice(0, 12)
      .reverse();
  }

  function ballLabel(ball: Ball) {
    if (ball.wicket) return "W";

    if (ball.special_event === "female_wide") {
      return "2W";
    }

    if (ball.special_event === "female_no_ball") {
      return "2NB";
    }

    if (ball.special_event === "female_protected_wicket") {
      return "−2";
    }

    if ((ball.wides ?? 0) > 0) {
      return `${ball.wides}W`;
    }

    if ((ball.no_balls ?? 0) > 0) {
      return `${ball.no_balls}NB`;
    }

    return String(ball.runs_batter ?? ball.batter_runs ?? ball.runs_total ?? 0);
  }

  function resultText() {
    if (match?.status !== "completed") {
      return null;
    }

    if (match?.result_type === "no_result") {
      return "No Result";
    }

    if (match?.result_type === "tie") {
      return "Match tied";
    }

    const winner = match?.winner_team_id ? teams[match.winner_team_id] : null;

    if (!winner) return "Match completed";

    if (match?.result_margin_type === "wickets") {
      return `${winner.name} won by ${match.result_margin ?? 0} wickets`;
    }

    if (match?.result_margin_type === "runs") {
      return `${winner.name} won by ${match.result_margin ?? 0} runs`;
    }

    return `${winner.name} won`;
  }

  function ScorecardInnings({ inning }: { inning: Innings }) {
    const team = teams[inning.batting_team_id];
    const bowling = teams[inning.bowling_team_id];

    const batting = getBattingStats(inning);
    const bowlingStats = getBowlingStats(inning);
    const extras = getExtras(inning);
    const fallOfWickets = getFallOfWickets(inning);

    const playingBatters = Object.values(players)
      .filter((p) => p.team_id === inning.batting_team_id)
      .filter((p) => batting.some((b) => b.playerId === p.id));

    const battingIds = new Set(batting.map((b) => b.playerId));

    const orderedBatting = [
      ...batting,
      ...playingBatters
        .filter((p) => !battingIds.has(p.id))
        .map((p) => ({
          playerId: p.id,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          dismissed: false,
          dismissal: "Did not bat",
        })),
    ];

    return (
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-[#0B4D2B] p-5 text-white">
          <div className="text-sm font-semibold text-green-100">
            Innings {inning.innings_number}
          </div>

          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">{team?.name ?? "Team"}</h2>

              <p className="mt-1 text-sm text-green-100">
                vs {bowling?.name ?? "Team"}
              </p>
            </div>

            <div className="text-right">
              <div className="text-3xl font-black">
                {inning.total_runs}/{inning.wickets}
              </div>

              <div className="text-sm text-green-100">
                {oversText(inning.legal_balls)} overs
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-[#0B4D2B] text-xs uppercase text-white">
              <tr>
                <th className="px-4 py-3 text-left">Batter</th>
                <th className="px-3 py-3 text-left">Dismissal</th>
                <th className="px-3 py-3 text-right">R</th>
                <th className="px-3 py-3 text-right">B</th>
                <th className="px-3 py-3 text-right">4s</th>
                <th className="px-3 py-3 text-right">6s</th>
                <th className="px-4 py-3 text-right">SR</th>
              </tr>
            </thead>

            <tbody className="divide-y text-slate-900">
              {orderedBatting.map((stat) => {
                const player = players[stat.playerId];

                return (
                  <tr key={stat.playerId}>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {player?.name ?? "Player"}
                    </td>

                    <td className="max-w-[260px] px-3 py-3 text-xs text-slate-500">
                      {stat.dismissal || "not out"}
                    </td>

                    <td className="px-3 py-3 text-right font-black text-slate-900">
                      {stat.runs}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-900">
                      {stat.balls}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-900">
                      {stat.fours}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-900">
                      {stat.sixes}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-900">
                      {strikeRate(stat.runs, stat.balls)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t bg-green-50 p-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span>
              <strong>Extras:</strong>{" "}
              {extras.wides +
                extras.noBalls +
                extras.byes +
                extras.legByes +
                extras.penalty}
            </span>

            {extras.wides > 0 && <span>W {extras.wides}</span>}
            {extras.noBalls > 0 && <span>NB {extras.noBalls}</span>}
            {extras.byes > 0 && <span>B {extras.byes}</span>}
            {extras.legByes > 0 && <span>LB {extras.legByes}</span>}
            {extras.penalty > 0 && <span>P {extras.penalty}</span>}

            {extras.adjustments !== 0 && (
              <span>
                Special adjustment{" "}
                {extras.adjustments > 0
                  ? `+${extras.adjustments}`
                  : extras.adjustments}
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border-t border-slate-200 bg-white">
          <div className="p-5 pb-3">
            <h3 className="text-lg font-black text-slate-900">Bowling</h3>
          </div>

          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-[#0B4D2B] text-xs uppercase text-white">
              <tr>
                <th className="px-4 py-3 text-left">Bowler</th>
                <th className="px-3 py-3 text-right">O</th>
                <th className="px-3 py-3 text-right">R</th>
                <th className="px-3 py-3 text-right">W</th>
                <th className="px-3 py-3 text-right">WD</th>
                <th className="px-3 py-3 text-right">NB</th>
                <th className="px-4 py-3 text-right">ECO</th>
              </tr>
            </thead>

            <tbody className="divide-y text-slate-900">
              {bowlingStats.map((stat) => {
                const player = players[stat.playerId];

                return (
                  <tr key={stat.playerId}>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {player?.name ?? "Bowler"}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-900">
                      {oversText(stat.balls)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-900">
                      {stat.runs}
                    </td>

                    <td className="px-3 py-3 text-right font-black text-slate-900">
                      {stat.wickets}
                    </td>

                    <td className="px-3 py-3 text-right">{stat.wides}</td>

                    <td className="px-3 py-3 text-right">{stat.noBalls}</td>

                    <td className="px-4 py-3 text-right text-slate-900">
                      {economy(stat.runs, stat.balls)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {fallOfWickets.length > 0 && (
          <div className="border-t p-5">
            <h3 className="text-lg font-black text-slate-900">
              Fall of Wickets
            </h3>

            <div className="mt-3 flex flex-wrap gap-2">
              {fallOfWickets.map((item) => (
                <div
                  key={`${item.wicket}-${item.player}`}
                  className="rounded-xl bg-green-50 px-3 py-2 text-xs"
                >
                  <span className="font-black">
                    {item.wicket}-{item.score}
                  </span>{" "}
                  {item.player}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const recentBalls = currentInnings ? getRecentBalls(currentInnings) : [];

  const isCompleted = match.status === "completed";

  return (
    <div className="min-h-screen space-y-6 rounded-3xl bg-slate-50 p-4 md:p-6">
      <div>
        <p
          className={`text-sm font-bold ${
            isCompleted ? "text-slate-500" : "text-red-600"
          }`}
        >
          {isCompleted ? "● COMPLETED" : "● LIVE"}
        </p>

        <h1 className="mt-1 text-3xl font-black">
          Match #{match.match_number}
        </h1>

        {resultText() && (
          <p className="mt-2 font-bold text-slate-600">{resultText()}</p>
        )}
      </div>

      {!isCompleted && (
        <>
          <div className="overflow-hidden rounded-3xl bg-[#0B4D2B] text-white shadow-lg">
            <div className="p-6 text-center">
              <div className="text-sm font-semibold text-green-100">
                {battingTeam?.name ?? "Batting Team"}
              </div>

              <div className="mt-2 text-5xl font-black">
                {currentInnings?.total_runs ?? 0}/{currentInnings?.wickets ?? 0}
              </div>

              <div className="mt-2 text-lg text-green-100">
                {oversText(currentInnings?.legal_balls ?? 0)} /{" "}
                {currentInnings?.overs_limit ?? 7} overs
              </div>

              {target !== null && (
                <div className="mt-4 rounded-xl bg-white/10 p-3">
                  <div className="text-sm text-green-100">Target</div>

                  <div className="text-xl font-bold">{target}</div>

                  <div className="mt-1 text-sm text-green-100">
                    {requiredRuns === 0
                      ? "Target reached"
                      : `${requiredRuns} runs required`}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 border-t border-white/10">
              <div className="p-4 text-center">
                <div className="text-xs text-green-200">Batting</div>

                <div className="mt-1 font-bold">
                  {battingTeam?.short_name ?? "—"}
                </div>
              </div>

              <div className="border-l border-white/10 p-4 text-center">
                <div className="text-xs text-green-200">Bowling</div>

                <div className="mt-1 font-bold">
                  {bowlingTeam?.short_name ?? "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">
              Current Batters
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-green-50 p-4 text-slate-900">
                <div className="text-xs text-slate-500">Striker</div>

                <div className="mt-1 font-bold text-slate-900">
                  {striker?.name ?? "—"} *
                </div>
              </div>

              <div className="rounded-xl bg-green-50 p-4 text-slate-900">
                <div className="text-xs text-slate-500">Non-striker</div>

                <div className="mt-1 font-bold text-slate-900">
                  {nonStriker?.name ?? "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
            <div className="text-xs text-slate-500">Current Bowler</div>

            <div className="mt-1 text-lg font-black text-slate-900">
              {bowler?.name ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">
                Recent Balls
              </h2>

              <span className="text-sm text-slate-500">
                {oversText(currentInnings?.legal_balls ?? 0)} overs
              </span>
            </div>

            {recentBalls.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No balls recorded yet.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {recentBalls.map((ball) => (
                  <div
                    key={ball.id}
                    className={`flex h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-sm font-bold ${
                      ball.wicket
                        ? "border-red-200 bg-red-50 text-red-600"
                        : ball.runs_batter >= 4
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-green-100 bg-green-50 text-[#0B4D2B]"
                    }`}
                  >
                    {ballLabel(ball)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isCompleted && (
        <div className="overflow-hidden rounded-3xl bg-[#0B4D2B] p-6 text-center text-white shadow-lg">
          <div className="text-sm text-green-200">MATCH RESULT</div>

          <div className="mt-2 text-2xl font-black">{resultText()}</div>

          <div className="mx-auto mt-5 grid max-w-xl grid-cols-2 gap-3">
            {innings.map((inning) => {
              const team = teams[inning.batting_team_id];

              return (
                <div key={inning.id} className="rounded-xl bg-white/10 p-4">
                  <div className="text-xs text-green-200">
                    {team?.short_name}
                  </div>

                  <div className="mt-1 text-2xl font-black">
                    {inning.total_runs}/{inning.wickets}
                  </div>

                  <div className="text-xs text-green-200">
                    {oversText(inning.legal_balls)} overs
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {innings.map((inning) => (
          <ScorecardInnings key={inning.id} inning={inning} />
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-900">Match Awards</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-green-50 p-5 text-slate-900">
            <div className="text-xs font-bold uppercase text-[#0B4D2B]">
              Man of the Match
            </div>

            <div className="mt-2 text-lg font-black text-slate-900">
              {match.man_of_match_player_id
                ? (players[match.man_of_match_player_id]?.name ?? "Player")
                : "Not selected yet"}
            </div>
          </div>

          <div className="rounded-2xl bg-green-50 p-5 text-slate-900">
            <div className="text-xs font-bold uppercase text-[#0B4D2B]">
              Woman of the Match
            </div>

            <div className="mt-2 text-lg font-black text-slate-900">
              {match.woman_of_match_player_id
                ? (players[match.woman_of_match_player_id]?.name ?? "Player")
                : "Not selected yet"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
