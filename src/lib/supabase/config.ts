// Where to reach Supabase Auth. Both values are public (the publishable key
// only allows what Supabase's own security rules allow), which is why they
// start with NEXT_PUBLIC_.
//
// Returns null when they aren't set, for example in CI or on a computer that
// hasn't added them to .env.local yet. Everything that signs people in checks
// for null and quietly turns sign-in off instead of crashing the site.
export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
