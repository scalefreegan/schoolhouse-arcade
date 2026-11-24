import { MAX_STARS } from "../../shared/play.ts";
import { Sprite } from "../sprites/Sprite.tsx";

/** A level's stars: lit ones and the places still to earn. `fresh` makes the
 *  stars past that count hop (they were just won). */
export function Stars({ count, size = 24, fresh }: { count: number; size?: number; fresh?: number }) {
  return (
    <span className="inline-flex gap-1" role="img" aria-label={`${count} of ${MAX_STARS} stars`}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <Sprite key={i} id="star" palette={i < count ? "on" : "off"} size={size} className={fresh !== undefined && i >= fresh && i < count ? "hop" : ""} />
      ))}
    </span>
  );
}
