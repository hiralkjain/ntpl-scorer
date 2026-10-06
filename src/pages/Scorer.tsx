import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { calculateAndSaveMatchAwards } from "../lib/awards";

type Player = {
  id: string;
  team_id: string;
  name: string;
  gender: string;
  role?: string | null;
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
  declared_overs: number | null;
  target_runs: number | null;
  status: string;
  striker_id: string | null;
  non_striker_id: string | null;
  current_bowler_id: string | null;
  overs_limit: number;
  innings_status: string;
  started_at: string | null;
  completed_at: string | null;
  female_return_eligible_ids: string[];
  female_return_used_ids: string[];
};

type Ball = {
  id: string;
  innings_id: string;

  over_number: number;
  ball_number: number;
  ball_sequence: number;

  striker_id: string;
  non_striker_id: string | null;
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
  is_boundary: boolean;
  boundary_type: string | null;

  wicket: boolean;
  wicket_type: string | null;
  dismissed_player_id: string | null;
  fielder_id: string | null;

  commentary: string | null;

  special_event: string | null;
  score_adjustment: number;

  legal_delivery: boolean;
  batter_runs: number;
  extras_runs: number;
  total_runs: number;

  notes: string | null;

  created_at: string;
};

const FEMALE_PHASE_BALLS = 12;
const MATCH_OVERS = 7;
const MAX_LEGAL_BALLS = MATCH_OVERS * 6;

const WICKET_TYPES = [
  "bowled",
  "caught",
  "lbw",
  "run_out",
  "stumped",
  "hit_wicket",
  "retired_hurt",
  "obstructing_field",
  "timed_out",
  "retired_out",
];

function isFemale(player?: Player | null) {
  return player?.gender?.toLowerCase() === "female";
}

function oversText(balls: number) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function ballLabel(ball: Ball) {
  if (ball.special_event === "female_protected_wicket") {
    return "-2";
  }

  if (ball.wicket) {
    return "W";
  }

  if (ball.special_event === "female_wide" || ball.special_event === "wide") {
    return `WD ${ball.runs_total}`;
  }

  if (
    ball.special_event === "female_no_ball" ||
    ball.special_event === "no_ball"
  ) {
    return `NB ${ball.runs_total}`;
  }

  return String(ball.runs_total);
}

function isBowlerWicket(wicketType: string | null) {
  if (!wicketType) return true;

  const excluded = [
    "run_out",
    "run out",
    "retired_hurt",
    "retired hurt",
    "obstructing",
    "obstructing_field",
    "timed_out",
    "timed out",
    "retired_out",
    "retired out",
  ];

  return !excluded.includes(wicketType.toLowerCase());
}

