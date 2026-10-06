import { supabase } from "./supabase";

type Player = {
  id: string;
  team_id: string;
  name: string;
  gender: string;
};

type Innings = {
  id: string;
  match_id: string;
  innings_number: number;
  batting_team_id: string;
  bowling_team_id: string;
  total_runs: number;
  wickets: number;
  legal_balls: number;
};

type Ball = {
  id: string;
  innings_id: string;
  striker_id: string;
  bowler_id: string;

  runs_batter: number;
  runs_extras: number;
  runs_total: number;

  wides: number;
  no_balls: number;
  byes: number;
  leg_byes: number;
  penalty_runs: number;

  is_legal_delivery: boolean;

  wicket: boolean;
  wicket_type: string | null;
  dismissed_player_id: string | null;
  fielder_id: string | null;

  special_event: string | null;
  score_adjustment: number;
};

type PlayerImpact = {
  playerId: string;
  playerName: string;
  gender: string;
  teamId: string;

  battingImpact: number;
  bowlingImpact: number;
  fieldingImpact: number;
  winningBonus: number;

  totalImpact: number;

  runs: number;
  ballsFaced: number;
  wickets: number;
  ballsBowled: number;
  runsConceded: number;

  catches: number;
  runOuts: number;
  stumpings: number;

  strikeRate: number;
  economy: number;

  notOut: boolean;
};

type AwardResult = {
  mom: PlayerImpact | null;
  wom: PlayerImpact | null;
};

/*
 * ---------------------------------------------------------
 * CONFIGURATION
 * ---------------------------------------------------------
 *
 * These values are intentionally moderate.
 *
 * Runs are the main batting contribution.
 * Wickets are the main bowling contribution.
 * Efficiency adjusts the score according to match conditions.
 */

const WICKET_POINTS = 20;

const CATCH_POINTS = 8;
const RUN_OUT_POINTS = 10;
const STUMPING_POINTS = 10;

const NOT_OUT_BONUS = 3;
const WINNING_BONUS = 5;

const BOUNDARY_BONUS = 0.25;

/*
 * Wicket types that should NOT receive bowling credit.
 */
const NON_BOWLER_WICKETS = new Set([
  "run_out",
  "run out",
  "retired_hurt",
  "retired hurt",
  "retired_out",
  "retired out",
  "obstructing_field",
  "obstructing the field",
  "timed_out",
  "timed out",
]);

function normalizeGender(gender: string | null | undefined) {
  const value = (gender ?? "").trim().toLowerCase();

  if (value === "female" || value === "f") {
    return "female";
  }

  if (value === "male" || value === "m") {
    return "male";
  }

  return value;
}

function isBowlerWicket(wicketType: string | null) {
  if (!wicketType) {
    return true;
  }

  return !NON_BOWLER_WICKETS.has(wicketType.toLowerCase());
}

function battingBallsFaced(ball: Ball) {
  /*
   * Standard cricket treatment:
   * wides are not balls faced.
   *
   * No-balls can still be faced by the batter.
   *
   * Your opening female no-balls are marked legal by
   * the scorer, so they naturally count here.
   */
  return ball.wides > 0 ? 0 : 1;
}

