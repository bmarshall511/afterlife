/**
 * Server-side family-friendly filter for calavera punchlines. Normalizes accents, case, leetspeak and
 * separator tricks ("s.h.i.t", "sh1t", "shiiit") before matching. Kept deliberately short and crude-only:
 * it is a safety net, the host can also hide entries.
 */
const WORDS = [
  "fuck", "fuk", "fck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "asshole", "bastard", "whore", "slut",
  "fag", "faggot", "nigger", "nigga", "retard", "twat", "wanker", "prick", "dildo", "porn", "penis", "vagina",
  "tits", "cum", "jizz", "rape", "rapist", "nazi", "hitler", "kys",
  // Spanish
  "puta", "puto", "pendejo", "pendeja", "chinga", "chingar", "chingada", "verga", "culero", "cabron", "cabrona",
  "mierda", "joto", "marica", "maricon", "pinche", "culo", "mamada", "panocha",
];
const LEET: Record<string, string> = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "|": "i" };

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ñ/g, "n")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0-9!@$+|]/g, (c) => LEET[c] ?? c);
}

const squeeze = (s: string) => s.replace(/(.)\1+/g, "$1");
const WORD_SET = new Set(WORDS.map((w) => squeeze(normalize(w))));
/** matched even inside a longer token ("shithead", "fuckin") */
const STRONG = ["fuck", "shit", "bitch", "cunt", "asshole", "nigger", "nigga", "faggot", "pendej", "chinga", "mierda", "verga", "culero", "maricon"].map((w) => squeeze(normalize(w)));

export function isFiltered(text: string): boolean {
  const n = normalize(text);
  const tokens = n.split(/[^a-z]+/).filter(Boolean).map(squeeze);
  for (const t of tokens) {
    if (WORD_SET.has(t) || WORD_SET.has(t.replace(/s$/, ""))) return true;
    if (STRONG.some((w) => t.includes(w))) return true;
  }
  // letters separated by dots/spaces/dashes: "f u c k", "s.h.i.t"
  const spaced = n.match(/(?:^|[^a-z])((?:[a-z][^a-z]{1,2}){2,}[a-z])(?=$|[^a-z])/g) ?? [];
  for (const sp of spaced) {
    const j = squeeze(sp.replace(/[^a-z]/g, ""));
    if (WORD_SET.has(j) || STRONG.some((w) => j.includes(w))) return true;
  }
  return false;
}
