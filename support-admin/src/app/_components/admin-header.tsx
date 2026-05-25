import { ReactNode } from "react";
import { isAdminManager, type Manager } from "@/entities/manager";
import { Button } from "@/shared/ui/button";
import { logoutAction } from "../_actions/logout";
import { RefreshButton } from "../refresh-button";

const headerClassName = "support-panel-strong p-5 sm:p-6";
const headerLayoutClassName = "flex flex-col gap-5";
const headerTopClassName = "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between";
const headerTitleWrapperClassName = "flex flex-wrap items-baseline gap-x-4 gap-y-1";
const sectionTitleClassName = "support-text-secondary text-xs uppercase tracking-[0.35em]";
const headerTitleClassName = "support-text-primary text-3xl font-semibold tracking-tight";
const actionsWrapperClassName = "flex flex-wrap items-center gap-2 lg:justify-end";
const headerContentClassName = "grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]";

type AdminHeaderProps = {
  title: string;
  eyebrow?: string;
  currentManager: Manager | null;
  allManagers: Manager[];
  navigationHref: string;
  navigationLabel: string;
  navigationActive?: boolean;
  managersNavigationActive?: boolean;
  secondaryActions?: ReactNode;
  stats: ReactNode;
  sidePanel?: ReactNode;
  bottom?: ReactNode;
};

export function AdminHeader({
  title,
  eyebrow = "VibeCode Support",
  currentManager,
  navigationHref,
  navigationLabel,
  navigationActive = false,
  managersNavigationActive = false,
  secondaryActions,
  stats,
  sidePanel,
  bottom,
}: AdminHeaderProps) {
  return (
    <header className={headerClassName}>
      <div className={headerLayoutClassName}>
        <div className={headerTopClassName}>
          <div className={headerTitleWrapperClassName}>
            <p className={sectionTitleClassName}>{eyebrow}</p>
            <h1 className={headerTitleClassName}>{title}</h1>
          </div>

          <div className={actionsWrapperClassName}>
            <RefreshButton />

            <Button
              href={navigationHref}
              variant="secondary"
              active={navigationActive}
              size="sm"
            >
              {navigationLabel}
            </Button>

            {secondaryActions}

            {isAdminManager(currentManager) ? (
              <Button
                href="/managers"
                variant="secondary"
                active={managersNavigationActive}
                size="sm"
              >
                Менеджеры
              </Button>
            ) : null}

            <form action={logoutAction}>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Выйти
              </Button>
            </form>
          </div>
        </div>

        <div className={headerContentClassName}>
          {stats}
          {sidePanel}
        </div>
      </div>

      {bottom}
    </header>
  );
}
