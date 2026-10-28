import type { GameFamily } from "@/shared/types";

export function Wordmark({ size = "md", tagline = true }: { size?: "sm" | "md" | "lg"; tagline?: boolean }) {
  return (
    <div className={`wordmark wm-${size}`}>
      <div className="wm-name">AFTERLIFE</div>
      <span className="wm-dot" aria-hidden="true" />
      {tagline && <div className="wm-tag">A Día de los Muertos party game</div>}
    </div>
  );
}

export const FAMILY: Record<GameFamily, { title: string; es: string; sub: string; how: string; icon: string }> = {
  calavera: { title: "La Calavera", es: "Write the epitaph", sub: "Finish the verse. Make the room laugh.", how: "Write a cheeky last line for the verse on the TV — then vote for the best one that isn’t yours.", icon: "quill" },
  line: { title: "The Line", es: "La Línea", sub: "Put it in order.", how: "Arrange the cards from one end to the other. Every pair in the right order scores.", icon: "ruler" },
  loteria: { title: "La Lotería", es: "Riddle → card", sub: "Read the riddle. Find the card.", how: "A verse describes one card on the board. Pick it on your phone.", icon: "cards" },
  room: { title: "Read the Room", es: "Lee al público", sub: "Know your crowd.", how: "Pick your answer. Then guess what share of the room picked the same.", icon: "people" },
  closest: { title: "Closest Without Going Over", es: "Sin pasarse", sub: "Get close. Don’t go over.", how: "Guess the number. The closer the better — but over the true value scores nothing.", icon: "target" },
  dichos: { title: "Dichos", es: "Finish the saying", sub: "Termina el dicho.", how: "A classic Mexican saying, cut short. Pick the real ending — the other three are invented.", icon: "quill" },
  price: { title: "¿Cuánto Cuesta?", es: "Price Is Right, Mexican edition", sub: "Guess the price in pesos.", how: "Name the price in pesos. Closest wins — but go over the real price and you score nothing.", icon: "target" },
  fib: { title: "Two Truths & a Fib", es: "Dos verdades y una mentira", sub: "Can you spot the fib?", how: "Write two true things about your family and one believable fib. Then everyone hunts for each other’s fib.", icon: "eye" },
  case: { title: "The Ofrenda Case", es: "El misterio de la ofrenda", sub: "Whose altar is whose?", how: "Clues arrive over three rounds. Lock in early for more points — a lock is final.", icon: "search" },
};