export default function Scorer() {
  const { matchId } = useParams();

  const [innings, setInnings] = useState<Innings | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [showWicket, setShowWicket] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showBowlerChange, setShowBowlerChange] = useState(false);

  const [editingBall, setEditingBall] = useState<Ball | null>(null);
  const [editRuns, setEditRuns] = useState(0);
  const [editEvent, setEditEvent] = useState<string>("");
  const [editWicket, setEditWicket] = useState(false);
  const [editWicketType, setEditWicketType] = useState("bowled");
  const [editDismissedPlayer, setEditDismissedPlayer] = useState("");

  const [showOpeningPhaseComplete, setShowOpeningPhaseComplete] =
    useState(false);

  const [showMaleBatterSelection, setShowMaleBatterSelection] = useState(false);

  const [nextStrikerId, setNextStrikerId] = useState("");
  const [nextNonStrikerId, setNextNonStrikerId] = useState("");

  const [showSecondInningsSetup, setShowSecondInningsSetup] = useState(false);

  const [secondStrikerId, setSecondStrikerId] = useState("");
  const [secondNonStrikerId, setSecondNonStrikerId] = useState("");
  const [secondBowlerId, setSecondBowlerId] = useState("");

  const [showTieWinner, setShowTieWinner] = useState(false);
  const [tieWinnerId, setTieWinnerId] = useState("");

  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [showOtherRuns, setShowOtherRuns] = useState(false);
  const [otherRuns, setOtherRuns] = useState("");

  /*
   * ---------------------------------------------------------
   * LOAD MATCH
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!matchId) return;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("innings")
        .select("*")
        .eq("match_id", matchId)
        .order("innings_number", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setMessage("No innings found for this match.");
        setLoading(false);
        return;
      }

      const loadedInnings = data as Innings;

      console.log("SCORER LOADED INNINGS:", {
        striker_id: loadedInnings.striker_id,
        non_striker_id: loadedInnings.non_striker_id,
        current_bowler_id: loadedInnings.current_bowler_id,
      });

      setInnings(loadedInnings);

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", [
          loadedInnings.batting_team_id,
          loadedInnings.bowling_team_id,
        ]);

      if (teamError) {
        setMessage(teamError.message);
        setLoading(false);
        return;
      }

      const names: Record<string, string> = {};

      (teamData ?? []).forEach((team) => {
        names[team.id] = team.name;
      });

      setTeamNames(names);

      const [squadResult, ballsResult] = await Promise.all([
        supabase
          .from("match_squads")
          .select("player_id")
          .eq("match_id", matchId)
          .eq("is_playing", true),

        supabase
          .from("balls")
          .select("*")
          .eq("innings_id", loadedInnings.id)
          .order("ball_sequence", {
            ascending: true,
          }),
      ]);

      if (squadResult.error) {
        setMessage(squadResult.error.message);
        setLoading(false);
        return;
      }

      if (ballsResult.error) {
        setMessage(ballsResult.error.message);
        setLoading(false);
        return;
      }

      const playerIds = (squadResult.data ?? []).map((x) => x.player_id);

      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id,team_id,name,gender,role")
        .in("id", playerIds);

      if (playerError) {
        setMessage(playerError.message);
        setLoading(false);
        return;
      }

      setPlayers((playerData ?? []) as Player[]);
      setBalls((ballsResult.data ?? []) as Ball[]);

      setLoading(false);
    }

    void load();
  }, [matchId]);

  /*
   * ---------------------------------------------------------
   * RESTORE SCORER UI FROM DATABASE STATE
   * ---------------------------------------------------------
   */

 useEffect(() => {
   if (!innings) return;

   const isCompleted = innings.innings_status === "completed";
   const isLive = !isCompleted;

   /*
    * The opening phase ends at 12 legal balls.
    *
    * At exactly 12 legal balls, striker/non-striker are intentionally
    * cleared so the scorer can select the male batters.
    *
    * However, wides/no-balls after 2 overs are NOT legal balls.
    * Therefore legal_balls can remain 12 even after a ball has already
    * been recorded in the normal phase.
    *
    * A ball with sequence > 12 proves that normal-phase scoring has
    * already started.
    */
   const normalPhaseHasStarted = balls.some(
     (ball) => ball.ball_sequence > FEMALE_PHASE_BALLS,
   );

   const atOpeningBoundary =
     innings.legal_balls >= FEMALE_PHASE_BALLS &&
     innings.striker_id === null &&
     innings.non_striker_id === null &&
     !normalPhaseHasStarted;

   setShowMaleBatterSelection(isLive && atOpeningBoundary);

   setShowBowlerChange(
     isLive &&
       innings.current_bowler_id === null &&
       !atOpeningBoundary &&
       !showMaleBatterSelection,
   );

   setShowSecondInningsSetup(innings.innings_number === 1 && isCompleted);

   if (innings.innings_number !== 1 || !isCompleted) {
     setSecondStrikerId("");
     setSecondNonStrikerId("");
     setSecondBowlerId("");
   }

   const tie =
     innings.innings_number === 2 &&
     isCompleted &&
     innings.target_runs !== null &&
     innings.total_runs === innings.target_runs - 1;

   setShowTieWinner(tie);
 }, [innings, balls]);

  /*
   * ---------------------------------------------------------
   * REALTIME
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!innings?.id) return;

    const channel = supabase
      .channel(`scorer-${innings.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "innings",
          filter: `id=eq.${innings.id}`,
        },
        (payload) => {
          if (payload.new) {
            setInnings(payload.new as Innings);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "balls",
          filter: `innings_id=eq.${innings.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("balls")
            .select("*")
            .eq("innings_id", innings.id)
            .order("ball_sequence", {
              ascending: true,
            });

          if (data) {
            setBalls(data as Ball[]);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [innings?.id]);

  /*
   * ---------------------------------------------------------
   * HELPERS
   * ---------------------------------------------------------
   */

  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const striker = innings?.striker_id
    ? playerMap.get(innings.striker_id)
    : null;

  const nonStriker = innings?.non_striker_id
    ? playerMap.get(innings.non_striker_id)
    : null;

  const bowler = innings?.current_bowler_id
    ? playerMap.get(innings.current_bowler_id)
    : null;

  const legalBallsCompleted = innings?.legal_balls ?? 0;

  const currentOver = Math.floor(legalBallsCompleted / 6) + 1;

  const firstInningsScore = innings?.target_runs ? innings.target_runs - 1 : 0;

  const isTie =
    innings?.innings_number === 2 &&
    innings?.innings_status === "completed" &&
    innings.total_runs === firstInningsScore;

  const ballsInCurrentOver = legalBallsCompleted % 6;

  const femalePhase =
    legalBallsCompleted < FEMALE_PHASE_BALLS && currentOver <= 2;

  const matchComplete = legalBallsCompleted >= MAX_LEGAL_BALLS;

  const battingPlayers = players.filter(
    (p) => p.team_id === innings?.batting_team_id,
  );

  const bowlingPlayers = players.filter(
    (p) => p.team_id === innings?.bowling_team_id,
  );

  const availableNewBatters = battingPlayers.filter(
    (p) => p.id !== innings?.striker_id && p.id !== innings?.non_striker_id,
  );

  const eligibleReturns = battingPlayers.filter(
    (p) =>
      innings?.female_return_eligible_ids?.includes(p.id) &&
      !innings?.female_return_used_ids?.includes(p.id) &&
      p.id !== innings?.striker_id &&
      p.id !== innings?.non_striker_id,
  );

  const openingPhaseComplete =
    (innings?.legal_balls ?? 0) >= FEMALE_PHASE_BALLS;

  const maleBattingPlayers = battingPlayers.filter(
    (player) => !isFemale(player),
  );

  /*
   * ---------------------------------------------------------
   * LIVE PLAYER STATISTICS
   * ---------------------------------------------------------
   */

  function getBattingStats(playerId: string) {
    let runs = 0;
    let ballsFaced = 0;

    for (const ball of balls) {
      if (ball.striker_id !== playerId) continue;

      /*
       * A wide is not a ball faced.
       * No-balls during the opening phase are legal
       * in this tournament and are counted as balls.
       */
      if (
        ball.special_event === "wide" ||
        ball.special_event === "female_wide" ||
        ball.wides > 0
      ) {
        continue;
      }

      ballsFaced += 1;

      runs += ball.runs_batter ?? ball.batter_runs ?? 0;
    }

    return {
      runs,
      balls: ballsFaced,
    };
  }

  function getBowlingStats(playerId: string) {
    let runs = 0;
    let wickets = 0;

    for (const ball of balls) {
      if (ball.bowler_id !== playerId) continue;

      /*
       * Bowler is charged with:
       * - batter runs
       * - wides
       * - no-balls
       *
       * Byes and leg-byes are not charged to the bowler.
       */
      const batterRuns = ball.runs_batter ?? ball.batter_runs ?? 0;

      const wideRuns = ball.wides ?? 0;
      const noBallRuns = ball.no_balls ?? 0;

      runs += batterRuns + wideRuns + noBallRuns;

      if (ball.wicket && isBowlerWicket(ball.wicket_type)) {
        wickets += 1;
      }
    }

    return {
      runs,
      wickets,
    };
  }

  const strikerStats = striker
    ? getBattingStats(striker.id)
    : { runs: 0, balls: 0 };

  const nonStrikerStats = nonStriker
    ? getBattingStats(nonStriker.id)
    : { runs: 0, balls: 0 };

  const bowlerStats = bowler
    ? getBowlingStats(bowler.id)
    : { runs: 0, wickets: 0 };

  function notify(text: string) {
    setMessage(text);

    window.setTimeout(() => setMessage(""), 3500);
  }

  /*
   * ---------------------------------------------------------
   * NEXT BALL POSITION
   * ---------------------------------------------------------
   */

  function getNextPosition(legalDelivery = true) {
    const legalBall = innings?.legal_balls ?? 0;

    const nextLegalBall = legalDelivery ? legalBall + 1 : legalBall;

    const overNumber = Math.floor(legalBall / 6);

    const ballNumber = legalDelivery ? (legalBall % 6) + 1 : 0;

    return {
      overNumber,
      ballNumber,
      nextLegalBall,
    };
  }

  function overNumberForRules() {
    const legalBalls = innings?.legal_balls ?? 0;
    return Math.floor(legalBalls / 6) + 1;
  }

  /*
   * ---------------------------------------------------------
   * SECOND INNINGS
   * ---------------------------------------------------------
   */

  async function startSecondInnings() {
    if (!innings) return;

    const targetRuns = innings.total_runs + 1;

    const { error: existingError } = await supabase
      .from("innings")
      .select("id")
      .eq("match_id", innings.match_id)
      .eq("innings_number", 2)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);
      notify("Could not check second innings.");
      return;
    }

    const { data: existingSecond } = await supabase
      .from("innings")
      .select("id")
      .eq("match_id", innings.match_id)
      .eq("innings_number", 2)
      .maybeSingle();

    if (existingSecond) {
      notify("Second innings already exists.");
      return;
    }

    setShowSecondInningsSetup(true);

    notify(`Select opening players. Target: ${targetRuns}`);
  }

  async function chooseTieWinner() {
    if (!innings) return;

    if (!tieWinnerId) {
      notify("Select the winner.");
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        winner_team_id: tieWinnerId,
        result_type: "tie",
        result_margin: 0,
        result_margin_type: "runs",
        status: "completed",
      })
      .eq("id", innings.match_id);

    if (error) {
      console.error("Failed to save tie winner:", error);
      notify("Could not save the winner.");
      return;
    }

    setShowTieWinner(false);
    notify("Winner selected.");
  }

  async function finishMatch(
    winnerTeamId: string | null,
    resultType: "win" | "tie",
    resultMargin: number | null,
    resultMarginType: "runs" | "wickets" | null,
  ) {
    if (!innings) return;

    const { error } = await supabase
      .from("matches")
      .update({
        status: "completed",
        winner_team_id: winnerTeamId,
        result_type: resultType,
        result_margin: resultMargin,
        result_margin_type: resultMarginType,
      })
      .eq("id", innings.match_id);

    if (error) {
      console.error("Failed to finish match:", error);
      notify("Could not save match result.");
      return;
    }

    notify(resultType === "tie" ? "MATCH TIED" : "MATCH COMPLETE");
  }

  async function confirmSecondInningsStart() {
    if (!innings) return;

    if (!secondStrikerId || !secondNonStrikerId || !secondBowlerId) {
      notify("Select both batters and the bowler.");
      return;
    }

    if (secondStrikerId === secondNonStrikerId) {
      notify("Striker and non-striker must be different.");
      return;
    }

    const battingTeamId = innings.bowling_team_id;
    const bowlingTeamId = innings.batting_team_id;
    const targetRuns = innings.total_runs + 1;

    const { data: newInnings, error } = await supabase
      .from("innings")
      .insert({
        match_id: innings.match_id,
        innings_number: 2,

        batting_team_id: battingTeamId,
        bowling_team_id: bowlingTeamId,

        total_runs: 0,
        wickets: 0,
        legal_balls: 0,

        target_runs: targetRuns,

        overs_limit: 7,

        status: "live",
        innings_status: "live",

        striker_id: secondStrikerId,
        non_striker_id: secondNonStrikerId,
        current_bowler_id: secondBowlerId,

        female_return_eligible_ids: [],
        female_return_used_ids: [],

        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to start second innings:", error);
      notify("Could not start second innings.");
      return;
    }

    setInnings(newInnings);

    setSecondStrikerId("");
    setSecondNonStrikerId("");
    setSecondBowlerId("");
    setShowSecondInningsSetup(false);

    notify(`Second innings started. Target: ${targetRuns}`);
  }

  /*
   * ---------------------------------------------------------
   * RECORD BALL
   * ---------------------------------------------------------
   */

  async function recordBall({
    batterRuns = 0,
    extrasRuns = 0,
    totalRuns = 0,
    scoreAdjustment = 0,
    specialEvent = null,
    wicket = false,
    wicketType = null,
    dismissedPlayerId = null,
    legalDelivery = true,
  }: {
    batterRuns?: number;
    extrasRuns?: number;
    totalRuns?: number;
    scoreAdjustment?: number;
    specialEvent?: string | null;
    wicket?: boolean;
    wicketType?: string | null;
    dismissedPlayerId?: string | null;
    legalDelivery?: boolean;
  }) {
    if (!innings) return;

    if (innings.innings_status === "completed") {
      notify("This innings is complete.");
      return;
    }

    if (!striker || !bowler) {
      notify("Select striker, non-striker and bowler first.");
      return;
    }

    if (showMaleBatterSelection) {
      notify("Select the two batters to continue.");
      return;
    }

    setBusy(true);

    try {
      const isOpeningPhase = (innings.legal_balls ?? 0) < FEMALE_PHASE_BALLS;

      const isFemaleWide = specialEvent === "female_wide";

      const isFemaleNoBall = specialEvent === "female_no_ball";

      const isWide = specialEvent === "wide" || isFemaleWide;

      const isNoBall = specialEvent === "no_ball" || isFemaleNoBall;

      let finalTotalRuns = totalRuns;
      let finalExtrasRuns = extrasRuns;
      let finalSpecialEvent = specialEvent;
      let finalLegalDelivery = legalDelivery;

      if (isWide || isNoBall) {
        if (isOpeningPhase) {
          finalTotalRuns = 2;
          finalExtrasRuns = 2;
          finalSpecialEvent = isWide ? "female_wide" : "female_no_ball";
          finalLegalDelivery = true;
        } else {
          finalTotalRuns = 1;
          finalExtrasRuns = 1;
          finalSpecialEvent = isWide ? "wide" : "no_ball";
          finalLegalDelivery = false;
        }
      }

      if ((innings.legal_balls ?? 0) >= MAX_LEGAL_BALLS) {
        notify("7 overs are complete.");
        return;
      }

      if (isOpeningPhase) {
        if (!isFemale(striker) || !isFemale(nonStriker) || !isFemale(bowler)) {
          notify("The current player combination is not valid for this phase.");
          return;
        }
      }

      const { overNumber, ballNumber, nextLegalBall } =
        getNextPosition(finalLegalDelivery);

      const nextSequence =
        balls.length > 0
          ? Math.max(...balls.map((b) => b.ball_sequence)) + 1
          : 1;

      const scoreDelta =
        scoreAdjustment !== 0 ? scoreAdjustment : finalTotalRuns;

      const newScore = innings.total_runs + scoreDelta;

      const targetReached =
        innings.innings_number === 2 &&
        innings.target_runs !== null &&
        newScore >= innings.target_runs;

      const newWickets = innings.wickets + (wicket ? 1 : 0);

      const wicketsRemaining = 9 - newWickets;

      if (newWickets > 9) {
        notify("All 9 wickets have already fallen.");
        return;
      }

      let nextStriker = innings.striker_id;
      let nextNonStriker = innings.non_striker_id;

      if (batterRuns % 2 !== 0) {
        const temp = nextStriker;
        nextStriker = nextNonStriker;
        nextNonStriker = temp;
      }

      const endOfOver = finalLegalDelivery && nextLegalBall % 6 === 0;

      if (endOfOver) {
        const temp = nextStriker;
        nextStriker = nextNonStriker;
        nextNonStriker = temp;
      }

      const inningsEnds = nextLegalBall >= MAX_LEGAL_BALLS || targetReached;

      let matchWinner: string | null = null;
      let matchResultType: "win" | "tie" = "win";
      let matchMargin: number | null = null;
      let matchMarginType: "runs" | "wickets" | null = null;

      if (innings.innings_number === 2 && inningsEnds) {
        if (targetReached) {
          matchWinner = innings.batting_team_id;
          matchResultType = "win";
          matchMargin = wicketsRemaining;
          matchMarginType = "wickets";
        } else if (newScore === innings.target_runs! - 1) {
          matchWinner = null;
          matchResultType = "tie";
          matchMargin = null;
          matchMarginType = null;
        } else {
          matchWinner = innings.bowling_team_id;
          matchResultType = "win";
          matchMargin = (innings.target_runs ?? 1) - 1 - newScore;
          matchMarginType = "runs";
        }
      }

      if (wicket) {
        nextStriker = null;
      }

      const openingPhaseComplete = nextLegalBall === FEMALE_PHASE_BALLS;

      const ballPayload = {
        innings_id: innings.id,

        over_number: overNumber,

        ball_number: ballNumber,

        ball_sequence: nextSequence,

        striker_id: innings.striker_id,

        non_striker_id: innings.non_striker_id,

        bowler_id: innings.current_bowler_id,

        runs_batter: batterRuns,

        runs_extras: finalExtrasRuns,

        runs_total: finalTotalRuns,

        wides: finalSpecialEvent?.includes("wide") ? finalExtrasRuns : 0,

        no_balls: finalSpecialEvent?.includes("no_ball") ? finalExtrasRuns : 0,

        byes: 0,

        leg_byes: 0,

        penalty_runs: 0,

        is_legal_delivery: finalLegalDelivery,

        is_boundary: batterRuns === 4 || batterRuns === 6,

        boundary_type:
          batterRuns === 4 ? "four" : batterRuns === 6 ? "six" : null,

        wicket,

        wicket_type: wicketType,

        dismissed_player_id: dismissedPlayerId,

        fielder_id: null,

        commentary: null,

        special_event: finalSpecialEvent,

        score_adjustment: scoreAdjustment,

        legal_delivery: finalLegalDelivery,

        batter_runs: batterRuns,

        extras_runs: finalExtrasRuns,

        total_runs: finalTotalRuns,

        notes: null,
      };

      const { error } = await supabase.from("balls").insert(ballPayload);

      if (error) {
        throw error;
      }

      let eligible = innings.female_return_eligible_ids ?? [];

      const updatePayload: Partial<Innings> = {
        total_runs: newScore,

        wickets: newWickets,

        legal_balls: nextLegalBall,

        striker_id: nextStriker,

        non_striker_id: nextNonStriker,

        status: "live",

        innings_status: "live",

        female_return_eligible_ids: eligible,

        started_at: innings.started_at ?? new Date().toISOString(),
      };

      if (endOfOver) {
        updatePayload.current_bowler_id = null;
      }

      if (inningsEnds) {
        updatePayload.innings_status = "completed";
        updatePayload.status = "completed";
        updatePayload.completed_at = new Date().toISOString();

        updatePayload.current_bowler_id = innings.current_bowler_id;
      }

      if (openingPhaseComplete && !inningsEnds) {
        updatePayload.striker_id = null;
        updatePayload.non_striker_id = null;
      }

      const { error: inningsError } = await supabase
        .from("innings")
        .update(updatePayload)
        .eq("id", innings.id);

      if (inningsError) {
        throw inningsError;
      }

      if (innings.innings_number === 2 && inningsEnds) {
        const { error: matchError } = await supabase
          .from("matches")
          .update({
            status: "completed",
            winner_team_id: matchWinner,
            result_type: matchResultType,
            result_margin: matchMargin,
            result_margin_type: matchMarginType,
          })
          .eq("id", innings.match_id);

        if (matchError) {
          throw matchError;
        }

        try {
          const awards = await calculateAndSaveMatchAwards(innings.match_id);

          console.log("AUTOMATIC MATCH AWARDS:", {
            MOM: awards.mom?.playerName ?? "None",
            MOMScore: awards.mom?.totalImpact ?? 0,
            WOM: awards.wom?.playerName ?? "None",
            WOMScore: awards.wom?.totalImpact ?? 0,
          });
        } catch (awardError) {
          console.error("Failed to calculate automatic MOM/WOM:", awardError);
        }
      }

      setInnings({
        ...innings,
        ...updatePayload,
      });

      if (openingPhaseComplete && !inningsEnds) {
        setNextStrikerId("");
        setNextNonStrikerId("");
        setShowMaleBatterSelection(true);

        notify("Opening phase complete. Select the two batters.");
      }

      if (endOfOver && !inningsEnds) {
        setShowBowlerChange(true);
      }

      if (inningsEnds) {
        setShowBowlerChange(false);
        setShowMaleBatterSelection(false);

        notify("7 overs complete.");
      } else if (endOfOver && !openingPhaseComplete) {
        notify(`Over ${overNumber} complete. Select next bowler.`);
      }
      //else if (!openingPhaseComplete) {
      //   notify("Ball recorded.");
      // }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not record ball.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * RUNS
   * ---------------------------------------------------------
   */

  async function addRuns(runs: number) {
    await recordBall({
      batterRuns: runs,
      totalRuns: runs,
      extrasRuns: 0,
      legalDelivery: true,
    });
  }
  async function addOtherRuns() {
    const value = Number(otherRuns);

    if (!Number.isInteger(value) || value < 0) {
      notify("Enter a valid whole number of runs.");
      return;
    }

    await addRuns(value);

    setOtherRuns("");
    setShowOtherRuns(false);
  }

  /*
   * ---------------------------------------------------------
   * WIDE
   * ---------------------------------------------------------
   */

  async function addWide() {
    const openingPhase = (innings?.legal_balls ?? 0) < FEMALE_PHASE_BALLS;

    if (openingPhase) {
      await recordBall({
        extrasRuns: 2,
        totalRuns: 2,
        specialEvent: "female_wide",
        legalDelivery: true,
      });
    } else {
      await recordBall({
        extrasRuns: 1,
        totalRuns: 1,
        specialEvent: "wide",
        legalDelivery: false,
      });
    }
  }

  /*
   * ---------------------------------------------------------
   * NO BALL
   * ---------------------------------------------------------
   */

  async function addNoBall() {
    const openingPhase =
      (innings?.legal_balls ?? 0) < FEMALE_PHASE_BALLS && currentOver <= 2;

    if (openingPhase) {
      await recordBall({
        extrasRuns: 2,
        totalRuns: 2,
        specialEvent: "female_no_ball",
        legalDelivery: true,
      });
    } else {
      await recordBall({
        extrasRuns: 1,
        totalRuns: 1,
        specialEvent: "no_ball",
        legalDelivery: false,
      });
    }
  }

  /*
   * ---------------------------------------------------------
   * PROTECTED DISMISSAL
   * ---------------------------------------------------------
   */

  async function specialDismissal() {
    if (!femalePhase) {
      notify("This action is only available during the opening phase.");
      return;
    }

    if (!striker || !innings) {
      return;
    }

    const dismissedId = striker.id;

    await recordBall({
      totalRuns: 0,
      scoreAdjustment: -2,
      specialEvent: "female_protected_wicket",
      legalDelivery: true,
      wicket: false,
      dismissedPlayerId: dismissedId,
    });

    const currentEligible = innings.female_return_eligible_ids ?? [];

    const updatedEligible = currentEligible.filter((id) => id !== dismissedId);

    const { error } = await supabase
      .from("innings")
      .update({
        female_return_eligible_ids: updatedEligible,
      })
      .eq("id", innings.id);

    if (error) {
      console.error("Failed to update female return eligibility:", error);

      notify("Could not update return eligibility.");

      return;
    }

    setInnings({
      ...innings,
      female_return_eligible_ids: updatedEligible,
    });

    setShowWicket(false);
  }

  /*
   * ---------------------------------------------------------
   * REAL WICKET
   * ---------------------------------------------------------
   */

  async function recordWicket(wicketType: string) {
    const openingPhase = (innings?.legal_balls ?? 0) < FEMALE_PHASE_BALLS;

    if (openingPhase) {
      await specialDismissal();
      return;
    }

    if (!striker) {
      notify("No striker selected.");
      return;
    }

    await recordBall({
      totalRuns: 0,
      legalDelivery: true,
      wicket: true,
      wicketType,
      dismissedPlayerId: striker.id,
    });

    setShowWicket(false);
  }

  /*
   * ---------------------------------------------------------
   * START NORMAL PHASE
   * ---------------------------------------------------------
   */

  async function startNormalPhase() {
    if (!innings) return;

    if (!nextStrikerId || !nextNonStrikerId) {
      notify("Select both batters.");
      return;
    }

    if (nextStrikerId === nextNonStrikerId) {
      notify("Striker and non-striker must be different.");
      return;
    }

    const { error } = await supabase
      .from("innings")
      .update({
        striker_id: nextStrikerId,
        non_striker_id: nextNonStrikerId,
      })
      .eq("id", innings.id);

    if (error) {
      console.error("Failed to start normal phase:", error);

      notify("Could not select the new batters.");

      return;
    }

    setInnings({
      ...innings,
      striker_id: nextStrikerId,
      non_striker_id: nextNonStrikerId,
    });

    setNextStrikerId("");
    setNextNonStrikerId("");
    setShowMaleBatterSelection(false);

    notify("Normal play started.");
  }

  /*
   * ---------------------------------------------------------
   * SELECT NEXT BATTER
   * ---------------------------------------------------------
   */

  async function selectNextBatter(playerId: string) {
    if (!innings) return;

    const { error } = await supabase
      .from("innings")
      .update({
        striker_id: playerId,
      })
      .eq("id", innings.id);

    if (error) {
      notify(error.message);
      return;
    }

    setInnings({
      ...innings,
      striker_id: playerId,
    });
  }

  /*
   * ---------------------------------------------------------
   * BOWLER CHANGE
   * ---------------------------------------------------------
   */

  async function selectBowler(playerId: string) {
    if (!innings) return;

    const selected = playerMap.get(playerId);

    if (femalePhase && !isFemale(selected)) {
      notify("Select a valid bowler for this phase.");
      return;
    }

    if (innings.current_bowler_id === playerId) {
      notify("Select a different bowler.");
      return;
    }

    const { error } = await supabase
      .from("innings")
      .update({
        current_bowler_id: playerId,
      })
      .eq("id", innings.id);

    if (error) {
      notify(error.message);
      return;
    }

    setInnings({
      ...innings,
      current_bowler_id: playerId,
    });

    setShowBowlerChange(false);
  }

  /*
   * ---------------------------------------------------------
   * FEMALE RETURN
   * ---------------------------------------------------------
   */

  async function returnFemale(playerId: string) {
    if (!innings) return;

    if (!innings.female_return_eligible_ids.includes(playerId)) {
      notify("This player is not eligible to return.");
      return;
    }

    if (innings.female_return_used_ids.includes(playerId)) {
      notify("This return has already been used.");
      return;
    }

    const used = [...innings.female_return_used_ids, playerId];

    const { error } = await supabase
      .from("innings")
      .update({
        striker_id: playerId,
        female_return_used_ids: used,
      })
      .eq("id", innings.id);

    if (error) {
      notify(error.message);
      return;
    }

    setInnings({
      ...innings,
      striker_id: playerId,
      female_return_used_ids: used,
    });

    setShowReturn(false);
  }

  /*
   * ---------------------------------------------------------
   * UNDO LAST BALL
   * ---------------------------------------------------------
   */

  async function undoLastBall() {
    if (!innings || balls.length === 0 || busy) {
      return;
    }

    const lastBall = [...balls].sort(
      (a, b) => b.ball_sequence - a.ball_sequence,
    )[0];

    const confirmed = window.confirm(`Undo ball #${lastBall.ball_sequence}?`);

    if (!confirmed) {
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase
        .from("balls")
        .delete()
        .eq("id", lastBall.id);

      if (error) {
        throw error;
      }

      await rebuildInnings();

      notify("Last ball undone.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not undo ball.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * REBUILD INNINGS
   * ---------------------------------------------------------
   */

  async function rebuildInnings() {
    if (!innings) return;

    const { data, error } = await supabase
      .from("balls")
      .select("*")
      .eq("innings_id", innings.id)
      .order("ball_sequence", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    const history = (data ?? []) as Ball[];

    let totalRuns = 0;
    let wickets = 0;
    let legalBalls = 0;

    for (const ball of history) {
      totalRuns +=
        ball.score_adjustment !== 0 ? ball.score_adjustment : ball.runs_total;

      if (ball.wicket) {
        wickets++;
      }

      if (ball.is_legal_delivery) {
        legalBalls++;
      }
    }

    let strikerId: string | null = null;
    let nonStrikerId: string | null = null;
    let bowlerId: string | null = null;

    if (history.length > 0) {
      const last = history[history.length - 1];

      strikerId = last.striker_id;
      nonStrikerId = last.non_striker_id;
      bowlerId = last.bowler_id;

      if (last.runs_total % 2 !== 0) {
        const temp = strikerId;
        strikerId = nonStrikerId;
        nonStrikerId = temp;
      }

      if (last.is_legal_delivery && legalBalls % 6 === 0) {
        const temp = strikerId;
        strikerId = nonStrikerId;
        nonStrikerId = temp;
      }

      if (last.wicket) {
        strikerId = null;
      }
    }

    const { error: updateError } = await supabase
      .from("innings")
      .update({
        total_runs: totalRuns,
        wickets,
        legal_balls: legalBalls,
        striker_id: strikerId,
        non_striker_id: nonStrikerId,
        current_bowler_id: bowlerId,
      })
      .eq("id", innings.id);

    if (updateError) {
      throw updateError;
    }

    setBalls(history);

    setInnings({
      ...innings,
      total_runs: totalRuns,
      wickets,
      legal_balls: legalBalls,
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      current_bowler_id: bowlerId,
    });
  }

  /*
   * ---------------------------------------------------------
   * EDIT BALL
   * ---------------------------------------------------------
   */

  function openEdit(ball: Ball) {
    setEditingBall(ball);

    setEditRuns(ball.runs_total);

    setEditEvent(ball.special_event ?? "");

    setEditWicket(ball.wicket);

    setEditWicketType(ball.wicket_type ?? "bowled");

    setEditDismissedPlayer(ball.dismissed_player_id ?? "");
  }

  async function saveBallEdit() {
    if (!editingBall || !innings) {
      return;
    }

    setBusy(true);

    try {
      const isProtected = editEvent === "female_protected_wicket";

      const scoreAdjustment = isProtected ? -2 : 0;

      const totalRuns = isProtected ? 0 : editRuns;

      const updatePayload = {
        runs_batter: isProtected ? 0 : editRuns,

        runs_extras: 0,

        runs_total: totalRuns,

        batter_runs: isProtected ? 0 : editRuns,

        extras_runs: 0,

        total_runs: totalRuns,

        score_adjustment: scoreAdjustment,

        special_event: editEvent || null,

        wicket: isProtected ? false : editWicket,

        wicket_type: isProtected ? null : editWicket ? editWicketType : null,

        dismissed_player_id: isProtected
          ? editingBall.dismissed_player_id
          : editWicket
            ? editDismissedPlayer || null
            : null,
      };

      const { error } = await supabase
        .from("balls")
        .update(updatePayload)
        .eq("id", editingBall.id);

      if (error) {
        throw error;
      }

      await rebuildInnings();

      setEditingBall(null);

      notify("Ball updated.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update ball.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (loading) {
    return (
      <div className="p-8 text-center font-semibold text-slate-900">
        Loading scorer...
      </div>
    );
  }

  if (!innings) {
    return (
      <div className="p-8 text-center text-red-600">
        {message || "No innings found."}
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * UI
   * ---------------------------------------------------------
   */

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12 text-slate-900">
      {/* HEADER */}

      <div className="rounded-3xl bg-[#0B4D2B] p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-green-200">
              Live Scoring
            </div>

            <div className="mt-2 text-6xl font-black">
              {innings.total_runs}/{innings.wickets}
            </div>

            <div className="mt-2 text-lg text-green-100">
              {oversText(innings.legal_balls)} / {innings.overs_limit}.0 overs
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 px-5 py-4">
            <div className="text-xs font-bold text-green-200">CURRENT OVER</div>

            <div className="mt-1 text-3xl font-black">{currentOver}</div>

            <div className="text-sm text-green-100">
              {ballsInCurrentOver}/6 balls
            </div>
          </div>
        </div>
      </div>

      {/* OVER COMPLETE */}

      {showBowlerChange && (
        <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-5">
          <div className="text-xl font-black text-[#0B4D2B]">
            OVER {currentOver - 1} COMPLETE
          </div>

          <div className="mt-1 text-sm text-green-700">
            Select the bowler for Over {currentOver}.
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {bowlingPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => void selectBowler(player.id)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left font-bold text-slate-900 shadow-sm transition hover:border-[#0B4D2B] hover:bg-green-50"
              >
                {player.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FIRST INNINGS COMPLETE */}

      {innings?.innings_number === 1 &&
        innings?.innings_status === "completed" && (
          <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-5">
            <div className="text-xl font-black text-[#0B4D2B]">
              INNINGS COMPLETE
            </div>

            <div className="mt-2 text-green-800">
              {innings.total_runs}/{innings.wickets} in{" "}
              {oversText(innings.legal_balls)} overs
            </div>

            <div className="mt-4 text-lg font-black text-slate-900">
              Target: {innings.total_runs + 1}
            </div>

            {!showSecondInningsSetup && (
              <button
                onClick={() => void startSecondInnings()}
                className="mt-4 w-full rounded-xl bg-[#0B4D2B] px-5 py-4 font-black text-white transition hover:bg-[#166534]"
              >
                START 2ND INNINGS
              </button>
            )}

            {showSecondInningsSetup && (
              <div className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div>
                  <div className="text-lg font-black text-slate-900">
                    Second Innings Opening Setup
                  </div>

                  <div className="text-sm text-slate-500">
                    Select the opening batters and bowler.
                  </div>
                </div>

                {/* STRIKER */}

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Opening Striker
                  </span>

                  <select
                    value={secondStrikerId}
                    onChange={(e) => setSecondStrikerId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-[#0B4D2B] focus:ring-2 focus:ring-green-100"
                  >
                    <option value="">Select female striker</option>

                    {battingPlayers
                      .filter((player) => isFemale(player))
                      .map((player) => (
                        <option
                          key={player.id}
                          value={player.id}
                          disabled={player.id === secondNonStrikerId}
                        >
                          {player.name}
                        </option>
                      ))}
                  </select>
                </label>

                {/* NON STRIKER */}

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Opening Non-Striker
                  </span>

                  <select
                    value={secondNonStrikerId}
                    onChange={(e) => setSecondNonStrikerId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-[#0B4D2B] focus:ring-2 focus:ring-green-100"
                  >
                    <option value="">Select female non-striker</option>

                    {battingPlayers
                      .filter((player) => isFemale(player))
                      .map((player) => (
                        <option
                          key={player.id}
                          value={player.id}
                          disabled={player.id === secondStrikerId}
                        >
                          {player.name}
                        </option>
                      ))}
                  </select>
                </label>

                {/* BOWLER */}

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Opening Bowler
                  </span>

                  <select
                    value={secondBowlerId}
                    onChange={(e) => setSecondBowlerId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-[#0B4D2B] focus:ring-2 focus:ring-green-100"
                  >
                    <option value="">Select female bowler</option>

                    {bowlingPlayers
                      .filter((player) => isFemale(player))
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                  </select>
                </label>

                <button
                  onClick={() => void confirmSecondInningsStart()}
                  className="w-full rounded-xl bg-[#0B4D2B] px-5 py-4 font-black text-white transition hover:bg-[#166534]"
                >
                  START INNINGS 2
                </button>
              </div>
            )}
          </div>
        )}

      {/* TIE */}

      {isTie && !showTieWinner && (
        <div className="rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-5">
          <div className="text-xl font-black text-yellow-900">MATCH TIED</div>

          <div className="mt-2 text-yellow-800">
            Both teams finished on the same score.
          </div>

          <button
            onClick={() => setShowTieWinner(true)}
            className="mt-4 w-full rounded-xl bg-yellow-500 px-5 py-4 font-black text-white"
          >
            SELECT WINNER
          </button>
        </div>
      )}

      {isTie && showTieWinner && (
        <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-5">
          <div className="text-xl font-black text-[#0B4D2B]">SELECT WINNER</div>

          <div className="mt-2 text-sm text-green-700">
            No Super Over. Select the team awarded the match.
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setTieWinnerId(innings.batting_team_id)}
              className={`rounded-xl p-4 font-black ${
                tieWinnerId === innings.batting_team_id
                  ? "bg-[#0B4D2B] text-white"
                  : "border border-slate-200 bg-white text-slate-900"
              }`}
            >
              {teamNames[innings.batting_team_id] ?? "Batting Team"}
            </button>

            <button
              onClick={() => setTieWinnerId(innings.bowling_team_id)}
              className={`rounded-xl p-4 font-black ${
                tieWinnerId === innings.bowling_team_id
                  ? "bg-[#0B4D2B] text-white"
                  : "border border-slate-200 bg-white text-slate-900"
              }`}
            >
              {teamNames[innings.bowling_team_id] ?? "Bowling Team"}
            </button>
          </div>

          <button
            onClick={() => void chooseTieWinner()}
            disabled={!tieWinnerId}
            className="mt-4 w-full rounded-xl bg-[#0B4D2B] px-5 py-4 font-black text-white disabled:opacity-40"
          >
            CONFIRM WINNER
          </button>
        </div>
      )}

      {/* MALE BATTER SELECTION */}

      {showMaleBatterSelection && (
        <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-5">
          <div className="text-xl font-black text-[#0B4D2B]">
            Opening Phase Complete
          </div>

          <p className="mt-1 text-sm text-green-700">
            Select the two batters for the normal phase.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Striker</span>

              <select
                value={nextStrikerId}
                onChange={(e) => setNextStrikerId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
              >
                <option value="">Select striker</option>

                {maleBattingPlayers
                  .filter((p) => p.id !== nextNonStrikerId)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Non-Striker
              </span>

              <select
                value={nextNonStrikerId}
                onChange={(e) => setNextNonStrikerId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
              >
                <option value="">Select non-striker</option>

                {maleBattingPlayers
                  .filter((p) => p.id !== nextStrikerId)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <button
            disabled={!nextStrikerId || !nextNonStrikerId || busy}
            onClick={() => void startNormalPhase()}
            className="mt-5 w-full rounded-xl bg-[#0B4D2B] px-5 py-4 font-black text-white disabled:opacity-50"
          >
            CONTINUE TO NORMAL PLAY
          </button>
        </div>
      )}

      {/* STATUS */}

      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 font-semibold text-[#0B4D2B]">
          {message}
        </div>
      )}

      {/* PLAYERS + LIVE STATS */}

      <div className="grid gap-4 md:grid-cols-3">
        {/* STRIKER */}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Striker
          </div>

          <div className="mt-2 text-xl font-black text-slate-900">
            {striker?.name ?? "Select batter"}
          </div>

          {striker && (
            <div className="mt-2">
              <span className="text-3xl font-black text-[#0B4D2B]">
                {strikerStats.runs}
              </span>

              <span className="ml-1 text-sm font-semibold text-slate-500">
                ({strikerStats.balls})
              </span>

              <div className="mt-1 text-xs text-slate-500">Runs (Balls)</div>
            </div>
          )}
        </div>

        {/* NON-STRIKER */}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Non-Striker
          </div>

          <div className="mt-2 text-xl font-black text-slate-900">
            {nonStriker?.name ?? "Select batter"}
          </div>

          {nonStriker && (
            <div className="mt-2">
              <span className="text-3xl font-black text-[#0B4D2B]">
                {nonStrikerStats.runs}
              </span>

              <span className="ml-1 text-sm font-semibold text-slate-500">
                ({nonStrikerStats.balls})
              </span>

              <div className="mt-1 text-xs text-slate-500">Runs (Balls)</div>
            </div>
          )}
        </div>

        {/* BOWLER */}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Bowler
          </div>

          <div className="mt-2 text-xl font-black text-slate-900">
            {bowler?.name ?? "Select bowler"}
          </div>

          {bowler && (
            <div className="mt-2">
              <span className="text-3xl font-black text-[#0B4D2B]">
                {bowlerStats.wickets}
              </span>

              <span className="mx-1 text-2xl font-black text-slate-300">/</span>

              <span className="text-3xl font-black text-[#0B4D2B]">
                {bowlerStats.runs}
              </span>

              <div className="mt-1 text-xs text-slate-500">Wickets / Runs</div>
            </div>
          )}

          <button
            onClick={() => setShowBowlerChange(true)}
            className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-[#0B4D2B] transition hover:bg-green-100"
          >
            Change Bowler
          </button>
        </div>
      </div>

      {/* SCORING */}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 font-black text-slate-900">Score</div>

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
          {[0, 1, 2, 3, 4, 6].map((runs) => (
            <button
              key={runs}
              disabled={busy || showBowlerChange}
              onClick={() => void addRuns(runs)}
              className="rounded-2xl border-2 border-slate-200 bg-white py-6 text-2xl font-black text-slate-900 shadow-sm transition hover:border-[#0B4D2B] hover:bg-green-50 active:scale-95 disabled:opacity-40"
            >
              {runs}
            </button>
          ))}

          <button
            disabled={busy || showBowlerChange}
            onClick={() => setShowOtherRuns(!showOtherRuns)}
            className="rounded-2xl border-2 border-[#0B4D2B] bg-green-50 py-6 text-lg font-black text-[#0B4D2B] shadow-sm transition hover:bg-green-100 active:scale-95 disabled:opacity-40"
          >
            OTHER
          </button>
        </div>

        {showOtherRuns && (
          <div className="mt-4 rounded-2xl border-2 border-green-200 bg-green-50 p-4">
            <div className="text-sm font-black text-[#0B4D2B]">
              Enter custom runs
            </div>

            <div className="mt-3 flex gap-3">
              <input
                type="number"
                min="0"
                step="1"
                value={otherRuns}
                onChange={(e) => setOtherRuns(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void addOtherRuns();
                  }
                }}
                placeholder="e.g. 7"
                autoFocus
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-bold text-slate-900 outline-none focus:border-[#0B4D2B] focus:ring-2 focus:ring-green-100"
              />

              <button
                disabled={busy || showBowlerChange || otherRuns === ""}
                onClick={() => void addOtherRuns()}
                className="rounded-xl bg-[#0B4D2B] px-6 py-3 font-black text-white disabled:opacity-40"
              >
                SAVE
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            disabled={busy || showBowlerChange}
            onClick={() => void addWide()}
            className="rounded-2xl bg-amber-500 p-5 font-black text-white"
          >
            WIDE
          </button>

          <button
            disabled={busy || showBowlerChange}
            onClick={() => void addNoBall()}
            className="rounded-2xl bg-blue-600 p-5 font-black text-white"
          >
            NO BALL
          </button>

          <button
            disabled={busy || showBowlerChange}
            onClick={() => setShowWicket(true)}
            className="rounded-2xl bg-red-600 p-5 font-black text-white"
          >
            WICKET
          </button>
        </div>
      </div>

      {/* UNDO */}

      <button
        disabled={busy || balls.length === 0}
        onClick={() => void undoLastBall()}
        className="w-full rounded-2xl border-2 border-red-200 bg-white p-4 font-black text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        ↶ UNDO LAST BALL
      </button>

      {/* WICKET PANEL */}

      {showWicket && (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-black text-red-900">
                Record Wicket
              </div>

              <div className="text-sm text-red-700">
                Select how the wicket occurred.
              </div>
            </div>

            <button
              onClick={() => setShowWicket(false)}
              className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm"
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {WICKET_TYPES.map((type) => (
              <button
                key={type}
                disabled={busy}
                onClick={() => void recordWicket(type)}
                className="rounded-xl bg-white p-4 text-left font-bold capitalize text-slate-900 shadow-sm transition hover:bg-red-100 disabled:opacity-50"
              >
                {type.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* NEW BATTER */}

      {innings.striker_id === null && innings.wickets > 0 && (
        <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-5">
          <div className="font-black text-[#0B4D2B]">Select next batter</div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {availableNewBatters.map((player) => (
              <button
                key={player.id}
                onClick={() => void selectNextBatter(player.id)}
                className="rounded-xl bg-white p-4 text-left font-bold text-slate-900 shadow-sm transition hover:bg-green-50"
              >
                {player.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FEMALE RETURN */}

      {eligibleReturns.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <button
            onClick={() => setShowReturn(!showReturn)}
            className="font-black text-[#0B4D2B]"
          >
            {showReturn ? "Hide" : "Show"} eligible return players
          </button>

          {showReturn && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {eligibleReturns.map((player) => (
                <button
                  key={player.id}
                  onClick={() => void returnFemale(player.id)}
                  className="rounded-xl bg-green-50 p-3 text-left font-bold text-[#0B4D2B] hover:bg-green-100"
                >
                  {player.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COMPLETE BALL HISTORY */}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black text-slate-900">Ball-by-Ball</h2>

          <span className="text-sm text-slate-500">{balls.length} events</span>
        </div>

        <div className="space-y-2">
          {balls
            .slice()
            .reverse()
            .map((ball) => {
              const ballStriker = playerMap.get(ball.striker_id);

              const ballBowler = playerMap.get(ball.bowler_id);

              return (
                <button
                  key={ball.id}
                  onClick={() => openEdit(ball)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#0B4D2B] hover:bg-green-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-14 text-sm font-black text-slate-400">
                        {ball.over_number}.{ball.ball_number}
                      </div>

                      <div>
                        <div className="font-bold text-slate-900">
                          {ballStriker?.name ?? "Unknown"}
                        </div>

                        <div className="text-xs text-slate-500">
                          vs {ballBowler?.name ?? "Unknown"}
                        </div>
                      </div>
                    </div>

                    <div className="text-xl font-black text-slate-900">
                      {ballLabel(ball)}
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* EDIT BALL MODAL */}

      {editingBall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">
                Edit Ball {editingBall.over_number}.{editingBall.ball_number}
              </h2>

              <button
                onClick={() => setEditingBall(null)}
                className="rounded-full bg-slate-100 px-3 py-2 font-bold text-slate-700"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="text-sm font-bold text-slate-700">Runs</label>

                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3, 4, 6].map((runs) => (
                    <button
                      key={runs}
                      onClick={() => setEditRuns(runs)}
                      className={`rounded-xl border p-3 font-black ${
                        editRuns === runs
                          ? "bg-[#0B4D2B] text-white"
                          : "bg-white text-slate-900"
                      }`}
                    >
                      {runs}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">
                  Event
                </label>

                <select
                  value={editEvent}
                  onChange={(e) => setEditEvent(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900"
                >
                  <option value="">Normal</option>

                  <option value="wide">Wide</option>

                  <option value="no_ball">No Ball</option>

                  <option value="female_wide">Opening phase wide</option>

                  <option value="female_no_ball">Opening phase no-ball</option>

                  <option value="female_protected_wicket">
                    Opening phase special dismissal
                  </option>
                </select>
              </div>

              <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={editWicket}
                  onChange={(e) => setEditWicket(e.target.checked)}
                  className="h-5 w-5"
                />

                <span className="font-bold text-slate-900">Wicket</span>
              </label>

              {editWicket && (
                <>
                  <div>
                    <label className="text-sm font-bold text-slate-700">
                      Wicket type
                    </label>

                    <select
                      value={editWicketType}
                      onChange={(e) => setEditWicketType(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900"
                    >
                      {WICKET_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-slate-700">
                      Dismissed player
                    </label>

                    <select
                      value={editDismissedPlayer}
                      onChange={(e) => setEditDismissedPlayer(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900"
                    >
                      <option value="">Select player</option>

                      {battingPlayers.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <button
                disabled={busy}
                onClick={() => void saveBallEdit()}
                className="w-full rounded-2xl bg-[#0B4D2B] p-4 font-black text-white transition hover:bg-[#166534] disabled:opacity-50"
              >
                SAVE CHANGES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
