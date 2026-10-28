/**
 * Researched factual content. Every record cites a source that was fetched and read on the
 * checked date; wording here is original paraphrase. See docs/CONTENT-SOURCES.md.
 * Rule: if a claim could not be confirmed in a fetched source it is NOT in this file.
 */
import type { ObjectKind } from "@/games/scenes/library";

export interface Source { title: string; url: string; verification: string }

const CHECKED = "checked 2026-10-27";

export const SOURCES = {
  unesco: {
    title: "UNESCO Intangible Cultural Heritage: Indigenous festivity dedicated to the dead",
    url: "https://ich.unesco.org/en/RL/indigenous-festivity-dedicated-to-the-dead-00054",
  },
  nmal: {
    title: "Smithsonian's National Museum of the American Latino: The Meaning of the Altar",
    url: "https://artsandculture.google.com/story/the-meaning-of-the-altar/_QUBc67lRPvBIQ",
  },
  tamu: {
    title: "Texas A&M College of Arts & Sciences: Sugar skulls are not Halloween candy",
    url: "https://liberalarts.tamu.edu/blog/sugar-skulls-are-not-halloween-candy/",
  },
  pbs: {
    title: "PBS NewsHour: How La Catrina became the iconic symbol for the Day of the Dead",
    url: "https://www.pbs.org/newshour/arts/how-la-catrina-became-the-iconic-symbol-for-the-day-of-the-dead",
  },
  unam: {
    title: "UNAM Global: Flor de cempasúchil, ícono del Día de Muertos",
    url: "https://unamglobal.unam.mx/global_revista/flor-de-cempasuchil-icono-del-dia-de-muertos/",
  },
} as const;
type SrcKey = keyof typeof SOURCES;
const src = (k: SrcKey, note: string): Source => ({ ...SOURCES[k], verification: `${note} (${CHECKED})` });

export interface TruthRecord { id: string; statement: string; isTrue: boolean; explanation: string; difficulty: 1 | 2 | 3; source: Source }

const T = (id: string, d: 1 | 2 | 3, isTrue: boolean, statement: string, explanation: string, k: SrcKey, note: string): TruthRecord =>
  ({ id: `truth-${id}`, statement, isTrue, explanation, difficulty: d, source: src(k, note) });

