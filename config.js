// Paste your TMDB key here. Get one free at https://www.themoviedb.org/settings/api
// Either the "API Key" (short) or the "API Read Access Token" (long, starts with eyJ) works.
// On Render these are filled in by build.sh from environment variables.
window.CONFIG = {
  TMDB_KEY: "",
  // Two-letter country code for "where to watch". Leave empty to auto-detect from the browser.
  REGION: "",
  // Supabase project for accounts, My List, ratings and comments (Project Settings -> API).
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
};
