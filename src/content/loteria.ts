/**
 * La Lotería — original riddle verses pointing at classic lotería-style subjects.
 * Card art is original SVG in src/games/scenes/icons.tsx (icon id = `lot-<card>`); no commercial card art is copied.
 * `near` lists distractors that share traits with the answer; the rest of the grid is filled deterministically.
 */
export interface LoteriaCard { id: string; es: string; en: string; tags: string[] }

export const CARDS: LoteriaCard[] = [
  { id: "sol", es: "El Sol", en: "The Sun", tags: ["sky", "light", "round", "hot"] },
  { id: "luna", es: "La Luna", en: "The Moon", tags: ["sky", "light", "night", "round"] },
  { id: "estrella", es: "La Estrella", en: "The Star", tags: ["sky", "light", "night", "points"] },
  { id: "corazon", es: "El Corazón", en: "The Heart", tags: ["body", "love", "red"] },
  { id: "sirena", es: "La Sirena", en: "The Mermaid", tags: ["water", "person", "song", "fish"] },
  { id: "catrin", es: "El Catrín", en: "The Dandy", tags: ["person", "fancy", "hat"] },
  { id: "dama", es: "La Dama", en: "The Lady", tags: ["person", "fancy"] },
  { id: "arbol", es: "El Árbol", en: "The Tree", tags: ["plant", "tall", "wood"] },
  { id: "escalera", es: "La Escalera", en: "The Ladder", tags: ["tall", "wood", "steps"] },
  { id: "pescado", es: "El Pescado", en: "The Fish", tags: ["water", "animal", "fish"] },
  { id: "calavera", es: "La Calavera", en: "The Skull", tags: ["body", "bone", "death"] },
  { id: "rosa", es: "La Rosa", en: "The Rose", tags: ["plant", "love", "red", "thorn"] },
  { id: "valiente", es: "El Valiente", en: "The Brave One", tags: ["person", "blade"] },
  { id: "gallo", es: "El Gallo", en: "The Rooster", tags: ["animal", "bird", "morning", "song"] },
  { id: "mano", es: "La Mano", en: "The Hand", tags: ["body", "five"] },
  { id: "paraguas", es: "El Paraguas", en: "The Umbrella", tags: ["water", "shade", "object"] },
  { id: "campana", es: "La Campana", en: "The Bell", tags: ["sound", "metal", "object", "tall"] },
  { id: "musico", es: "El Músico", en: "The Musician", tags: ["person", "sound", "song"] },
  { id: "nopal", es: "El Nopal", en: "The Prickly Pear", tags: ["plant", "thorn", "green"] },
  { id: "venado", es: "El Venado", en: "The Deer", tags: ["animal", "forest"] },
  { id: "arana", es: "La Araña", en: "The Spider", tags: ["animal", "eight", "small"] },
  { id: "alacran", es: "El Alacrán", en: "The Scorpion", tags: ["animal", "eight", "sting", "small"] },
  { id: "bota", es: "La Bota", en: "The Boot", tags: ["object", "leather", "walk"] },
  { id: "mundo", es: "El Mundo", en: "The World", tags: ["round", "everything"] },
];

export interface LoteriaRiddle { id: string; card: string; difficulty: 1 | 2 | 3; verse: string; why: string; near: string[]; source?: { title: string; url: string; verification: string } }

const AGN = { title: "Archivo General de la Nación (gob.mx): Conoce los Símbolos Nacionales", url: "https://www.gob.mx/agn/articulos/conoce-los-simbolos-nacionales-elementos-fundamentales-de-nuestra-identidad", verification: "Official description of the national coat of arms: an eagle in left profile with its claw resting on a nopal that grows from a rock in a lake, linked to the Mexica founding sign. Checked 2026-10-27." };
const TAMU = { title: "Texas A&M College of Arts & Sciences: Sugar skulls are not Halloween candy", url: "https://liberalarts.tamu.edu/blog/sugar-skulls-are-not-halloween-candy/", verification: "States that names are written on sugar skulls placed for the dead. Checked 2026-10-27." };

