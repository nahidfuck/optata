import { useState } from "react";

import type { WishlistItem } from "../../api/types";
import { cn } from "../../lib/cn";
import { Stamp } from "../ui/Stamp";

/**
 * The photo inside a tag. The accent color IS the card surface while the
 * photo decodes, so a card is never empty; a failed photo leaves a clean
 * accent tag with title/price — never a broken-image icon.
 *
 * Reservation state renders ONLY for the guest view — the union type makes
 * reading it on any other payload a compile error.
 */
export function CardMedia({
  item,
  fit,
  className,
}: {
  item: WishlistItem;
  /** "contain" = fixed 3:4 deck frame; "natural" = grid keeps photo ratio */
  fit: "contain" | "natural";
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const reserved = item.view === "guest" && item.is_reserved;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] border-2 border-ink",
        fit === "contain" ? "h-full w-full" : "w-full",
        fit === "natural" && state !== "ready" ? "aspect-[3/4]" : "",
        className,
      )}
      style={{ backgroundColor: item.accent_color }}
    >
      {state !== "failed" && (
        <img
          src={item.image_url}
          alt={item.title}
          draggable={false}
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          className={cn(
            "transition-opacity duration-150 motion-reduce:transition-none",
            fit === "contain"
              ? "absolute inset-0 h-full w-full object-contain"
              : "block h-auto w-full",
            state === "ready" ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {reserved && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(19,19,17,0.25) 0 2px, transparent 2px 9px)",
          }}
        />
      )}
      {reserved && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center px-2">
          <span className="rounded-[6px] border-2 border-ink bg-paper px-2 py-1">
            <Stamp className="text-[10px]">
              {item.reserved_by_me ? "You're gifting this" : "Already being gifted"}
            </Stamp>
          </span>
        </div>
      )}
    </div>
  );
}
