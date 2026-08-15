// import { createClient } from '@supabase/supabase-js'

// const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
// const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// export const supabase = createClient(supabaseUrl, supabaseKey)

// // Server-side client (uses service role key for admin ops)
// export const supabaseAdmin = () =>
//   createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)




// import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// export const supabase = createClientComponentClient()




import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)