# Content sources

All factual records live in `src/content/facts.ts`. Each one has `source {title, url, verification}`. Every statement is our own paraphrase of a source that was fetched and read on **2026-10-27**. Invented statements in True or Invented are corrected in their explanation, and that correction cites the same source.

| Key | Source | Used for |
|---|---|---|
| unesco | [UNESCO ICH: Indigenous festivity dedicated to the dead (00054)](https://ich.unesco.org/en/RL/indigenous-festivity-dedicated-to-the-dead-00054) | Inscription in 2008 (proclaimed 2003); end of October to start of November; completion of the maize cycle; petals, candles and offerings on the path from cemetery to home; favourite dishes at the home altar and tomb; paper cut-outs; mix of pre-Hispanic and Catholic practices; Indigenous communities of Mexico |
| nmal | [Smithsonian National Museum of the American Latino: The Meaning of the Altar](https://artsandculture.google.com/story/the-meaning-of-the-altar/_QUBc67lRPvBIQ) | Water, wind (papel picado), fire (candles) and earth (food, usually pan de muerto); copal smoke carrying prayers; photographs; candle size for a child or an adult; decoration varying by region, family and harvest |
| tamu | [Texas A&M College of Arts & Sciences: Sugar skulls are not Halloween candy](https://liberalarts.tamu.edu/blog/sugar-skulls-are-not-halloween-candy/) | Nov 1 for children and Nov 2 for adults; names on sugar skulls; alfeñique; marigolds as a natural insecticide; the celebration predates Halloween |
| pbs | [PBS NewsHour: How La Catrina became the iconic symbol](https://www.pbs.org/newshour/arts/how-la-catrina-became-the-iconic-symbol-for-the-day-of-the-dead) | Calavera Garbancera; renamed Catrina in a 1930 book; Rivera's 1947 Alameda mural; broadsides |
| unam | [UNAM Global: Flor de cempasúchil](https://unamglobal.unam.mx/global_revista/flor-de-cempasuchil-icono-del-dia-de-muertos/) | Native to Mexico; souls follow the scent of the petals; sold in many colours |

## Dropped (could not be verified in an authoritative source that was fetched)
- What the name cempasúchil means: sources disagree ("twenty flowers" or "twenty petals"), and only news outlets were found.
- The meaning of salt on the altar, the meaning of altar levels, the Mixquic and Janitzio vigils, and the origins of calaveritas literarias: only news, blog or AI-labelled sources were found.
- When the sugar-skull and Posada traditions were first linked, and the 18th-century sugar-figure record: not confirmed.
- The Smithsonian NMAI Day of the Dead page and Britannica returned HTTP 403, and the gob.mx/INAH article URLs returned 404. No claims rely on them.

## Visual content
Memory, Hidden Detail, ¿Qué Es? and the altar layout questions come from seeded generators in `src/content/generators.ts`. They use the original SVG library in `src/games/scenes/library.ts`. Each answer is computed from the scene data, and `validate.ts` computes it again on its own. The altar layout questions say that the arrangement is illustrative and that real ofrendas vary.
