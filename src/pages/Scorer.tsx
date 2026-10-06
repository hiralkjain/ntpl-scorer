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

  const [editDismissedPlayer, setEditDismissedPlayer] = useState<string>("");
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
   * React-only modal state is rebuilt from persisted innings fields.
   * This makes refresh/navigation safe while a match is live.
   */
  useEffect(() => {
    if (!innings) return;

    const isCompleted = innings.innings_status === "completed";
    const isLive = !isCompleted;
    const atOpeningBoundary =
      innings.legal_balls >= FEMALE_PHASE_BALLS &&
      innings.striker_id === null &&
      innings.non_striker_id === null;

    setShowMaleBatterSelection(isLive && atOpeningBoundary);

    setShowBowlerChange(
      isLive && innings.current_bowler_id === null && !atOpeningBoundary,
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
  }, [innings]);

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

  const currentOverBalls = balls.filter(
    (ball) => ball.over_number === currentOver,
  );

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

    /*
     * Illegal deliveries (normal wide/no-ball after
     * the opening phase) do not advance the legal ball count.
     */
    const nextLegalBall = legalDelivery ? legalBall + 1 : legalBall;

    /*
     * Cricket notation:
     *
     * 0.1 - 0.6
     * 1.1 - 1.6
     * 2.1 - 2.6
     *
     * overNumber is stored/displayed as zero-based.
     */
    const overNumber = Math.floor(legalBall / 6);

    /*
     * For an illegal delivery, keep it attached to
     * the current over rather than consuming the next
     * legal ball.
     */
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

  async function startSecondInnings() {
    if (!innings) return;

    const targetRuns = innings.total_runs + 1;

    const battingTeamId = innings.bowling_team_id;
    const bowlingTeamId = innings.batting_team_id;

    const { data: existingSecond, error: existingError } = await supabase
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

    if (existingSecond) {
      notify("Second innings already exists.");
      return;
    }

    /*
     * Do not create innings 2 yet.
     *
     * First collect the three opening players.
     */
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

    // Do not allow another ball while selecting the
    // two batters after the opening phase.
    if (showMaleBatterSelection) {
      notify("Select the two batters to continue.");
      return;
    }

    setBusy(true);

    try {
      /*
       * Opening phase = first 12 LEGAL balls only.
       *
       * 0.1 -> 1.6 = opening phase
       * 2.0        = opening phase complete
       * 2.1 onward = normal cricket rules
       */
      const isOpeningPhase = (innings.legal_balls ?? 0) < FEMALE_PHASE_BALLS;
      const isFemaleWide = specialEvent === "female_wide";

      const isFemaleNoBall = specialEvent === "female_no_ball";

      const isWide = specialEvent === "wide" || isFemaleWide;

      const isNoBall = specialEvent === "no_ball" || isFemaleNoBall;
      /*
       * Normalize wide/no-ball according to the phase.
       *
       * Opening phase:
       * female wide/no-ball = 2 runs AND legal delivery
       *
       * After 2 overs:
       * normal wide/no-ball = 1 run AND illegal delivery
       */
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

      /*
       * Tournament has 7 overs = 42 legal balls.
       */
      if ((innings.legal_balls ?? 0) >= MAX_LEGAL_BALLS) {
        notify("7 overs are complete.");
        return;
      }

      /*
       * During the first 2 overs, all three active players
       * must be female.
       */
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

      /*
       * For the special -2 protected dismissal,
       * scoreAdjustment takes priority over normal runs.
       */
      const scoreDelta =
        scoreAdjustment !== 0 ? scoreAdjustment : finalTotalRuns;

      const newScore = innings.total_runs + scoreDelta;
      const targetReached =
        innings.innings_number === 2 &&
        innings.target_runs !== null &&
        newScore >= innings.target_runs;

      const newWickets = innings.wickets + (wicket ? 1 : 0);
      const wicketsRemaining = 9 - newWickets;

      /*
       * Only 9 wickets because 9 players play.
       */
      if (newWickets > 9) {
        notify("All 9 wickets have already fallen.");
        return;
      }

      /*
       * Start with current ends.
       */
      let nextStriker = innings.striker_id;
      let nextNonStriker = innings.non_striker_id;

      /*
       * Only runs scored by the batter change ends
       * automatically.
       *
       * Wide/no-ball extras do NOT change strike.
       */
      if (batterRuns % 2 !== 0) {
        const temp = nextStriker;
        nextStriker = nextNonStriker;
        nextNonStriker = temp;
      }

      /*
       * Six LEGAL balls complete an over.
       */
      const endOfOver = finalLegalDelivery && nextLegalBall % 6 === 0;

      /*
       * At the end of an over, the batters change ends.
       */
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
          /*
           * Team batting in innings 2 won by wickets.
           */
          matchWinner = innings.batting_team_id;
          matchResultType = "win";
          matchMargin = wicketsRemaining;
          matchMarginType = "wickets";
        } else if (newScore === innings.target_runs! - 1) {
          /*
           * Scores are equal.
           */
          matchWinner = null;
          matchResultType = "tie";
          matchMargin = null;
          matchMarginType = null;
        } else {
          /*
           * Team batting in innings 1 won by runs.
           */
          matchWinner = innings.bowling_team_id;
          matchResultType = "win";
          matchMargin = (innings.target_runs ?? 1) - 1 - newScore;
          matchMarginType = "runs";
        }
      }

      /*
       * A normal wicket removes the striker.
       *
       * Protected female dismissal does NOT set wicket=true,
       * so that batter remains during the opening phase.
       */
      if (wicket) {
        nextStriker = null;
      }

      /*
       * Is this the exact end of the first 2 overs?
       */
      const openingPhaseComplete = nextLegalBall === FEMALE_PHASE_BALLS;

      /*
       * Keep all duplicate run columns synchronized.
       */
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

        wides: specialEvent?.includes("wide") ? extrasRuns : 0,

        no_balls: specialEvent?.includes("no_ball") ? extrasRuns : 0,

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

        extras_runs: extrasRuns,

        total_runs: totalRuns,

        notes: null,
      };

      const { error } = await supabase.from("balls").insert(ballPayload);

      if (error) {
        throw error;
      }

      /*
       * DO NOT rebuild female eligibility here.
       *
       * female_return_eligible_ids is maintained by:
       *
       * 1. innings initialization
       * 2. specialDismissal()
       * 3. returnFemale()
       *
       * This prevents a female who had a protected dismissal
       * from being accidentally re-added.
       */
      let eligible = innings.female_return_eligible_ids ?? [];

      /*
       * Prepare innings update.
       */
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

      /*
       * At the end of every over, force a new bowler selection.
       */
      if (endOfOver) {
        updatePayload.current_bowler_id = null;
      }

      /*
       * Match completion.
       */
      if (inningsEnds) {
        updatePayload.innings_status = "completed";
        updatePayload.status = "completed";
        updatePayload.completed_at = new Date().toISOString();
        updatePayload.current_bowler_id = innings.current_bowler_id;
      }

      /*
       * At exactly 2.0:
       *
       * - opening phase is finished
       * - pause batting
       * - scorer must select two male batters
       *
       * We don't automatically select them.
       */
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

        /*
         * Automatically calculate MOM and WOM
         * after the match result has been saved.
         */
        try {
          const awards = await calculateAndSaveMatchAwards(innings.match_id);

          console.log("AUTOMATIC MATCH AWARDS:", {
            MOM: awards.mom?.playerName ?? "None",
            MOMScore: awards.mom?.totalImpact ?? 0,
            WOM: awards.wom?.playerName ?? "None",
            WOMScore: awards.wom?.totalImpact ?? 0,
          });
        } catch (awardError) {
          /*
           * Do not undo a completed match just because
           * the award calculation failed.
           */
          console.error("Failed to calculate automatic MOM/WOM:", awardError);
        }
      }

      /*
       * Update local state immediately.
       */
      setInnings({
        ...innings,
        ...updatePayload,
      });

      /*
       * 2.0 reached:
       * open male batter selection.
       */
      if (openingPhaseComplete && !inningsEnds) {
        setNextStrikerId("");
        setNextNonStrikerId("");
        setShowMaleBatterSelection(true);

        notify("Opening phase complete. Select the two batters.");
      }

      /*
       * Every over still gets a bowler picker.
       *
       * This includes the end of the second over.
       */
      if (endOfOver && !inningsEnds) {
        setShowBowlerChange(true);
      }

      if (inningsEnds) {
        setShowBowlerChange(false);
        setShowMaleBatterSelection(false);

        notify("7 overs complete.");
      } else if (endOfOver && !openingPhaseComplete) {
        notify(`Over ${overNumber} complete. Select next bowler.`);
      } else if (!openingPhaseComplete) {
        notify("Ball recorded.");
      }
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
   *
   * UI simply calls this "SPECIAL".
   *
   * The rule is automatic during first 2 overs.
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

    // The ball counts and the team loses 2 runs.
    // The batter remains on the crease during the opening phase,
    // but loses eligibility to return later.
    await recordBall({
      totalRuns: 0,
      scoreAdjustment: -2,
      specialEvent: "female_protected_wicket",
      legalDelivery: true,
      wicket: false,
      dismissedPlayerId: dismissedId,
    });

    // Remove this player from the list of females
    // who are eligible to return later.
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

    // Keep the local innings state synchronized.
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

    /*
     * First two overs must have
     * a female bowler.
     */
    if (femalePhase && !isFemale(selected)) {
      notify("Select a valid bowler for this phase.");
      return;
    }

    /*
     * Don't allow same bowler
     * consecutively after an over.
     */
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
   *
   * We delete the latest ball and then
   * rebuild innings state from all
   * remaining balls.
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

    /*
     * Recalculate score.
     */
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

    /*
     * State before the latest ball
     * can be reconstructed using the
     * striker/non-striker stored on
     * the latest remaining ball.
     */
    let strikerId: string | null = null;

    let nonStrikerId: string | null = null;

    let bowlerId: string | null = null;

    if (history.length > 0) {
      const last = history[history.length - 1];

      strikerId = last.striker_id;

      nonStrikerId = last.non_striker_id;

      bowlerId = last.bowler_id;

      /*
       * Reconstruct end position
       * from all balls after the
       * last stored player state.
       */
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

      /*
       * Real wicket means the striker
       * needs a replacement.
       */
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
      /*
       * Special protected event:
       * score adjustment = -2
       */
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
      <div className="p-8 text-center font-semibold">Loading scorer...</div>
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
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      {/* HEADER */}

      <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
              Live Scoring
            </div>

            <div className="mt-2 text-6xl font-black">
              {innings.total_runs}/{innings.wickets}
            </div>

            <div className="mt-2 text-lg text-slate-300">
              {oversText(innings.legal_balls)} / {innings.overs_limit}.0 overs
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 px-5 py-4">
            <div className="text-xs font-bold text-slate-400">CURRENT OVER</div>

            <div className="mt-1 text-3xl font-black">{currentOver}</div>

            <div className="text-sm text-slate-300">
              {ballsInCurrentOver}
              /6 balls
            </div>
          </div>
        </div>
      </div>

      {/* OVER COMPLETE */}

      {showBowlerChange && (
        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-5">
          <div className="text-xl font-black text-blue-900">
            OVER {currentOver - 1} COMPLETE
          </div>

          <div className="mt-1 text-sm text-blue-700">
            Select the bowler for Over {currentOver}.
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {bowlingPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => void selectBowler(player.id)}
                className="rounded-xl bg-white p-4 text-left font-bold shadow-sm"
              >
                {player.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {innings?.innings_number === 1 &&
        innings?.innings_status === "completed" && (
          <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-5">
            <div className="text-xl font-black text-green-900">
              INNINGS COMPLETE
            </div>

            <div className="mt-2 text-green-800">
              {innings.total_runs}/{innings.wickets} in{" "}
              {oversText(innings.legal_balls)} overs
            </div>

            <div className="mt-4 text-lg font-black">
              Target: {innings.total_runs + 1}
            </div>

            {!showSecondInningsSetup && (
              <button
                onClick={() => void startSecondInnings()}
                className="mt-4 w-full rounded-xl bg-green-600 px-5 py-4 font-black text-white"
              >
                START 2ND INNINGS
              </button>
            )}

            {showSecondInningsSetup && (
              <div className="mt-5 space-y-4 rounded-2xl border bg-white p-5">
                <div>
                  <div className="text-lg font-black">
                    Second Innings Opening Setup
                  </div>

                  <div className="text-sm text-slate-500">
                    Select the opening batters and bowler.
                  </div>
                </div>

                {/* STRIKER */}
                <label className="block">
                  <span className="text-sm font-semibold">Opening Striker</span>

                  <select
                    value={secondStrikerId}
                    onChange={(e) => setSecondStrikerId(e.target.value)}
                    className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
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
                  <span className="text-sm font-semibold">
                    Opening Non-Striker
                  </span>

                  <select
                    value={secondNonStrikerId}
                    onChange={(e) => setSecondNonStrikerId(e.target.value)}
                    className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
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
                  <span className="text-sm font-semibold">Opening Bowler</span>

                  <select
                    value={secondBowlerId}
                    onChange={(e) => setSecondBowlerId(e.target.value)}
                    className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
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
                  className="w-full rounded-xl bg-green-600 px-5 py-4 font-black text-white"
                >
                  START INNINGS 2
                </button>
              </div>
            )}
          </div>
        )}
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
        <div className="rounded-2xl border-2 border-purple-300 bg-purple-50 p-5">
          <div className="text-xl font-black text-purple-900">
            SELECT WINNER
          </div>

          <div className="mt-2 text-sm text-purple-700">
            No Super Over. Select the team awarded the match.
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setTieWinnerId(innings.batting_team_id)}
              className={`rounded-xl p-4 font-black ${
                tieWinnerId === innings.batting_team_id
                  ? "bg-purple-600 text-white"
                  : "bg-white"
              }`}
            >
              {teamNames[innings.batting_team_id] ?? "Batting Team"}
            </button>

            <button
              onClick={() => setTieWinnerId(innings.bowling_team_id)}
              className={`rounded-xl p-4 font-black ${
                tieWinnerId === innings.bowling_team_id
                  ? "bg-purple-600 text-white"
                  : "bg-white"
              }`}
            >
              {teamNames[innings.bowling_team_id] ?? "Bowling Team"}
            </button>
          </div>

          <button
            onClick={() => void chooseTieWinner()}
            disabled={!tieWinnerId}
            className="mt-4 w-full rounded-xl bg-green-600 px-5 py-4 font-black text-white disabled:opacity-40"
          >
            CONFIRM WINNER
          </button>
        </div>
      )}
      {showMaleBatterSelection && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <div className="text-xl font-black text-amber-900">
            Opening Phase Complete
          </div>

          <p className="mt-1 text-sm text-amber-700">
            Select the two batters for the normal phase.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Striker</span>

              <select
                value={nextStrikerId}
                onChange={(e) => setNextStrikerId(e.target.value)}
                className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
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
                className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
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
            className="mt-5 w-full rounded-xl bg-amber-600 px-5 py-4 font-black text-white disabled:opacity-50"
          >
            Continue to Normal Play
          </button>
        </div>
      )}

      {/* STATUS */}

      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 font-semibold text-blue-800">
          {message}
        </div>
      )}

      {/* PLAYERS */}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-xs font-bold uppercase text-slate-400">
            Striker
          </div>

          <div className="mt-2 text-xl font-black">
            {striker?.name ?? "Select batter"}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="text-xs font-bold uppercase text-slate-400">
            Non-Striker
          </div>

          <div className="mt-2 text-xl font-black">
            {nonStriker?.name ?? "Select batter"}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="text-xs font-bold uppercase text-slate-400">
            Bowler
          </div>

          <div className="mt-2 text-xl font-black">
            {bowler?.name ?? "Select bowler"}
          </div>

          <button
            onClick={() => setShowBowlerChange(true)}
            className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold"
          >
            Change Bowler
          </button>
        </div>
      </div>

      {/* THIS OVER */}

      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black">This Over</h2>

          <span className="text-sm text-slate-500">Over {currentOver}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {currentOverBalls.length === 0 ? (
            <span className="text-sm text-slate-400">
              No balls recorded yet.
            </span>
          ) : (
            currentOverBalls.map((ball) => (
              <button
                key={ball.id}
                onClick={() => openEdit(ball)}
                className="flex h-12 min-w-12 items-center justify-center rounded-full bg-slate-100 px-3 font-black hover:bg-slate-200"
              >
                {ballLabel(ball)}
              </button>
            ))
          )}
        </div>
      </div>

      {/* SCORING */}

      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-4 font-black">Score</div>

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[0, 1, 2, 3, 4, 6].map((runs) => (
            <button
              key={runs}
              disabled={busy || showBowlerChange}
              onClick={() => void addRuns(runs)}
              className="rounded-2xl border-2 bg-white py-6 text-2xl font-black shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-40"
            >
              {runs}
            </button>
          ))}
        </div>

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
                className="rounded-xl bg-white p-4 text-left font-bold capitalize shadow-sm transition hover:bg-red-100 disabled:opacity-50"
              >
                {type.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* NEW BATTER */}

      {innings.striker_id === null && innings.wickets > 0 && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <div className="font-black text-emerald-900">Select next batter</div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {availableNewBatters.map((player) => (
              <button
                key={player.id}
                onClick={() => void selectNextBatter(player.id)}
                className="rounded-xl bg-white p-4 text-left font-bold shadow-sm"
              >
                {player.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FEMALE RETURN */}

      {eligibleReturns.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <button
            onClick={() => setShowReturn(!showReturn)}
            className="font-black"
          >
            {showReturn ? "Hide" : "Show"} eligible return players
          </button>

          {showReturn && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {eligibleReturns.map((player) => (
                <button
                  key={player.id}
                  onClick={() => void returnFemale(player.id)}
                  className="rounded-xl bg-slate-100 p-3 text-left font-bold"
                >
                  {player.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COMPLETE BALL HISTORY */}

      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black">Ball-by-Ball</h2>

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
                  className="w-full rounded-xl border bg-white p-3 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-14 text-sm font-black text-slate-400">
                        {ball.over_number}.{ball.ball_number}
                      </div>

                      <div>
                        <div className="font-bold">
                          {ballStriker?.name ?? "Unknown"}
                        </div>

                        <div className="text-xs text-slate-500">
                          vs {ballBowler?.name ?? "Unknown"}
                        </div>
                      </div>
                    </div>

                    <div className="text-xl font-black">{ballLabel(ball)}</div>
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
              <h2 className="text-xl font-black">
                Edit Ball {editingBall.over_number}.{editingBall.ball_number}
              </h2>

              <button
                onClick={() => setEditingBall(null)}
                className="rounded-full bg-slate-100 px-3 py-2 font-bold"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="text-sm font-bold">Runs</label>

                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3, 4, 6].map((runs) => (
                    <button
                      key={runs}
                      onClick={() => setEditRuns(runs)}
                      className={`rounded-xl border p-3 font-black ${
                        editRuns === runs
                          ? "bg-slate-900 text-white"
                          : "bg-white"
                      }`}
                    >
                      {runs}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-bold">Event</label>

                <select
                  value={editEvent}
                  onChange={(e) => setEditEvent(e.target.value)}
                  className="mt-2 w-full rounded-xl border p-3"
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

                <span className="font-bold">Wicket</span>
              </label>

              {editWicket && (
                <>
                  <div>
                    <label className="text-sm font-bold">Wicket type</label>

                    <select
                      value={editWicketType}
                      onChange={(e) => setEditWicketType(e.target.value)}
                      className="mt-2 w-full rounded-xl border p-3"
                    >
                      {WICKET_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-bold">
                      Dismissed player
                    </label>

                    <select
                      value={editDismissedPlayer}
                      onChange={(e) => setEditDismissedPlayer(e.target.value)}
                      className="mt-2 w-full rounded-xl border p-3"
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
                className="w-full rounded-2xl bg-slate-950 p-4 font-black text-white disabled:opacity-50"
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
