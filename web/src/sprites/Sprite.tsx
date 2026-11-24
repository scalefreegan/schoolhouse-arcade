import { useMemo } from "react";
import { avatarById } from "../../shared/avatars.ts";
import { ART, type SpriteArt, type SpriteId } from "./art.ts";
import { spriteRuns } from "./runs.ts";

/**
 * A drawing from art.ts. `size` is its width in CSS pixels; it scales as
 * whole blocks at any size. Decorative unless given a `title`.
 */
export function Sprite({ id, palette = "default", size = 64, className = "", title }: { id: SpriteId; palette?: string; size?: number; className?: string; title?: string }) {
  const art: SpriteArt = ART[id];
  const runs = useMemo(() => spriteRuns(art, palette), [art, palette]);
  const w = art.rows[0].length;
  const h = art.rows.length;
  return (
    <svg
      className={`sprite ${className}`}
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

/** A player's character, by avatar id (shared/avatars.ts). */
export function AvatarSprite({ avatar, size = 64, className = "", title }: { avatar: string; size?: number; className?: string; title?: string }) {
  const a = avatarById(avatar);
  return <Sprite id={a.sprite} palette={a.palette} size={size} className={className} {...(title ? { title } : {})} />;
}
