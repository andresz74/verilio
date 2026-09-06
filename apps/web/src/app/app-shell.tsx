import {
  BarChart3,
  Building2,
  CalendarDays,
  Clock3,
  FolderKanban,
  Menu,
  ReceiptText,
  Settings,
  Timer,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, InlineError } from "@verilio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { ElapsedTime } from "../features/timer/elapsed-time.js";
import {
  getCurrentTimer,
  stopTimer,
  timerKeys,
} from "../features/timer/time-entry-api.js";

type NavigationItem = {
  icon: LucideIcon;
  label: string;
  to: string;
};

const navigationGroups: NavigationItem[][] = [
  [
    { icon: Timer, label: "Timer", to: "/timer" },
    { icon: CalendarDays, label: "Timesheet", to: "/timesheet" },
    { icon: BarChart3, label: "Reports", to: "/reports" },
  ],
  [
    { icon: Building2, label: "Clients", to: "/clients" },
    { icon: FolderKanban, label: "Projects", to: "/projects" },
  ],
  [{ icon: ReceiptText, label: "Invoices", to: "/invoices" }],
  [{ icon: Settings, label: "Settings", to: "/settings" }],
];

export function AppNavigation({
  onNavigate,
  timerIndicator,
}: {
  onNavigate?: (() => void) | undefined;
  timerIndicator?: ReactNode;
}) {
  return (
    <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navigationGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-1">
            {group.map(({ icon: Icon, label, to }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex min-h-10 items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)] ${
                    isActive
                      ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-active)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]"
                  }`
                }
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--color-border-default)] p-4">
        {timerIndicator ?? <IdleTimerIndicator />}
      </div>
    </nav>
  );
}

function IdleTimerIndicator() {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"><Clock3 aria-hidden="true" size={14} /> Timer</div>
      <p className="mb-0 mt-2 text-sm font-medium text-[var(--color-text-secondary)]">No timer running</p>
    </div>
  );
}

function RunningTimerIndicator({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const queryClient = useQueryClient();
  const currentQuery = useQuery({ queryKey: timerKeys.current, queryFn: getCurrentTimer });
  const stopMutation = useMutation({
    mutationFn: stopTimer,
    onSuccess: (response) => {
      queryClient.setQueryData(timerKeys.current, { timer: null, serverNow: response.serverNow });
      void queryClient.invalidateQueries({ queryKey: timerKeys.recent });
    },
  });
  const timer = currentQuery.data?.timer;
  if (!timer || !currentQuery.data) {
    return <IdleTimerIndicator />;
  }
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-accent-default)] bg-[var(--color-accent-subtle)] px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent-active)]"><Clock3 aria-hidden="true" size={14} /> Running</div>
      <NavLink to="/timer" onClick={onNavigate} className="mt-2 block truncate text-sm font-semibold text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]">{timer.description || "Untitled work"}</NavLink>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums"><ElapsedTime startAt={timer.startAt ?? currentQuery.data.serverNow} serverNow={currentQuery.data.serverNow} /></span>
        <Button size="sm" variant="secondary" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate()}>Stop</Button>
      </div>
      {stopMutation.isError ? <div className="mt-2"><InlineError>Stop failed. Timer is still running.</InlineError></div> : null}
    </div>
  );
}

export function AppShell() {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-bg-canvas)] lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden h-screen border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)] lg:sticky lg:top-0 lg:flex lg:flex-col">
        <Brand />
        <AppNavigation timerIndicator={<RunningTimerIndicator />} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface-translucent)] px-4 backdrop-blur lg:hidden">
          <Brand compact />
          <button
            type="button"
            aria-expanded={mobileNavigationOpen}
            aria-label={mobileNavigationOpen ? "Close navigation" : "Open navigation"}
            className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
            onClick={() => setMobileNavigationOpen((open) => !open)}
          >
            {mobileNavigationOpen ? (
              <X aria-hidden="true" size={21} />
            ) : (
              <Menu aria-hidden="true" size={21} />
            )}
          </button>
        </header>

        {mobileNavigationOpen ? (
          <div className="fixed inset-x-0 bottom-0 top-16 z-20 flex flex-col border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] lg:hidden">
            <AppNavigation
              onNavigate={() => setMobileNavigationOpen(false)}
              timerIndicator={
                <RunningTimerIndicator onNavigate={() => setMobileNavigationOpen(false)} />
              }
            />
          </div>
        ) : null}

        <Outlet />
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "h-16 border-b border-[var(--color-border-default)] px-5"}`}>
      <span className="grid size-8 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent-default)] text-sm font-bold text-[var(--color-text-inverse)]">
        V
      </span>
      <span className="text-base font-semibold tracking-tight">Verilio</span>
    </div>
  );
}

export function PageHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--color-border-default)] px-5 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-8 lg:px-10">
      <div>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h1>
        {description ? (
          <p className="mb-0 mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
