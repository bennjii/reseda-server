import { createClient } from "@supabase/supabase-js";

const supabase = createClient("https://xsmomhokxpwacbhotdmk.supabase.co", process.env.KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDU4MTE3MiwiZXhwIjoxOTU2MTU3MTcyfQ.nGtdGflJcGTdegPJwg3FkSQJvKz_VGNzmmml2hj6rQg") 

export default supabase;