function bowlingRunsConceded(ball: Ball) {
  /*
   * Bowler is charged with batter runs + wides + no-balls.
   *
   * Byes, leg-byes and penalty runs are excluded.
   */
  return Math.max(
    0,
    ball.runs_total -
      ball.byes -
      ball.leg_byes -
      ball.penalty_runs,
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/*
 * ---------------------------------------------------------
 * MAIN FUNCTION
 * ---------------------------------------------------------
 */

export async function calculateAndSaveMatchAwards(
  matchId: string,
): Promise<AwardResult> {
  /*
   * -------------------------------------------------------
   * LOAD MATCH
   * -------------------------------------------------------
   */

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, winner_team_id, result_type, status",
    )
    .eq("id", matchId)
    .single();

  if (matchError) {
    throw matchError;
  }

  if (!match) {
    throw new Error("Match not found.");
  }

  /*
   * -------------------------------------------------------
   * LOAD INNINGS
   * -------------------------------------------------------
   */

  const { data: inningsData, error: inningsError } = await supabase
    .from("innings")
    .select("*")
    .eq("match_id", matchId)
    .order("innings_number", {
      ascending: true,
    });

  if (inningsError) {
    throw inningsError;
  }

  const innings = (inningsData ?? []) as Innings[];

  if (innings.length === 0) {
    throw new Error("No innings found for this match.");
  }

  /*
   * -------------------------------------------------------
   * LOAD BALLS
   * -------------------------------------------------------
   */

  const inningsIds = innings.map((inningsItem) => inningsItem.id);

  const { data: ballsData, error: ballsError } = await supabase
    .from("balls")
    .select("*")
    .in("innings_id", inningsIds)
    .order("ball_sequence", {
      ascending: true,
    });

  if (ballsError) {
    throw ballsError;
  }

  const balls = (ballsData ?? []) as Ball[];

  /*
   * -------------------------------------------------------
   * LOAD PLAYERS
   * -------------------------------------------------------
   */

  const playerIds = new Set<string>();

  for (const ball of balls) {
    if (ball.striker_id) {
      playerIds.add(ball.striker_id);
    }

    if (ball.bowler_id) {
      playerIds.add(ball.bowler_id);
    }

    if (ball.dismissed_player_id) {
      playerIds.add(ball.dismissed_player_id);
    }

    if (ball.fielder_id) {
      playerIds.add(ball.fielder_id);
    }
  }

  /*
   * Also include players from match squads.
   * This ensures players who participated only indirectly
   * are still available to the award engine.
   */
  const { data: squadData, error: squadError } = await supabase
    .from("match_squads")
    .select("player_id")
    .eq("match_id", matchId)
    .eq("is_playing", true);

  if (squadError) {
    throw squadError;
  }

  for (const squad of squadData ?? []) {
    playerIds.add(squad.player_id);
  }

  const ids = [...playerIds];

  if (ids.length === 0) {
    throw new Error("No players found for this match.");
  }

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id,team_id,name,gender")
    .in("id", ids);

  if (playersError) {
    throw playersError;
  }

  const players = (playersData ?? []) as Player[];

  const playerMap = new Map(
    players.map((player) => [player.id, player]),
  );

  /*
   * -------------------------------------------------------
   * INITIALIZE IMPACT OBJECTS
   * -------------------------------------------------------
   */

  const impacts = new Map<string, PlayerImpact>();

  for (const player of players) {
    impacts.set(player.id, {
      playerId: player.id,
      playerName: player.name,
      gender: normalizeGender(player.gender),
      teamId: player.team_id,

      battingImpact: 0,
      bowlingImpact: 0,
      fieldingImpact: 0,
      winningBonus: 0,

      totalImpact: 0,

      runs: 0,
      ballsFaced: 0,
      wickets: 0,
      ballsBowled: 0,
      runsConceded: 0,

      catches: 0,
      runOuts: 0,
      stumpings: 0,

      strikeRate: 0,
      economy: 0,

      notOut: false,
    });
  }

  /*
   * -------------------------------------------------------
   * BUILD INNINGS BALL GROUPS
   * -------------------------------------------------------
   */

  const ballsByInnings = new Map<string, Ball[]>();

  for (const inningsItem of innings) {
    ballsByInnings.set(
      inningsItem.id,
      balls.filter(
        (ball) => ball.innings_id === inningsItem.id,
      ),
    );
  }

  /*
   * -------------------------------------------------------
   * BATTER + BOWLER RAW STATISTICS
   * -------------------------------------------------------
   */

  for (const inningsItem of innings) {
    const inningsBalls =
      ballsByInnings.get(inningsItem.id) ?? [];

    for (const ball of inningsBalls) {
      const batter = impacts.get(ball.striker_id);
      const bowler = impacts.get(ball.bowler_id);

      /*
       * BATTER
       */

      if (batter) {
        batter.runs += ball.runs_batter;

        batter.ballsFaced += battingBallsFaced(ball);

        if (
          (ball.runs_batter === 4 ||
            ball.runs_batter === 6)
        ) {
          /*
           * Small bonus so boundaries matter,
           * but runs themselves remain the dominant factor.
           */
          batter.battingImpact += BOUNDARY_BONUS;
        }

        /*
         * A batter is dismissed when their own dismissal
         * appears against them.
         */
        if (
          ball.wicket &&
          ball.dismissed_player_id === ball.striker_id
        ) {
          batter.notOut = false;
        }
      }

      /*
       * BOWLER
       */

      if (bowler) {
        if (ball.is_legal_delivery) {
          bowler.ballsBowled++;
        }

        bowler.runsConceded += bowlingRunsConceded(ball);

        if (
          ball.wicket &&
          ball.dismissed_player_id &&
          isBowlerWicket(ball.wicket_type)
        ) {
          bowler.wickets++;
        }
      }

      /*
       * FIELDING
       */

      if (
        ball.wicket &&
        ball.fielder_id
      ) {
        const fielder = impacts.get(ball.fielder_id);

        if (fielder) {
          const wicketType =
            (ball.wicket_type ?? "").toLowerCase();

          if (wicketType === "caught") {
            fielder.catches++;
          }

          if (wicketType === "run_out" || wicketType === "run out") {
            fielder.runOuts++;
          }

          if (wicketType === "stumped") {
            fielder.stumpings++;
          }
        }
      }
    }
  }

  /*
   * -------------------------------------------------------
   * CALCULATE INNINGS PAR RATES
   * -------------------------------------------------------
   *
   * We compare players against the actual match conditions,
   * rather than blindly using a generic T20 benchmark.
   */

  const inningsContext = new Map<
    string,
    {
      battingTeamId: string;
      bowlingTeamId: string;
      parStrikeRate: number;
      parEconomy: number;
    }
  >();

  for (const inningsItem of innings) {
    const inningsBalls =
      ballsByInnings.get(inningsItem.id) ?? [];

    let batterRuns = 0;
    let batterBalls = 0;

    let bowlerRuns = 0;
    let bowlerBalls = 0;

    for (const ball of inningsBalls) {
      batterRuns += ball.runs_batter;
      batterBalls += battingBallsFaced(ball);

      if (ball.is_legal_delivery) {
        bowlerBalls++;
      }

      bowlerRuns += bowlingRunsConceded(ball);
    }

    const parStrikeRate =
      batterBalls > 0
        ? (batterRuns / batterBalls) * 100
        : 100;

    const parEconomy =
      bowlerBalls > 0
        ? (bowlerRuns * 6) / bowlerBalls
        : 8;

    inningsContext.set(inningsItem.id, {
      battingTeamId: inningsItem.batting_team_id,
      bowlingTeamId: inningsItem.bowling_team_id,
      parStrikeRate,
      parEconomy,
    });
  }

  /*
   * -------------------------------------------------------
   * BATTING IMPACT
   * -------------------------------------------------------
   *
   * Formula:
   *
   * Runs
   * + efficiency compared to innings strike rate
   * + small boundary bonus
   * + not-out bonus
   */

  for (const inningsItem of innings) {
    const context = inningsContext.get(inningsItem.id);

    if (!context) {
      continue;
    }

    const inningsBalls =
      ballsByInnings.get(inningsItem.id) ?? [];

    /*
     * Find players who were actually involved in batting.
     */
    const battingPlayerIds = new Set(
      inningsBalls.map((ball) => ball.striker_id),
    );

    for (const playerId of battingPlayerIds) {
      const impact = impacts.get(playerId);

      if (!impact) {
        continue;
      }

      const strikeRate =
        impact.ballsFaced > 0
          ? (impact.runs / impact.ballsFaced) * 100
          : 0;

      impact.strikeRate = strikeRate;

      /*
       * Efficiency value.
       *
       * Example:
       * 140 SR against 100 par SR over 20 balls:
       *
       * 20 × (140 - 100) / 100 = +8
       */
      const efficiency =
        impact.ballsFaced *
        ((strikeRate - context.parStrikeRate) / 100);

      impact.battingImpact +=
        impact.runs + efficiency;

      /*
       * Not out:
       *
       * If the player participated in batting and was
       * never dismissed, give a small bonus.
       */
      const wasDismissed = inningsBalls.some(
        (ball) =>
          ball.wicket &&
          ball.dismissed_player_id === playerId,
      );

      if (!wasDismissed && impact.ballsFaced > 0) {
        impact.notOut = true;
        impact.battingImpact += NOT_OUT_BONUS;
      }
    }
  }

  /*
   * -------------------------------------------------------
   * BOWLING IMPACT
   * -------------------------------------------------------
   *
   * Formula:
   *
   * wickets × 20
   * +
   * economy efficiency compared to innings par economy
   *
   * This prevents a bowler from winning purely because
   * they took one wicket while conceding heavily.
   */

  for (const inningsItem of innings) {
    const context = inningsContext.get(inningsItem.id);

    if (!context) {
      continue;
    }

    const inningsBalls =
      ballsByInnings.get(inningsItem.id) ?? [];

    const bowlerIds = new Set(
      inningsBalls.map((ball) => ball.bowler_id),
    );

    for (const bowlerId of bowlerIds) {
      const impact = impacts.get(bowlerId);

      if (!impact || impact.ballsBowled <= 0) {
        continue;
      }

      const economy =
        (impact.runsConceded * 6) /
        impact.ballsBowled;

      impact.economy = economy;

      const oversBowled =
        impact.ballsBowled / 6;

      const economyEfficiency =
        (context.parEconomy - economy) *
        oversBowled *
        2.5;

      impact.bowlingImpact +=
        impact.wickets * WICKET_POINTS +
        economyEfficiency;
    }
  }

  /*
   * -------------------------------------------------------
   * FIELDING IMPACT
   * -------------------------------------------------------
   */

  for (const impact of impacts.values()) {
    impact.fieldingImpact =
      impact.catches * CATCH_POINTS +
      impact.runOuts * RUN_OUT_POINTS +
      impact.stumpings * STUMPING_POINTS;
  }

  /*
   * -------------------------------------------------------
   * WINNING TEAM BONUS
   * -------------------------------------------------------
   *
   * Small bonus only.
   *
   * A player should NOT win simply because their team won.
   */

  if (match.winner_team_id) {
    for (const impact of impacts.values()) {
      if (impact.teamId === match.winner_team_id) {
        impact.winningBonus = WINNING_BONUS;
      }
    }
  }

  /*
   * -------------------------------------------------------
   * FINAL SCORE
   * -------------------------------------------------------
   */

  for (const impact of impacts.values()) {
    impact.totalImpact = round(
      impact.battingImpact +
        impact.bowlingImpact +
        impact.fieldingImpact +
        impact.winningBonus,
    );
  }

  /*
   * -------------------------------------------------------
   * ELIGIBLE PLAYERS
   * -------------------------------------------------------
   *
   * Don't give an award to someone who literally did
   * nothing in the match.
   */

  const participants = [...impacts.values()].filter(
    (impact) =>
      impact.ballsFaced > 0 ||
      impact.ballsBowled > 0 ||
      impact.catches > 0 ||
      impact.runOuts > 0 ||
      impact.stumpings > 0,
  );

  /*
   * -------------------------------------------------------
   * TIE BREAKER
   * -------------------------------------------------------
   *
   * 1. Impact score
   * 2. Wickets
   * 3. Runs
   * 4. Fielding dismissals
   * 5. Strike rate
   */

  function comparePlayers(
    a: PlayerImpact,
    b: PlayerImpact,
  ) {
    if (b.totalImpact !== a.totalImpact) {
      return b.totalImpact - a.totalImpact;
    }

    if (b.wickets !== a.wickets) {
      return b.wickets - a.wickets;
    }

    if (b.runs !== a.runs) {
      return b.runs - a.runs;
    }

    const aFielding =
      a.catches +
      a.runOuts +
      a.stumpings;

    const bFielding =
      b.catches +
      b.runOuts +
      b.stumpings;

    if (bFielding !== aFielding) {
      return bFielding - aFielding;
    }

    return b.strikeRate - a.strikeRate;
  }

  /*
   * -------------------------------------------------------
   * MOM
   * -------------------------------------------------------
   */

  const malePlayers = participants
    .filter(
      (player) =>
        player.gender === "male",
    )
    .sort(comparePlayers);

  /*
   * -------------------------------------------------------
   * WOM
   * -------------------------------------------------------
   */

  const femalePlayers = participants
    .filter(
      (player) =>
        player.gender === "female",
    )
    .sort(comparePlayers);

  const mom = malePlayers[0] ?? null;
  const wom = femalePlayers[0] ?? null;

  /*
   * -------------------------------------------------------
   * SAVE AWARDS
   * -------------------------------------------------------
   */

  const { error: awardError } = await supabase
    .from("matches")
    .update({
      man_of_match_player_id: mom?.playerId ?? null,
      woman_of_match_player_id: wom?.playerId ?? null,
    })
    .eq("id", matchId);

  if (awardError) {
    throw awardError;
  }

  return {
    mom,
    wom,
  };
}