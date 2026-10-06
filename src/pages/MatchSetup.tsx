import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Match, Team } from "../lib/types";

type Player = {
  id: string;
  team_id: string;
  name: string;
  jersey_number: number | null;
  role: string | null;
  gender: string | null;
};

type SquadRow = {
  player_id: string;
  team_id: string;
  is_playing: boolean;
  batting_position: number | null;
};

const isFemale = (player: Player) => player.gender?.toLowerCase() === "female";

export default function MatchSetup() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState<Match | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedA, setSelectedA] = useState<string[]>([]);
  const [selectedB, setSelectedB] = useState<string[]>([]);
  const [battingTeamId, setBattingTeamId] = useState("");
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!matchId) return;

    async function load() {
      setLoading(true);
      setMessage("");

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select("*")
        .eq("id", matchId)
        .single();

      if (matchError) {
        setMessage(matchError.message);
        setLoading(false);
        return;
      }

      const teamIds = [matchData.team_a_id, matchData.team_b_id].filter(
        Boolean,
      ) as string[];

      const [
        { data: teamData, error: teamError },
        { data: playerData, error: playerError },
      ] = await Promise.all([
        supabase
          .from("teams")
          .select("id,tournament_id,name,short_name,logo_url")
          .in("id", teamIds),
        supabase
          .from("players")
          .select("id,team_id,name,jersey_number,role,gender")
          .in("team_id", teamIds)
          .order("name"),
      ]);

      if (teamError || playerError) {
        setMessage(
          teamError?.message ??
            playerError?.message ??
            "Could not load match data.",
        );
        setLoading(false);
        return;
      }

      setMatch(matchData as Match);
      setTeams((teamData ?? []) as Team[]);
      setPlayers((playerData ?? []) as Player[]);

      const { data: squadData, error: squadError } = await supabase
        .from("match_squads")
        .select("player_id,team_id,is_playing,batting_position")
        .eq("match_id", matchId)
        .eq("is_playing", true)
        .order("batting_position", { ascending: true, nullsFirst: false });

      if (!squadError && squadData?.length) {
        const rows = squadData as SquadRow[];
        setSelectedA(
          rows
            .filter((r) => r.team_id === matchData.team_a_id)
            .map((r) => r.player_id),
        );
        setSelectedB(
          rows
            .filter((r) => r.team_id === matchData.team_b_id)
            .map((r) => r.player_id),
        );
      }

      setLoading(false);
    }

    void load();
  }, [matchId]);

  const teamA = teams.find((team) => team.id === match?.team_a_id);
  const teamB = teams.find((team) => team.id === match?.team_b_id);

  const battingPlayers = useMemo(
    () => players.filter((player) => player.team_id === battingTeamId),
    [players, battingTeamId],
  );

  const bowlingTeamId = useMemo(() => {
    if (!match || !battingTeamId) return "";
    return battingTeamId === match.team_a_id
      ? (match.team_b_id ?? "")
      : (match.team_a_id ?? "");
  }, [match, battingTeamId]);

  const bowlingPlayers = useMemo(
    () => players.filter((player) => player.team_id === bowlingTeamId),
    [players, bowlingTeamId],
  );

  const playingIds = battingTeamId === match?.team_a_id ? selectedA : selectedB;

  function femaleCount(ids: string[]) {
    return players.filter(
      (player) => ids.includes(player.id) && isFemale(player),
    ).length;
  }

  function togglePlayer(
    playerId: string,
    selected: string[],
    setter: Dispatch<SetStateAction<string[]>>,
  ) {
    setMessage("");

    if (selected.includes(playerId)) {
      setter(selected.filter((id) => id !== playerId));
      if (playerId === strikerId) setStrikerId("");
      if (playerId === nonStrikerId) setNonStrikerId("");
      if (playerId === bowlerId) setBowlerId("");
      return;
    }

    if (selected.length >= 9) {
      setMessage("Exactly 9 players are allowed in the playing 9.");
      return;
    }

    setter([...selected, playerId]);
  }

  function validate() {
    if (!matchId || !match) return "Match not found.";
    if (selectedA.length !== 9 || selectedB.length !== 9)
      return "Select exactly 9 players for both teams.";

    const femaleA = femaleCount(selectedA);
    const femaleB = femaleCount(selectedB);

    if (femaleA < 2 || femaleA > 4)
      return `${teamA?.name ?? "Team A"} must have 2–4 female players in the playing 9.`;
    if (femaleB < 2 || femaleB > 4)
      return `${teamB?.name ?? "Team B"} must have 2–4 female players in the playing 9.`;
    if (!battingTeamId) return "Select the batting team.";
    if (!strikerId || !nonStrikerId) return "Select both opening batters.";
    if (strikerId === nonStrikerId)
      return "Striker and non-striker must be different players.";
    if (!playingIds.includes(strikerId) || !playingIds.includes(nonStrikerId))
      return "Both opening batters must be in the playing 9.";
    if (!bowlerId) return "Select the opening bowler.";

    const striker = players.find((p) => p.id === strikerId);
    const nonStriker = players.find((p) => p.id === nonStrikerId);
    const bowler = players.find((p) => p.id === bowlerId);

    if (
      !striker ||
      !nonStriker ||
      !isFemale(striker) ||
      !isFemale(nonStriker)
    ) {
      return "Both opening batters must be female because overs 1–2 are female-only.";
    }
    if (!bowler || bowler.team_id !== bowlingTeamId || !isFemale(bowler)) {
      return "The opening bowler must be a female player from the bowling team.";
    }

    return "";
  }

  async function startMatch() {
    const errorMessage = validate();
    if (errorMessage) {
      setMessage(errorMessage);
      return;
    }

    if (!matchId || !match || !battingTeamId || !bowlingTeamId) return;

    setSaving(true);
    setMessage("");

    try {
      const orderedA = selectedA.map((playerId, index) => ({
        match_id: matchId,
        team_id: match.team_a_id,
        player_id: playerId,
        is_playing: true,
        batting_position: index + 1,
      }));

      const orderedB = selectedB.map((playerId, index) => ({
        match_id: matchId,
        team_id: match.team_b_id,
        player_id: playerId,
        is_playing: true,
        batting_position: index + 1,
      }));

      const { error: deleteError } = await supabase
        .from("match_squads")
        .delete()
        .eq("match_id", matchId);
      if (deleteError) throw deleteError;

      const { error: squadError } = await supabase
        .from("match_squads")
        .insert([...orderedA, ...orderedB]);
      if (squadError) throw squadError;

      // Only create innings if this match has not already been started.
      const { data: existingInnings, error: existingError } = await supabase
        .from("innings")
        .select("id")
        .eq("match_id", matchId)
        .limit(1);
      if (existingError) throw existingError;

      console.log("START INNINGS VALUES:", {
        strikerId,
        nonStrikerId,
        bowlerId,
        battingTeamId,
        bowlingTeamId,
      });
      if (!existingInnings?.length) {
        const { error: inningsError } = await supabase.from("innings").insert({
          match_id: matchId,
          innings_number: 1,
          batting_team_id: battingTeamId,
          bowling_team_id: bowlingTeamId,

          striker_id: strikerId,
          non_striker_id: nonStrikerId,
          current_bowler_id: bowlerId,

          total_runs: 0,
          wickets: 0,
          legal_balls: 0,

          overs_limit: 7,
          innings_status: "live",
          status: "live",

          started_at: new Date().toISOString(),
        });

        if (inningsError) throw inningsError;
      } else {
        const existingInningsId = existingInnings[0].id;

        const { error: inningsUpdateError } = await supabase
          .from("innings")
          .update({
            batting_team_id: battingTeamId,
            bowling_team_id: bowlingTeamId,

            striker_id: strikerId,
            non_striker_id: nonStrikerId,
            current_bowler_id: bowlerId,

            overs_limit: 7,
            innings_status: "live",
            status: "live",

            started_at: new Date().toISOString(),
          })
          .eq("id", existingInningsId);

        if (inningsUpdateError) {
          throw inningsUpdateError;
        }
      }

      const { error: matchError } = await supabase
        .from("matches")
        .update({ status: "live" })
        .eq("id", matchId);
      if (matchError) throw matchError;

      navigate(`/scorer/${matchId}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not start the match.",
      );
    } finally {
      setSaving(false);
    }
  }

  function playerButton(
    player: Player,
    selected: string[],
    setter: Dispatch<SetStateAction<string[]>>,
  ) {
    const active = selected.includes(player.id);
    return (
      <button
        key={player.id}
        type="button"
        onClick={() => togglePlayer(player.id, selected, setter)}
        className={`w-full rounded-xl border p-3 text-left transition ${
          active
            ? "border-slate-950 bg-slate-950 text-white"
            : "bg-white hover:bg-slate-50"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">{player.name}</div>
            <div
              className={`mt-1 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}
            >
              {isFemale(player) ? "Female" : "Male"}
              {player.jersey_number != null
                ? ` · #${player.jersey_number}`
                : ""}
              {player.role ? ` · ${player.role}` : ""}
            </div>
          </div>
          <span className="text-lg font-black">{active ? "✓" : "+"}</span>
        </div>
      </button>
    );
  }

  if (loading)
    return (
      <div className="rounded-2xl border bg-white p-6">
        Loading match setup...
      </div>
    );
  if (!match)
    return (
      <div className="rounded-2xl border bg-red-50 p-6 text-red-700">
        {message || "Match not found."}
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-bold text-slate-500">
          MATCH #{match.match_number}
        </p>
        <h1 className="text-3xl font-black">Match Setup</h1>
        <p className="mt-2 text-sm text-slate-500">
          Select the playing 9 and configure the female-only first two overs.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold">{teamA?.name ?? "Team A"}</h2>
              <p className="text-sm text-slate-500">2–4 females in playing 9</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black">{selectedA.length}/9</div>
              <div className="text-xs text-slate-500">
                F: {femaleCount(selectedA)}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {players
              .filter((p) => p.team_id === match.team_a_id)
              .map((p) => playerButton(p, selectedA, setSelectedA))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold">{teamB?.name ?? "Team B"}</h2>
              <p className="text-sm text-slate-500">2–4 females in playing 9</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black">{selectedB.length}/9</div>
              <div className="text-xs text-slate-500">
                F: {femaleCount(selectedB)}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {players
              .filter((p) => p.team_id === match.team_b_id)
              .map((p) => playerButton(p, selectedB, setSelectedB))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-bold">Opening setup — Overs 1 & 2</h2>
        <p className="mt-1 text-sm text-slate-500">
          Both batters and the bowler must be female.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Batting team</span>
            <select
              value={battingTeamId}
              onChange={(e) => {
                setBattingTeamId(e.target.value);
                setStrikerId("");
                setNonStrikerId("");
                setBowlerId("");
              }}
              className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
            >
              <option value="">Select team</option>
              {teamA && <option value={teamA.id}>{teamA.name}</option>}
              {teamB && <option value={teamB.id}>{teamB.name}</option>}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Opening bowler</span>
            <select
              value={bowlerId}
              onChange={(e) => setBowlerId(e.target.value)}
              disabled={!battingTeamId}
              className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
            >
              <option value="">Select female bowler</option>
              {bowlingPlayers
                .filter(isFemale)
                .filter((p) =>
                  (p.team_id === match.team_a_id
                    ? selectedA
                    : selectedB
                  ).includes(p.id),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Striker</span>
            <select
              value={strikerId}
              onChange={(e) => setStrikerId(e.target.value)}
              disabled={!battingTeamId}
              className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
            >
              <option value="">Select female striker</option>
              {battingPlayers
                .filter(isFemale)
                .filter((p) => playingIds.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Non-striker</span>
            <select
              value={nonStrikerId}
              onChange={(e) => setNonStrikerId(e.target.value)}
              disabled={!battingTeamId}
              className="mt-2 w-full rounded-xl border bg-white px-4 py-3"
            >
              <option value="">Select female non-striker</option>
              {battingPlayers
                .filter(isFemale)
                .filter((p) => playingIds.includes(p.id) && p.id !== strikerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>

      {message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {message}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void startMatch()}
        className="w-full rounded-2xl bg-slate-950 px-6 py-4 text-lg font-black text-white shadow-sm disabled:opacity-50"
      >
        {saving ? "STARTING MATCH..." : "START MATCH"}
      </button>
    </div>
  );
}
