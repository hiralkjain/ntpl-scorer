import { NavLink, Outlet } from "react-router-dom";
import { Activity, CalendarDays, Home, Trophy, Users } from "lucide-react";

const links = [
  ["/", "Home", Home],
  ["/live", "Live", Activity],
  ["/fixtures", "Fixtures", CalendarDays],
  ["/points", "Points", Trophy],
  ["/teams", "Teams", Users],
] as const;

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-[#1F4A38] bg-[#0B4D2B] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <NavLink to="/" className="font-black tracking-wide">
            NTPL BLR{" "}
            <span className="ml-2 text-xs font-normal text-green-100">
              LIVE CRICKET
            </span>
          </NavLink>

          <nav className="hidden gap-1 md:flex">
            {links.map(([to, label, Icon]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "text-green-50 hover:bg-white/10"
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>

          <NavLink
            to="/admin/login"
            className="rounded-lg border border-white/30 px-3 py-2 text-sm text-white hover:bg-white/10"
          >
            Admin
          </NavLink>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-[#1F4A38] bg-[#0B4D2B] md:hidden">
        {links.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-3 text-xs ${
                isActive ? "text-white" : "text-green-200"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
