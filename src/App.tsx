import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Loading from "./components/Loading";
import {
  getMatches,
  getTeams,
  getTournament,
  subscribeToTournament,
} from "./lib/tournament";
import type { Tournament, Team, Match } from "./lib/types";
import Home from "./pages/Home";
import Fixtures from "./pages/Fixtures";
import Points from "./pages/Points";
import Teams from "./pages/Teams";
import Live from "./pages/Live";
import LiveMatch from "./pages/LiveMatch";
import AdminLogin from "./pages/AdminLogin";
import MatchSetup from "./pages/MatchSetup";
import Scorer from "./pages/Scorer";
import AdminRoute from "./components/AdminRoute";
export default function App() {
  const [t, setT] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const x = await getTournament();
      const [a, b] = await Promise.all([getTeams(x.id), getMatches(x.id)]);
      setT(x);
      setTeams(a);
      setMatches(b);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tournament.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(
    () => (t ? subscribeToTournament(t.id, () => void load()) : undefined),
    [t?.id],
  );
  if (error)
    return (
      <div className="p-6">
        <div className="mx-auto mt-20 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
          {error}
          <p className="mt-2 text-sm">
            Check .env.local and your Supabase setup.
          </p>
        </div>
      </div>
    );
  if (!t) return <Loading />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={<Home tournament={t} teams={teams} matches={matches} />}
          />
          <Route
            path="/fixtures"
            element={<Fixtures matches={matches} teams={teams} />}
          />
          <Route
            path="/points"
            element={<Points teams={teams} matches={matches} />}
          />
          <Route path="/teams" element={<Teams teams={teams} />} />
          <Route
            path="/live"
            element={<Live matches={matches} teams={teams} />}
          />
          <Route path="/live/:matchId" element={<LiveMatch />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          <Route element={<AdminRoute />}>
            <Route path="/setup/:matchId" element={<MatchSetup />} />
            <Route path="/scorer/:matchId" element={<Scorer />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