export const RIDDLES: LoteriaRiddle[] = [
  // ——— difficulty 1: fairly direct ———
  { id: "lot-sol-1", card: "sol", difficulty: 1, verse: "I clock in at dawn and I never take shade;\nI ripen your mangoes and melt your lemonade.", why: "Dawn shift, no shade, ripening fruit — the Sun works the long hours.", near: ["luna", "estrella", "mundo"] },
  { id: "lot-luna-1", card: "luna", difficulty: 1, verse: "I borrow my glow and I never pay back;\neach month I go thin, then I put the weight back.", why: "Moonlight is borrowed sunlight, and the phases wax and wane every month.", near: ["sol", "estrella", "mundo"] },
  { id: "lot-corazon-1", card: "corazon", difficulty: 1, verse: "I keep the beat for every dance you dare,\nand break, they say, when someone isn’t there.", why: "The heartbeat keeps time — and gets ‘broken’ by love.", near: ["rosa", "mano", "calavera"] },
  { id: "lot-sirena-1", card: "sirena", difficulty: 1, verse: "Half of me swims and half of me sings;\nsailors, beware what my melody brings.", why: "Half fish, half singer, famously bad news for sailors: the Mermaid.", near: ["pescado", "musico", "dama"] },
  { id: "lot-escalera-1", card: "escalera", difficulty: 1, verse: "Step on me, step on me, all the way up —\nbut don’t walk beneath me, or you’re out of luck.", why: "You climb a ladder rung by rung, and walking under one is supposedly bad luck.", near: ["arbol", "campana", "bota"] },
  { id: "lot-paraguas-1", card: "paraguas", difficulty: 1, verse: "I open up only when weather is grey,\nthen everyone fights me when wind comes to play.", why: "Opened in the rain, flipped inside out by the wind: the Umbrella.", near: ["campana", "bota", "luna"] },
  { id: "lot-gallo-1", card: "gallo", difficulty: 1, verse: "No alarm clock needed, I’m loud and I’m proud;\nI crow before sunrise and wake up the crowd.", why: "The rooster is the original alarm clock.", near: ["musico", "sol", "venado"] },
  { id: "lot-alacran-1", card: "alacran", difficulty: 1, verse: "Eight legs, two pincers, a tail that curls high —\nshake out your boots, or you’ll soon find out why.", why: "Pincers plus a curled stinging tail — and a fondness for hiding in boots.", near: ["arana", "bota", "nopal"] },
  { id: "lot-campana-1", card: "campana", difficulty: 1, verse: "I live in a tower, I’ve a tongue but no mouth;\nwhen I swing, the whole village hears north to south.", why: "A bell’s clapper is called its tongue, and church bells carry across town.", near: ["musico", "escalera", "gallo"] },
  { id: "lot-bota-1", card: "bota", difficulty: 1, verse: "I’ve a tongue and a heel and I walk every road,\nbut I can’t move an inch till you fill me with toes.", why: "Boots have tongues and heels, and go nowhere without a foot inside.", near: ["campana", "mano", "paraguas"] },
  { id: "lot-nopal-1", card: "nopal", difficulty: 1, verse: "Green paddles, sharp needles, I grow in the dry;\nyou’ll find me in tacos and on the flag flying high.", why: "Nopal paddles are eaten across Mexico, and the cactus is on the national coat of arms.", near: ["arbol", "rosa", "alacran"], source: AGN },
  { id: "lot-mano-1", card: "mano", difficulty: 1, verse: "Five of us live on a single wide palm;\nwe wave, and we clap, and we pinch with no harm.", why: "Five fingers on one palm: the Hand.", near: ["corazon", "bota", "estrella"] },
  // ——— difficulty 2: wordplay ———
  { id: "lot-estrella-2", card: "estrella", difficulty: 2, verse: "Directors want me, and so does the night;\nI’ve got five sharp points but I’m not one to fight.", why: "A ‘star’ is both a lead actor and a five-pointed shape in the night sky.", near: ["sol", "luna", "valiente"] },
  { id: "lot-arbol-2", card: "arbol", difficulty: 2, verse: "I’ve a trunk but no luggage, and bark but no bite;\nmy family has roots that I keep out of sight.", why: "Trunk, bark, roots — and a family tree.", near: ["nopal", "escalera", "venado"] },
  { id: "lot-pescado-2", card: "pescado", difficulty: 2, verse: "I’m covered in scales but I’ve nothing to weigh;\nI go to school daily but learn nothing all day.", why: "Fish have scales and swim in schools.", near: ["sirena", "alacran", "paraguas"] },
  { id: "lot-musico-2", card: "musico", difficulty: 2, verse: "I take a few bars but I never get drunk;\nI pick, but not fruit; I’ve got soul and some funk.", why: "Musicians play bars and pick strings.", near: ["gallo", "campana", "sirena"] },
  { id: "lot-venado-2", card: "venado", difficulty: 2, verse: "I am dear to the forest, a buck I don’t spend;\nmy crown falls each winter, then grows back again.", why: "Deer/dear, buck/buck — and antlers are shed and regrown every year.", near: ["gallo", "arbol", "catrin"] },
  { id: "lot-arana-2", card: "arana", difficulty: 2, verse: "I’m always online and I never pay rent;\nmy site catches visitors who don’t know where they went.", why: "Spiders live on their web and catch whatever wanders in.", near: ["alacran", "mano", "escalera"] },
  { id: "lot-rosa-2", card: "rosa", difficulty: 2, verse: "By any other name I would smell just as sweet,\nbut grab me too greedy and you’ll bleed on your sheet.", why: "A nod to the famous line about a rose’s name — and its thorns.", near: ["nopal", "corazon", "dama"] },
  { id: "lot-calavera-2", card: "calavera", difficulty: 2, verse: "I’m the brains of the outfit, though now I have none;\nI grin at the party when the party is done.", why: "The skull once held the brain, and keeps smiling on every ofrenda.", near: ["corazon", "catrin", "mano"] },
  { id: "lot-catrin-2", card: "catrin", difficulty: 2, verse: "A topper, a cane and a very high chin;\nmy suit costs a fortune, my wallet is thin.", why: "The dandy is all top hat and swagger — style over savings.", near: ["dama", "valiente", "musico"] },
  { id: "lot-dama-2", card: "dama", difficulty: 2, verse: "First in the lift, I am never the tramp;\nthe chess board’s most powerful piece shares my stamp.", why: "‘Ladies first’ — and in Spanish the chess queen is ‘la dama’.", near: ["catrin", "sirena", "rosa"] },
  { id: "lot-mundo-2", card: "mundo", difficulty: 2, verse: "Everyone’s here but there’s no one to host;\nI’m spun by a finger in the classroom the most.", why: "The whole world, spun as a classroom globe.", near: ["sol", "luna", "campana"] },
  { id: "lot-valiente-2", card: "valiente", difficulty: 2, verse: "I don’t run from trouble, I run toward its blade;\nmy courage is real but my manners are frayed.", why: "The brave one charges in, knife and all.", near: ["catrin", "alacran", "corazon"] },
  // ——— difficulty 3: cryptic but fair ———
  { id: "lot-sol-3", card: "sol", difficulty: 3, verse: "Alone in my system, yet everyone’s near;\nlook straight at my face and you’ll pay for it, dear.", why: "‘Sol’ is the solar system’s lone star; staring at the Sun damages your eyes.", near: ["estrella", "luna", "mundo"] },
  { id: "lot-luna-3", card: "luna", difficulty: 3, verse: "I pull on the sea but I can’t lift a cup;\nthe wolf sings to me, and I never pipe up.", why: "The Moon drives the tides, and the howling wolf is its biggest fan.", near: ["sirena", "estrella", "sol"] },
  { id: "lot-corazon-3", card: "corazon", difficulty: 3, verse: "Four rooms and no doors, but there’s traffic all day;\nI’m on every deck, but I’m not there to play.", why: "Four chambers with blood flowing through — and hearts are a card suit.", near: ["mano", "calavera", "rosa"] },
  { id: "lot-escalera-3", card: "escalera", difficulty: 3, verse: "I’m straight, but I only stand up when I lean;\nI’ve feet but no toes, and there’s air in between.", why: "A ladder only stands when leaned on a wall; it has feet, and gaps between its rungs.", near: ["campana", "arbol", "mano"] },
  { id: "lot-pescado-3", card: "pescado", difficulty: 3, verse: "I’m caught with no crime and I’m hooked with no vice;\nI’m sold by the kilo and kept cold on ice.", why: "Caught and hooked without any crime, then sold on ice: the Fish.", near: ["sirena", "gallo", "venado"] },
  { id: "lot-calavera-3", card: "calavera", difficulty: 3, verse: "Write me in verse and I mock you with glee;\nmould me in sugar and your name is on me.", why: "Calaveras are playful mock-epitaph verses — and sugar skulls carry a name on the forehead.", near: ["catrin", "corazon", "dama"], source: TAMU },
  { id: "lot-gallo-3", card: "gallo", difficulty: 3, verse: "I spin on a roof telling which way winds blow;\nI strut like I own it, and I’m first with hello.", why: "Weathervanes are often topped with a rooster, the strutting first voice of every morning.", near: ["campana", "musico", "venado"] },
  { id: "lot-sirena-3", card: "sirena", difficulty: 3, verse: "Ambulances borrowed my name for their wail;\nI’ve a voice like a lullaby, and a very wet tail.", why: "A siren is both the alarm and the singing sea creature with a fish’s tail.", near: ["campana", "pescado", "dama"] },
  { id: "lot-nopal-3", card: "nopal", difficulty: 3, verse: "An eagle once landed on me with a snake;\nfrom that perch a great city was told it should wake.", why: "The founding legend of Tenochtitlan: an eagle on a cactus devouring a serpent.", near: ["arbol", "gallo", "alacran"], source: AGN },
  { id: "lot-mano-3", card: "mano", difficulty: 3, verse: "I’m dealt every evening yet never played wrong;\nI’m second, I’m upper, and I’m old as a song.", why: "A hand of cards; ‘second-hand’, ‘upper hand’, ‘old hand’.", near: ["corazon", "estrella", "bota"] },
  { id: "lot-campana-3", card: "campana", difficulty: 3, verse: "I’m struck, but I never get hurt by the blow;\nI toll for whoever, yet nobody I owe.", why: "Bells are struck to sound, and they ‘toll’ — no debts involved.", near: ["valiente", "gallo", "musico"] },
  { id: "lot-bota-3", card: "bota", difficulty: 3, verse: "Italy wears me from thigh down to toe;\nI’m given to workers whenever they go.", why: "Italy is boot-shaped, and being fired is ‘getting the boot’.", near: ["mundo", "mano", "paraguas"] },
  { id: "lot-paraguas-3", card: "paraguas", difficulty: 3, verse: "My name says ‘for waters’, my frame is all ribs;\nI’m bought every storm and then lost — no fibs.", why: "‘Para-aguas’ means ‘for waters’; umbrellas have ribs and vanish on buses.", near: ["sirena", "campana", "escalera"] },
  { id: "lot-arana-3", card: "arana", difficulty: 3, verse: "I knit without needles and never get paid;\nmy patterns catch dinner the moment they’re made.", why: "Spiders spin silk webs that double as traps for their meals.", near: ["alacran", "mano", "musico"] },
  { id: "lot-venado-3", card: "venado", difficulty: 3, verse: "I’m the dear that you hunt for, though not with a ring;\nmy head wears a forest that falls every spring.", why: "Deer/dear — and antlers branch like a small forest before they are shed.", near: ["musico", "arbol", "gallo"] },
  { id: "lot-estrella-3", card: "estrella", difficulty: 3, verse: "Wise travellers followed me, sailors did too;\nyou still see my light long after I’m through.", why: "Guiding star of stories and sailors — and starlight that left its source long ago.", near: ["sol", "luna", "mundo"] },
];