export const TRUTH: TruthRecord[] = [
  // ---- UNESCO
  T("unesco-2008", 2, true, "UNESCO lists Mexico's Indigenous festivity dedicated to the dead as Intangible Cultural Heritage of Humanity, inscribed in 2008.",
    "True. UNESCO's Representative List shows the Indigenous festivity dedicated to the dead inscribed in 2008.", "unesco", "Page states inscription in 2008 (3.COM)"),
  T("unesco-1995", 2, false, "UNESCO first recognised Mexico's festivity dedicated to the dead back in 1995.",
    "Invented. UNESCO's listing shows the festivity inscribed in 2008 (after first being proclaimed in 2003), not 1995.", "unesco", "Page states inscription 2008, originally proclaimed 2003"),
  T("timing", 1, true, "The festivity is celebrated each year from the end of October into the beginning of November.",
    "True. UNESCO describes the celebration as taking place at the end of October and the start of November.", "unesco", "Page gives end of October to beginning of November"),
  T("maize-end", 3, true, "UNESCO notes the festivity coincides with the completion of the yearly maize growing cycle.",
    "True. UNESCO links the timing to the end of the annual cycle of maize, Mexico's main food crop.", "unesco", "Page says it marks completion of annual maize cultivation cycle"),
  T("maize-start", 3, false, "The festivity marks the moment each year when farmers plant the first maize seeds.",
    "Invented. UNESCO connects the festivity to the completion of the maize cycle, the harvest end of the year, not to planting.", "unesco", "Page says completion of the maize cycle"),
  T("petal-path", 1, true, "In many communities families lay petals, candles and offerings along the way from the cemetery to the home.",
    "True. UNESCO describes families scattering flower petals and placing candles and offerings along the path from cemetery to home to help the souls return.", "unesco", "Page describes petals, candles, offerings along path cemetery to home"),
  T("fav-dishes", 1, true, "Families often prepare the favourite dishes of those they remember and place them near the home altar and the grave.",
    "True. UNESCO describes families preparing favourite dishes of the departed and setting them around the home altar and the tomb.", "unesco", "Page describes favourite dishes placed around home shrine and tomb"),
  T("fav-avoid", 1, false, "Tradition says the foods a loved one enjoyed should be kept off the altar.",
    "Invented. It is the opposite: UNESCO describes families preparing the favourite dishes of the departed and placing them on the altar and at the grave.", "unesco", "Page describes favourite dishes placed around home shrine and tomb"),
  T("syncretism", 2, true, "The celebration blends pre-Hispanic religious rites with Catholic feast days.",
    "True. UNESCO describes the festivity as a fusion of pre-Hispanic religious rites and Catholic feasts.", "unesco", "Page describes fusion of pre-Hispanic rites and Catholic feasts"),
  T("europe-only", 2, false, "The festivity grew entirely out of European customs brought to Mexico.",
    "Invented. UNESCO describes a blend: Indigenous belief systems and pre-Hispanic rites combined with Catholic feasts introduced from Europe.", "unesco", "Page describes fusion of pre-Hispanic rites and Catholic feasts"),
  T("cutouts", 1, true, "Paper cut-outs are among the handicrafts placed with offerings.",
    "True. UNESCO mentions handicrafts such as paper cut-outs alongside flowers and dishes.", "unesco", "Page mentions handicrafts such as paper cut-outs"),
  T("indigenous", 2, true, "UNESCO's listing names the Indigenous communities of Mexico as the people who keep this festivity.",
    "True. The UNESCO element is titled the Indigenous festivity dedicated to the dead and is practised by Indigenous communities of Mexico.", "unesco", "Page lists Indigenous communities of Mexico"),
  // ---- Smithsonian NMAL
  T("papel-wind", 1, true, "On many ofrendas, papel picado represents the element of wind.",
    "True. The Smithsonian's National Museum of the American Latino explains that tissue-paper cut-outs signify wind.", "nmal", "Page: wind is signified by papel picado"),
  T("papel-fire", 1, false, "On an ofrenda, papel picado is the object that represents fire.",
    "Invented. In the Smithsonian's explanation, papel picado stands for wind; lit candles stand for fire.", "nmal", "Page: wind = papel picado; fire = candles"),
  T("water-thirst", 1, true, "Water is offered so the spirits can quench their thirst after a long journey.",
    "True. The Smithsonian notes water is left in a pitcher or glass to quench the spirits' thirst after their journey.", "nmal", "Page: water quenches thirst of spirits after long journey"),
  T("water-wash", 1, false, "The glass of water on an ofrenda is there so visitors can wash their hands.",
    "Invented. The Smithsonian explains the water is offered to quench the thirst of the spirits after their long journey.", "nmal", "Page: water quenches thirst of spirits"),
  T("candle-guide", 1, true, "Candles on an ofrenda help guide and light the spirits' way.",
    "True. The Smithsonian describes candles as lighting the path that guides spirits to their ofrendas.", "nmal", "Page: candles guide and light the path"),
  T("candle-repel", 1, false, "Candles are placed on an ofrenda to keep the spirits from coming close.",
    "Invented. Candles welcome rather than repel: the Smithsonian says they guide and light the path of the spirits to the altar.", "nmal", "Page: candles guide and light the path"),
  T("bread-earth", 2, true, "Food, usually pan de muerto, often represents the element of earth on an ofrenda.",
    "True. The Smithsonian says the earth element is represented by food, usually pan de muerto.", "nmal", "Page: earth element represented by food, usually pan de muerto"),
  T("copal-prayer", 2, true, "Copal incense smoke is said to carry prayers upward.",
    "True. The Smithsonian describes copal smoke as carrying prayers to the heavens.", "nmal", "Page: copal smoke carries prayers"),
  T("copal-bread", 1, false, "Copal is a sweet bread shaped like crossed bones.",
    "Invented. Copal is a tree resin burned as incense; the bread decorated with bone shapes is pan de muerto.", "nmal", "Page describes copal as incense whose smoke carries prayers; pan de muerto as bread"),
  T("candle-size", 3, true, "Candle sizes on an altar can differ depending on whether it honours a child or an adult.",
    "True. The Smithsonian notes candles can come in different sizes depending on whether the altar is for a child or an adult.", "nmal", "Page: candle sizes differ for child or adult altars"),
  T("vary", 2, true, "How an ofrenda is decorated can depend on regional tradition, the family, and that year's harvest.",
    "True. The Smithsonian notes ornamentation varies with regional traditions, family circumstances, recent deaths and the harvest.", "nmal", "Page: ornamentation depends on regional traditions, wealth, recent deaths, harvest"),
  T("one-layout", 2, false, "Every ofrenda must follow one official layout used the same way everywhere.",
    "Invented. Ofrendas vary; the Smithsonian notes decoration depends on regional traditions and each family's circumstances.", "nmal", "Page: ornamentation depends on regional traditions"),
  T("photos", 1, true, "Ofrendas often hold photographs of the people being remembered.",
    "True. The Smithsonian notes altars hold photographs of the deceased.", "nmal", "Page: altars hold photographs of the deceased"),
  // ---- Texas A&M
  T("nov1-children", 2, true, "Many families dedicate November 1 to children who have died and November 2 to adults.",
    "True. Texas A&M's article explains November 1 is dedicated to children and November 2 to adults.", "tamu", "Article: Nov 1 children, Nov 2 adults"),
  T("nov-swap", 2, false, "November 2 is the day traditionally set aside for children, and November 1 for adults.",
    "Invented. It is the other way round: November 1 is commonly for children who have died and November 2 for adults.", "tamu", "Article: Nov 1 children, Nov 2 adults"),
  T("skull-name", 1, true, "Sugar skulls are often decorated with the name of the person they are given to or for.",
    "True. Texas A&M notes sugar skulls usually bear the name of the person to whom they are given.", "tamu", "Article: sugar skulls usually bear the recipient's name"),
  T("alfenique", 3, true, "Alfeñique, a sugar-paste technique brought by the Spanish, is used to make sugar figures.",
    "True. Texas A&M explains the Spanish brought alfeñique, which uses cane sugar to make a soft moldable paste.", "tamu", "Article: Spaniards brought alfeñique, cane sugar paste"),
  T("marigold-pest", 3, true, "Marigolds have been planted near crops because they act as a natural insect repellent.",
    "True. Texas A&M notes Indigenous communities planted marigolds near crops because they produce a natural insecticide.", "tamu", "Article: marigolds produce a natural insecticide, planted near crops"),
  T("halloween", 1, false, "Día de los Muertos started as a Mexican version of Halloween.",
    "Invented. Texas A&M notes Día de los Muertos predates Halloween and has its own deep roots in Mexican heritage; they are different celebrations.", "tamu", "Article: holiday predates Halloween"),
  // ---- PBS
  T("garbancera", 2, true, "Posada's skeleton lady was first titled La Calavera Garbancera.",
    "True. PBS NewsHour reports José Guadalupe Posada's engraving was first titled Calavera Garbancera.", "pbs", "Article: first titled Calavera Garbancera"),
  T("catrina-original", 2, false, "Posada himself gave his famous skeleton lady the name La Catrina.",
    "Invented. Posada titled her Calavera Garbancera; PBS reports the name Calavera Catrina came later, in a 1930 book of his engravings.", "pbs", "Article: renamed Calavera Catrina in a 1930 book"),
  T("rivera-1947", 2, true, "Diego Rivera placed La Catrina at the centre of his 1947 mural set in Alameda Park.",
    "True. PBS NewsHour describes Catrina as the focal point of Rivera's 1947 mural, Dream of a Sunday Afternoon in Alameda Park.", "pbs", "Article: 1947 mural Dream of a Sunday Afternoon in Alameda Park"),
  T("rivera-1847", 3, false, "Diego Rivera painted his famous Alameda Park mural with La Catrina in 1847.",
    "Invented. The mural dates from 1947, according to PBS NewsHour.", "pbs", "Article: mural dated 1947"),
  T("broadsides", 3, true, "Posada's skeleton illustrations were printed on inexpensive single-sheet broadsides.",
    "True. PBS NewsHour describes Posada's calaveras printed on cheap broadsides.", "pbs", "Article: calaveras printed on cheap broadsides"),
  // ---- UNAM
  T("cempa-mexico", 1, true, "The cempasúchil marigold is native to Mexico.",
    "True. UNAM Global quotes a UNAM anthropologist saying cempasúchil originates in Mexico.", "unam", "Article: cempasúchil es originario de México"),
  T("cempa-europe", 1, false, "The cempasúchil marigold first arrived in Mexico from Europe.",
    "Invented. According to UNAM, cempasúchil is native to Mexico.", "unam", "Article: cempasúchil es originario de México"),
  T("cempa-scent", 1, true, "In Mexican tradition, souls are said to follow the scent of cempasúchil petals to the offerings.",
    "True. UNAM Global explains souls are said to be guided by the petals' scent along a flower path to the offerings.", "unam", "Article: souls guided by scent of petals"),
  T("cempa-colors", 2, true, "Cempasúchil is now sold in several colours and mixes, not only orange.",
    "True. UNAM Global reports vendors selling cempasúchil in various colours and blends.", "unam", "Article: sold in several colours and mixes"),
];

