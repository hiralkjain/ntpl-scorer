import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AdminRoute() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (mounted) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (mounted) {
        setIsAdmin(!error && !!data);
        setLoading(false);
      }
    }

    void checkAdmin();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm font-bold text-slate-500">
          Checking admin access...
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
