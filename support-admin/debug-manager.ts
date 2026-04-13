import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugManager() {
  const { data: managers, error } = await supabase
    .from("managers")
    .select("*");
    
  console.log("Managers in DB:", managers);
  
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  console.log("Auth Users:", users?.map(u => ({ id: u.id, email: u.email })));
}

debugManager();
