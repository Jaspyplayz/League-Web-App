// The champion search box over the match list. Spelling champion names is
// fiddly ("Kai'Sa", "Nunu & Willump", "Lee Sin"), so both the name and what
// you typed are reduced to lowercase letters and digits before comparing.
// "kaisa", "lee sin" and "leesin" all find their champion.

function simplify(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// True if the champion's name contains the query. An empty query matches
// everything, so clearing the box shows every game again.
export function matchesChampion(championName: string, query: string): boolean {
  return simplify(championName).includes(simplify(query));
}
