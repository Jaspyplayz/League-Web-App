// A PUUID is Riot's permanent ID for a player. Server Actions get one from the
// browser, and anyone can call them with anything, so they check it here
// before it goes near the database: a value Postgres refuses, such as one
// holding a NUL character, makes the query fail and files a Sentry error
// (decision record 0033).

// Riot's are 78 letters, digits, "-" and "_". The characters are what keep a
// NUL out; the length is loose so a change on Riot's side can't stop the
// Update button working.
const PUUID = /^[\w-]{1,100}$/;

// The typeof check comes first because .test() turns any value into text,
// so undefined would pass as "undefined".
export function isPuuid(value: unknown): value is string {
  return typeof value === "string" && PUUID.test(value);
}
