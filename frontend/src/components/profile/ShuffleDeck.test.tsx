import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnonymousItem, WishlistItem } from "../../api/types";
import { ShuffleDeck } from "./ShuffleDeck";

vi.mock("../../lib/views", () => ({
  recordView: vi.fn(),
}));

import { recordView } from "../../lib/views";

function makeItems(count: number): Map<string, WishlistItem> {
  const entries = Array.from({ length: count }, (_, i): [string, AnonymousItem] => [
    `id-${i}`,
    {
      view: "anonymous",
      id: `id-${i}`,
      title: `Wish ${i}`,
      image_url: `https://example.com/${i}.webp`,
      accent_color: "#AABBCC",
      link: null,
      price: null,
      currency: null,
      note: null,
      order_index: i,
    },
  ]);
  return new Map(entries);
}

function renderDeck(count: number, overrides: Partial<Parameters<typeof ShuffleDeck>[0]> = {}) {
  const items = makeItems(count);
  const order = [...items.keys()];
  const onReveal = vi.fn();
  const onOpenItem = vi.fn();
  render(
    <ShuffleDeck
      items={items}
      order={order}
      username="demo"
      isOwnProfile={false}
      leaving={false}
      onReveal={onReveal}
      onLeft={vi.fn()}
      onOpenItem={onOpenItem}
      onDisableOwnShuffle={vi.fn()}
      {...overrides}
    />,
  );
  return { order, onReveal, onOpenItem };
}

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.style.overflow = "";
});

describe("ShuffleDeck", () => {
  it("keeps only the top 3 cards in the DOM, not the whole deck", () => {
    renderDeck(12);
    expect(screen.getAllByLabelText("Next card")).toHaveLength(3);
  });

  it("advances on space / arrow keys and records a view per dealt card", async () => {
    renderDeck(5);
    expect(screen.getByText("No. 01/05")).toBeDefined();
    expect(recordView).toHaveBeenCalledWith("id-0");

    await act(async () => {
      fireEvent.keyDown(window, { key: " " });
    });
    expect(screen.getByText("No. 02/05")).toBeDefined();
    expect(recordView).toHaveBeenCalledWith("id-1");

    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(screen.getByText("No. 03/05")).toBeDefined();
    expect(recordView).toHaveBeenCalledWith("id-2");
  });

  it("exhausting the deck calls onReveal exactly once", async () => {
    const { onReveal } = renderDeck(3);
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.keyDown(window, { key: " " });
      });
    }
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("'Show everything' reveals the grid without finishing the deck", async () => {
    const { onReveal } = renderDeck(10);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
    });
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("clicking the info strip opens the detail modal for the TOP card", async () => {
    const { onOpenItem } = renderDeck(4);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Details: Wish 0"));
    });
    expect(onOpenItem).toHaveBeenCalledWith("id-0");
  });

  it("owner sees the shuffle opt-out; guests never do", () => {
    renderDeck(4, { isOwnProfile: true });
    expect(
      screen.getByRole("button", { name: "Don't show me shuffle on my own profile" }),
    ).toBeDefined();
  });

  it("reveal completes even when rAF never ticks (background tab)", async () => {
    // jsdom runs no animation frames — exactly like an occluded/background
    // tab, where framer's onAnimationComplete never fires. The timeout
    // fallback must still hand control to the grid.
    vi.useFakeTimers();
    try {
      const onLeft = vi.fn();
      renderDeck(4, { leaving: true, onLeft });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });
      expect(onLeft).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
