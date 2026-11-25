import type { BoardReply } from "../../shared/wire.ts";
import { AvatarSprite } from "../sprites/Sprite.tsx";
import { fmtScore, fmtStopwatch } from "./format.ts";

/** A high score table: ten lines, best first. `mine` lights the play just made. */
export function ScoreTable({ board, mine }: { board: BoardReply; mine?: number }) {
  if (!board.kind) return null;
  if (!board.rows.length) return <p className="m-0 text-center text-dim">No scores yet. Be the first!</p>;
  return (
    <ol className="m-0 list-none p-0">
      {board.rows.map((r, i) => (
        <li key={r.playId} className={`flex items-center gap-3 px-2 py-1 ${r.playId === mine ? "bg-raised text-yellow" : ""}`} {...(r.playId === mine ? { "aria-current": "true" as const } : {})}>
          <span className="font-display w-8 text-right text-xs text-dim">{i + 1}</span>
          <AvatarSprite avatar={r.avatar} colour={r.colour} size={28} />
          <span className={`font-display flex-1 truncate text-xs ${r.playId === mine ? "" : "text-magenta"}`}>{r.name}</span>
          <span className="font-display text-sm">{board.kind === "score" ? fmtScore(r.score) : fmtStopwatch(r.timeMs)}</span>
        </li>
      ))}
    </ol>
  );
}
