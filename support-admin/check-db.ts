import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || "" // Use service role if available for full visibility, or anon
);

async function checkDbState() {
  console.log("Checking chats and assignments...");
  
  const { data: chats, error: chatsError } = await supabase
    .from("chats")
    .select(`
      id,
      status,
      chat_assignments (
        current_manager_id
      )
    `);

  if (chatsError) {
    console.error("Chats error:", chatsError);
  } else {
    console.log("Chats count:", chats?.length);
    console.log("Samples:", JSON.stringify(chats?.slice(0, 3), null, 2));
  }

  const { data: managers, error: mgrError } = await supabase
    .from("managers")
    .select("id, display_name");

  if (mgrError) {
     console.error("Managers error:", mgrError);
  } else {
     console.log("Managers found:", managers?.length);
     console.log("Manager names:", managers?.map(m => m.display_name));
  }
}

checkDbState();