/** Altar clue questions: symbol -> object kind, with per-clue exclusions to avoid ambiguity. */
export interface AltarClue { id: string; answer: ObjectKind; exclude: ObjectKind[]; prompts: string[]; explanation: string; source: Source }

export const ALTAR_SYMBOL_KINDS: ObjectKind[] = ["papel", "candle", "water", "bread", "copal", "marigold", "skull", "photo"];

export const ALTAR_CLUES: AltarClue[] = [
  { id: "wind", answer: "papel", exclude: [], prompts: ["Which object on this altar stands for WIND?", "Find the cut-paper decoration that represents the wind."],
    explanation: "Papel picado. The Smithsonian explains tissue-paper cut-outs represent wind on many ofrendas.", source: src("nmal", "Page: wind is signified by papel picado") },
  { id: "fire", answer: "candle", exclude: ["copal"], prompts: ["Which object stands for FIRE and lights the spirits' way?", "Which of these lights a path to the altar?"],
    explanation: "Candle. The Smithsonian describes lit candles as fire, guiding and lighting the path of the spirits.", source: src("nmal", "Page: candles = fire, guide and light the path") },
  { id: "water", answer: "water", exclude: [], prompts: ["Which object is left to quench a long journey's thirst?", "Which object represents the element of WATER?"],
    explanation: "Glass of water. The Smithsonian notes water is offered to quench the spirits' thirst after their journey.", source: src("nmal", "Page: water quenches thirst after long journey") },
  { id: "earth", answer: "bread", exclude: [], prompts: ["Which food usually represents EARTH on an ofrenda?", "Which object is the special bread decorated with bone shapes?"],
    explanation: "Pan de muerto. The Smithsonian says the earth element is represented by food, usually pan de muerto.", source: src("nmal", "Page: earth = food, usually pan de muerto") },
  { id: "copal", answer: "copal", exclude: ["candle"], prompts: ["Which object sends up smoke said to carry prayers?", "Which object burns fragrant resin incense?"],
    explanation: "Copal burner. The Smithsonian describes copal incense smoke as carrying prayers upward.", source: src("nmal", "Page: copal smoke carries prayers") },
  { id: "scent", answer: "marigold", exclude: [], prompts: ["Which FLOWER's scent is said to guide souls to the offering?", "Petals from which object are laid in paths to the altar?"],
    explanation: "Cempasúchil marigold. UNAM explains souls are said to follow the scent of its petals along a flower path.", source: src("unam", "Article: souls guided by scent of petals along flower path") },
  { id: "name", answer: "skull", exclude: ["photo"], prompts: ["Which sweet is often decorated with a person's name?", "Which object is made from sugar paste?"],
    explanation: "Sugar skull. Texas A&M notes sugar skulls usually bear a name and are shaped from alfeñique sugar paste.", source: src("tamu", "Article: sugar skulls bear names; alfeñique sugar paste") },
  { id: "photo", answer: "photo", exclude: ["skull"], prompts: ["Which object shows the faces of the people being remembered?", "Which object holds a photograph?"],
    explanation: "Photo frame. The Smithsonian notes altars hold photographs of the people being honoured.", source: src("nmal", "Page: altars hold photographs of the deceased") },
];

