import { redirect } from "next/navigation";
import { getAuthPageUser } from "./get-auth-page-user";

export async function redirectAuthenticatedUser() {
  const { user } = await getAuthPageUser();

  if (user) {
    redirect("/");
  }
}
