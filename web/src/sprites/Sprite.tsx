import { useMemo } from "react";
import { lookOf } from "../../shared/avatars.ts";
import { ART, type SpriteArt, type SpriteId } from "./art.ts";
import { spriteRuns } from "./runs.ts";

/**
 * A drawing from art.ts. `size` is its width in CSS pixels; it scales as
 * whole blocks at any size. Decorative unless given a `title`. `off` draws
 * it as an unlit shape: something not earned yet.
 */
export function Sprite({ id, palette = "default", size = 64, className = "", title, off = false }: { id: SpriteId; palette?: string; size?: number; className?: string; title?: string; off?: boolean }) {
  const art: SpriteArt = ART[id];
  const runs = useMemo(() => spriteRuns(art, palette), [art, palette]);
  const w = art.rows[0].length;
  const h = art.rows.length;
  return (
    <svg
      className={`sprite ${off ? "sprite-off" : ""} ${className}`}
      width={size}
      height={(size * h) / w}
      viewBox={`0 0 ${w} ${h}`}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      {runs.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

/** A player's character in its colour, as stored (shared/avatars.ts: lookOf). */
export function AvatarSprite({ avatar, colour, size = 64, className = "", title }: { avatar: string; /** The player's stored colour; null is the character's own look. */ colour: string | null; size?: number; className?: string; title?: string }) {
  const look = lookOf(avatar, colour);
  return <Sprite id={look.character.sprite} palette={look.colour} size={size} className={className} {...(title ? { title } : {})} />;
}

/**
 * A drawing named by data rather than by code: a prize's icon, a badge's
 * sprite. An id art.ts does not have (a prize saved by a newer version)
 * draws the gift instead of nothing.
 */
export function Picture({ id, ...rest }: { id: string; palette?: string; size?: number; className?: string; title?: string; off?: boolean }) {
  return <Sprite id={(Object.hasOwn(ART, id) ? id : "gift") as SpriteId} {...rest} />;
}
