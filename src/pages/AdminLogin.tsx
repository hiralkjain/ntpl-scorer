import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const navigate = useNavigate();

  const login = async (e: React.FormEvent) => {
    e.preventDefault();

    setBusy(true);
    setMsg("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      if (!data.user) {
        setMsg("Login failed.");
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (adminError || !admin) {
        await supabase.auth.signOut();
        setMsg("This account does not have admin access.");
        return;
      }

      navigate("/fixtures");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black">Staff Login</h1>

        <p className="mt-1 text-sm text-slate-500">Admin access only.</p>

        <form onSubmit={login} className="mt-6 space-y-4">
          <input
            className="w-full rounded-xl border px-4 py-3"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            className="w-full rounded-xl border px-4 py-3"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-50"
          >
            {busy ? "Checking..." : "Login"}
          </button>
        </form>

        {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}
      </div>
    </div>
  );
}
