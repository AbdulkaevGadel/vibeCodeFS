import { ManagersAdminPanel } from "@/widgets/managers-admin";
import type { ManagersAdminPageProps } from "../model";
import styles from "./managers-admin-page.module.css";
import { ManagersCurrentUserPanel } from "./parts/managers-current-user-panel";
import { ManagersHeaderStats } from "./parts/managers-header-stats";

const errorAlertClassName = "mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700";

export function ManagersAdminPage({
  managers,
  currentManager,
  errorMessage,
  actions,
  renderHeaderShell,
}: ManagersAdminPageProps) {
  const adminCount = managers.filter((manager) => manager.role === "admin").length;
  const supportCount = managers.filter((manager) => manager.role === "support").length;
  const supervisorCount = managers.filter((manager) => manager.role === "supervisor").length;

  return (
    <main className={styles.pageMain}>
      <div className={styles.pageContent}>
        {renderHeaderShell({
          title: "Менеджеры",
          allManagers: managers,
          currentManager,
          navigationHref: "/",
          navigationLabel: "← Вернуться к чатам",
          managersNavigationActive: true,
          stats: (
            <ManagersHeaderStats
              adminCount={adminCount}
              supervisorCount={supervisorCount}
              supportCount={supportCount}
            />
          ),
          sidePanel: currentManager ? (
            <ManagersCurrentUserPanel manager={currentManager} />
          ) : null,
        })}

        {errorMessage ? (
          <div className={errorAlertClassName}>{errorMessage}</div>
        ) : (
          <ManagersAdminPanel
            managers={managers}
            actions={actions}
          />
        )}
      </div>
    </main>
  );
}
