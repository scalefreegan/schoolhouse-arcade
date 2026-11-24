// What a play pays, in tickets. The game says what the play itself is worth
// (GameRules.pay); the arcade adds the same bonuses on every cabinet. The
// server works this out and writes each line to the ledger; the browser
// only shows it. docs/PRD.md has it in words.
//
// Pure, and run by Node as is.

/** Beating your own best with a set-up. */
export const BEST_BONUS = 10;
/** Each new star on a level. */
export const STAR_BONUS = 20;

/** Why tickets moved. Stored on every ledger row: never rename one.
 *    play    the round itself          best    a new personal best
 *    star    a new star                badge   a badge's bonus
 *    prize   spent on a prize          adjust  a grown-up, by hand */
export type TicketReason = "play" | "best" | "star" | "badge" | "prize" | "adjust";

export interface TicketLine {
  reason: TicketReason;
  amount: number;
  /** For `badge`: which one. */
  badge?: string;
}

/** The lines one play earns, in the order they are shown. A line worth nothing is left out. */
export function ticketLines(play: { base: number; personalBest: boolean; newStars: number; badges: { id: string; tickets: number }[] }): TicketLine[] {
  const lines: TicketLine[] = [
    { reason: "play", amount: play.base },
    { reason: "best", amount: play.personalBest ? BEST_BONUS : 0 },
    { reason: "star", amount: Math.max(0, play.newStars) * STAR_BONUS },
    ...play.badges.map((b): TicketLine => ({ reason: "badge", amount: b.tickets, badge: b.id })),
  ];
  return lines.filter((l) => l.amount > 0);
}

export const totalOf = (lines: TicketLine[]): number => lines.reduce((n, l) => n + l.amount, 0);
