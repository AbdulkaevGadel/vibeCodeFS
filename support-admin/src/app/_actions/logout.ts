"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function logoutAction() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout action failed", {
        error: {
          message: error.message,
          name: error.name,
        },
      });
    }
  } catch (error) {
    console.error("Logout action failed", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
            }
          : "Unknown error",
    });
  }

  redirect("/login");
}