/** La Familia Dice: child-friendly opinions only. Never loved ones, grief, or authenticity. */
export const FAMILY: { id: string; prompt: string; promptEs?: string; options: { text: string; icon?: string }[] }[] = [
  { id: "food", prompt: "Which treat would your family bring to a celebration?", promptEs: "¿Qué llevarías a la fiesta?", options: [{ text: "Pan de muerto", icon: "bread" }, { text: "Tamales", icon: "plate" }, { text: "Fresh oranges", icon: "orange" }, { text: "Hot chocolate", icon: "cup" }] },
  { id: "flower-color", prompt: "Favourite marigold colour?", promptEs: "¿Color favorito de flor?", options: [{ text: "Bright orange" }, { text: "Sunny yellow" }, { text: "Deep red" }, { text: "Creamy white" }] },
  { id: "accessory", prompt: "Best accessory for a Catrina-style costume?", options: [{ text: "Flower crown" }, { text: "Big feathered hat" }, { text: "Lace fan" }, { text: "Ribbon shawl" }] },
  { id: "drink", prompt: "Favourite warm drink on a chilly night?", options: [{ text: "Hot chocolate", icon: "cup" }, { text: "Atole" }, { text: "Cinnamon tea" }, { text: "Warm milk" }] },
  { id: "decor", prompt: "Which decoration would you make first?", options: [{ text: "Papel picado", icon: "papel" }, { text: "Paper flowers", icon: "marigold" }, { text: "Painted candles", icon: "candle" }, { text: "Sugar-skull drawing", icon: "skull" }] },
  { id: "music", prompt: "Which instrument should play at the party?", options: [{ text: "Guitar", icon: "guitar" }, { text: "Trumpet" }, { text: "Violin" }, { text: "Drums" }] },
  { id: "creature", prompt: "Favourite animal to see painted on festive art?", options: [{ text: "Butterfly", icon: "butterfly" }, { text: "Hummingbird" }, { text: "Dog" }, { text: "Jaguar" }] },
  { id: "skull-deco", prompt: "How would you decorate a sugar skull?", options: [{ text: "Lots of flowers" }, { text: "Bright swirls" }, { text: "Sparkly glitter" }, { text: "Hearts and stars" }] },
  { id: "bread-shape", prompt: "Favourite part of pan de muerto?", options: [{ text: "Sugar on top" }, { text: "The round top bun" }, { text: "The bone shapes" }, { text: "The soft middle" }] },
  { id: "face-paint", prompt: "Favourite face-paint colour?", options: [{ text: "Gold" }, { text: "Purple" }, { text: "Pink" }, { text: "Blue" }] },
  { id: "parade", prompt: "What would you most like to see in a festive parade?", options: [{ text: "Giant puppets" }, { text: "Dancers" }, { text: "Marching band" }, { text: "Flower floats" }] },
  { id: "snack", prompt: "Pick a sweet snack to share", options: [{ text: "Sugar skulls", icon: "skull" }, { text: "Candied pumpkin" }, { text: "Churros" }, { text: "Fruit cups", icon: "orange" }] },
  { id: "craft", prompt: "Which craft sounds most fun?", options: [{ text: "Paper flowers" }, { text: "Cut-paper banners" }, { text: "Painting skulls" }, { text: "Making masks" }] },
  { id: "light", prompt: "Favourite way to light up the evening?", options: [{ text: "Candles", icon: "candle" }, { text: "Paper lanterns" }, { text: "String lights" }, { text: "Starry sky" }] },
  { id: "petal-path", prompt: "If you made a flower path, what shape would it be?", options: [{ text: "Straight line" }, { text: "Big swirl" }, { text: "Heart" }, { text: "Zig-zag" }] },
  { id: "dance", prompt: "Which dance move would your family do?", options: [{ text: "Spin" }, { text: "Twirl a skirt" }, { text: "Stomp to the beat" }, { text: "Wave arms" }] },
];
