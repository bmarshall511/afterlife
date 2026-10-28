/** Two Truths and a Fib — prompt themes. Families write 3 short statements about themselves on the theme; one is a fib. */
import type { ContentRating } from "@/shared/types";

export interface FibTheme { id: string; difficulty: 1 | 2 | 3; theme: string; rating: ContentRating }

export const FIB_THEMES: FibTheme[] = [
  { id: "fib-road-trip", difficulty: 1, theme: "your family’s most memorable road trip", rating: "classic" },
  { id: "fib-kitchen", difficulty: 1, theme: "disasters in your family kitchen", rating: "classic" },
  { id: "fib-pets", difficulty: 1, theme: "pets your family has (or had)", rating: "classic" },
  { id: "fib-talents", difficulty: 1, theme: "hidden talents in your family", rating: "classic" },
  { id: "fib-holidays", difficulty: 1, theme: "your family’s holiday traditions", rating: "classic" },
  { id: "fib-food", difficulty: 1, theme: "the strangest things your family has eaten", rating: "classic" },
  { id: "fib-injuries", difficulty: 2, theme: "silly injuries in your family", rating: "classic" },
  { id: "fib-celeb", difficulty: 2, theme: "your family’s brushes with fame", rating: "classic" },
  { id: "fib-school", difficulty: 2, theme: "things that happened at school", rating: "classic" },
  { id: "fib-travel", difficulty: 2, theme: "places your family has been", rating: "classic" },
  { id: "fib-firsts", difficulty: 2, theme: "your family’s ‘firsts’ (first car, first job, first dance…)", rating: "classic" },
  { id: "fib-rules", difficulty: 2, theme: "weird rules in your house", rating: "classic" },
  { id: "fib-collections", difficulty: 2, theme: "odd things someone in your family collects", rating: "classic" },
  { id: "fib-superstitions", difficulty: 3, theme: "superstitions your family secretly follows", rating: "classic" },
  { id: "fib-parties", difficulty: 2, theme: "the wildest family party you’ve had", rating: "spicy" },
  { id: "fib-how-met", difficulty: 2, theme: "how couples in your family met", rating: "spicy" },
  { id: "fib-dates", difficulty: 3, theme: "the worst dates anyone in your family has been on", rating: "spicy" },
  { id: "fib-weddings", difficulty: 3, theme: "things that went wrong at family weddings", rating: "spicy" },
  { id: "fib-in-laws", difficulty: 3, theme: "your in-laws (keep it kind… ish)", rating: "spicy" },
  { id: "fib-trouble", difficulty: 3, theme: "times someone in your family got in trouble", rating: "spicy" },
  { id: "fib-nights-out", difficulty: 3, theme: "legendary nights out (the parts you can say here)", rating: "spicy" },
  { id: "fib-secrets", difficulty: 3, theme: "family secrets that are now safe to share", rating: "spicy" },
];
