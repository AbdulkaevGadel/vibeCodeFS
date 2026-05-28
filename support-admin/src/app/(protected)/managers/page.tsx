import { redirect } from "next/navigation";
import { isAdminManager } from "@/entities/manager";
import {
  createManagerAccountAction,
  deleteUnlinkedAuthUserAction,
  updateManagerAction,
} from "@/features/manage-managers";
import { ManagersAdminPage } from "@/fsd-pages/managers-admin";
import { AdminHeader } from "@/widgets/admin-header";
import { logoutAction } from "../../_actions/logout";
import { getManagersAdminPageData } from "../../_lib/get-managers-admin-page-data";

export const dynamic = "force-dynamic";

export default async function ManagersPage() {
  const pageData = await getManagersAdminPageData();

  if (!isAdminManager(pageData.currentManager)) {
    redirect("/");
  }

  return (
    <ManagersAdminPage
      managers={pageData.allManagers}
      currentManager={pageData.currentManager}
      errorMessage={pageData.errorMessage}
      actions={{
        createManagerAccount: createManagerAccountAction,
        deleteUnlinkedAuthUser: deleteUnlinkedAuthUserAction,
        updateManager: updateManagerAction,
      }}
      renderHeaderShell={(headerProps) => (
        <AdminHeader
          {...headerProps}
          logoutAction={logoutAction}
        />
      )}
    />
  );
}
