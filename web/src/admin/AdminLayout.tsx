import { useQuery } from "@tanstack/react-query";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { api, APIError } from "@/lib/api";
import { Button, Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface Me {
  username: string;
}

const I = {
  inbox: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  link: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  config: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  logo: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  logout: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
};

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: "/admin", label: "邮箱", icon: I.inbox, end: true },
  { to: "/admin/tokens", label: "访问链接", icon: I.link },
  { to: "/admin/system-config", label: "系统配置", icon: I.config },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const me = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/api/admin/me"),
    retry: false,
  });

  async function logout() {
    await api.post("/api/admin/logout");
    navigate("/admin/login");
  }

  if (me.isLoading) {
    return <LoadingFrame label="正在加载分拣台…" />;
  }
  if (me.error) {
    const status = me.error instanceof APIError ? me.error.status : 0;
    if (status === 401) return <Navigate to="/admin/login" replace />;
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Panel className="max-w-md p-6 text-sm text-danger">{String(me.error)}</Panel>
      </div>
    );
  }

  const initials = (me.data?.username ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen md:flex md:h-screen md:overflow-hidden">
      <header className="sticky top-0 z-40 border-b-2 border-border bg-card px-4 py-3 shadow-hard md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Brand compact />
          <Button variant="ghost" size="sm" onClick={logout}>
            退出
          </Button>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {NAV.map((n) => (
            <MobileNavItem key={n.to} {...n} />
          ))}
        </nav>
      </header>

      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r-2 border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="border-b-2 border-sidebar-border p-5">
          <Brand />
        </div>

        <nav className="flex-1 space-y-2 p-4">
          <div className="px-2 pb-1 font-mono-display text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50">
            队列
          </div>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 border-2 px-3 py-3 font-mono-display text-xs font-bold uppercase tracking-[0.1em] transition-all",
                  isActive
                    ? "border-sidebar-accent bg-sidebar-accent text-sidebar"
                    : "border-transparent text-sidebar-foreground hover:border-sidebar-border hover:bg-sidebar-muted hover:text-sidebar-foreground-strong",
                )
              }
            >
              {n.icon}
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t-2 border-sidebar-border p-4">
          <div className="mb-3 flex items-center gap-3 border-2 border-sidebar-border bg-sidebar-muted p-3">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-sidebar-accent bg-sidebar text-sm font-black text-sidebar-foreground-strong">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-sidebar-foreground-strong">{me.data?.username}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full border-sidebar-border text-sidebar-foreground hover:bg-sidebar-muted hover:text-sidebar-foreground-strong">
            {I.logout}
            退出登录
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:h-screen md:overflow-hidden md:px-10 md:py-10">
        <div className="mx-auto h-full w-full max-w-[1220px] animate-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("postal-border shadow-hard", compact ? "h-10 w-10" : "h-12 w-12")}>
        <div className="flex h-full w-full items-center justify-center border-2 border-border bg-card text-accent">
          {I.logo}
        </div>
      </div>
      <div>
        <div className={cn("font-display font-black tracking-[-0.04em] text-sidebar-foreground-strong md:text-card", compact ? "text-2xl text-foreground" : "whitespace-nowrap text-[21px] leading-none")}>Cloudflare Email</div>
      </div>
    </div>
  );
}

function MobileNavItem({ to, label, end }: { to: string; label: string; icon: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "shrink-0 border-2 px-3 py-2 font-mono-display text-xs font-bold uppercase tracking-[0.1em]",
          isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
        )
      }
    >
      {label}
    </NavLink>
  );
}

function LoadingFrame({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Panel className="p-6 font-mono-display text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground" accent>
        {label}
      </Panel>
    </div>
  );
}
