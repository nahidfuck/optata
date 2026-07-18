import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

import { api } from "../api/client";
import { parseProfile } from "../api/types";
import type { Profile as ProfileData } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppBar } from "../components/AppBar";
import { ItemModal } from "../components/profile/ItemModal";
import { ProfileGrid } from "../components/profile/ProfileGrid";
import { ShuffleDeck } from "../components/profile/ShuffleDeck";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { Stamp } from "../components/ui/Stamp";
import { useToast } from "../components/ui/Toast";
import { fisherYates } from "../lib/shuffle";
import { bindViewFlushOnHide, flushViews, recordView } from "../lib/views";

const HIDE_OWN_SHUFFLE_KEY = "optata.hideOwnShuffle";

type Status =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; profile: ProfileData };

export default function Profile() {
  const { username = "" } = useParams<{ username: string }>();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  // deck → reveal (deck lifts, grid staggers in beneath) → grid
  const [phase, setPhase] = useState<"deck" | "reveal" | "grid">("grid");
  const [deckOrder, setDeckOrder] = useState<string[]>([]);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const cameFromDeck = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);

  const authenticated = user !== null;

  // ---- data ----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    setOpenItemId(null);
    void (async () => {
      try {
        const response = await api(`/users/${encodeURIComponent(username)}`);
        if (cancelled) return;
        if (response.status === 404) {
          setStatus({ kind: "notfound" });
          return;
        }
        if (!response.ok) {
          setStatus({ kind: "error" });
          return;
        }
        const profile = parseProfile(await response.json(), authenticated);
        if (cancelled) return;

        // Fresh shuffle on every visit — nothing persisted, ever
        setDeckOrder(fisherYates(profile.items.map((item) => item.id)));
        const hideOwnShuffle =
          profile.view === "owner" && localStorage.getItem(HIDE_OWN_SHUFFLE_KEY) === "1";
        // 0 items → empty state; 1 item → a one-card deck is absurd
        const deckEligible = profile.items.length >= 2 && !hideOwnShuffle;
        cameFromDeck.current = deckEligible;
        setPhase(deckEligible ? "deck" : "grid");
        setStatus({ kind: "ready", profile });
      } catch {
        if (!cancelled) setStatus({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, authenticated, reloadKey]);

  // ---- views: flush on tab hide and on leaving the profile ------------
  useEffect(() => {
    const unbind = bindViewFlushOnHide();
    return () => {
      void flushViews();
      unbind();
    };
  }, [username]);

  // record modal opens (deck deals are recorded by the deck itself)
  useEffect(() => {
    if (openItemId !== null) recordView(openItemId);
  }, [openItemId]);

  // deliberate post-login return from the reserve prompt
  useEffect(() => {
    const state = location.state as { authedReturn?: boolean } | null;
    if (state?.authedReturn) {
      toast("You're in — gift statuses on this wishlist are now live.");
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- derived ---------------------------------------------------------
  const profile = status.kind === "ready" ? status.profile : null;
  const itemsById = useMemo(
    () => new Map((profile?.items ?? []).map((item) => [item.id, item])),
    [profile],
  );
  const openItem = openItemId !== null ? (itemsById.get(openItemId) ?? null) : null;
  const isOwnProfile = profile?.view === "owner";

  // ---- actions ---------------------------------------------------------
  const reveal = useCallback(
    () => setPhase((current) => (current === "deck" ? "reveal" : current)),
    [],
  );
  const deckLeft = useCallback(() => setPhase("grid"), []);

  const disableOwnShuffle = useCallback(() => {
    localStorage.setItem(HIDE_OWN_SHUFFLE_KEY, "1");
    setPhase((current) => (current === "deck" ? "reveal" : current));
    toast("Shuffle stays off on your own profile. Guests still get the deck.");
  }, [toast]);

  const handleReservationChange = useCallback(
    (id: string, patch: { is_reserved: boolean; reserved_by_me: boolean }) => {
      setStatus((current) => {
        if (current.kind !== "ready" || current.profile.view !== "guest") return current;
        return {
          kind: "ready",
          profile: {
            ...current.profile,
            items: current.profile.items.map((item) =>
              item.id === id ? { ...item, ...patch } : item,
            ),
          },
        };
      });
    },
    [],
  );

  const handleReorder = useCallback(
    (ids: string[]) => {
      if (status.kind !== "ready" || status.profile.view !== "owner") return;
      const previous = status.profile;
      const byId = new Map(previous.items.map((item) => [item.id, item]));
      const reordered = ids
        .map((id, index) => {
          const item = byId.get(id);
          return item ? { ...item, order_index: index } : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      // optimistic
      setStatus({ kind: "ready", profile: { ...previous, items: reordered } });
      void (async () => {
        try {
          const response = await api("/items/reorder", {
            method: "PUT",
            body: JSON.stringify({ ordered_ids: ids }),
          });
          if (!response.ok) throw new Error("reorder rejected");
        } catch {
          setStatus({ kind: "ready", profile: previous });
          toast("Reorder didn't save — back to the previous order.", "danger");
        }
      })();
    },
    [status, toast],
  );

  // ---- render ----------------------------------------------------------
  if (status.kind === "loading") {
    return (
      <>
        <AppBar />
        <main className="grid place-items-center px-4 py-16">
          <Skeleton className="aspect-[3/4] w-full max-w-[320px]" />
        </main>
      </>
    );
  }

  if (status.kind === "notfound") {
    return (
      <>
        <AppBar />
        <main className="px-4 py-16">
          <EmptyState
            title="This wishlist doesn't exist"
            body="Check the link — usernames are exact."
          />
        </main>
      </>
    );
  }

  if (status.kind === "error" || profile === null) {
    return (
      <>
        <AppBar />
        <main className="px-4 py-16">
          <EmptyState
            title="Couldn't load this wishlist"
            body="The server didn't answer. It may be waking up — free hosting naps."
            action={
              <Button variant="primary" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            }
          />
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16">
        <header className="pb-5 pt-4">
          <h1 className="font-display text-3xl font-bold leading-tight">
            {profile.display_name ?? profile.username}
          </h1>
          <Stamp className="text-ink-soft">u/{profile.username}</Stamp>
          {profile.bio && (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">{profile.bio}</p>
          )}
        </header>

        {profile.items.length === 0 ? (
          isOwnProfile ? (
            <EmptyState
              title="Nothing here yet"
              body="Add your first wish — a photo and a name is all it takes."
              action={
                <Button
                  variant="primary"
                  onClick={() => toast("Adding wishes lands in the next update.")}
                >
                  Add your first wish
                </Button>
              }
            />
          ) : (
            <EmptyState title={`${profile.username} hasn't added anything yet`} />
          )
        ) : (
          // mounted from the moment the deck starts lifting, so the grid
          // staggers in BENEATH the departing deck
          phase !== "deck" && (
            <ProfileGrid
              items={profile.items}
              canReorder={isOwnProfile}
              stagger={cameFromDeck.current}
              onOpenItem={setOpenItemId}
              onReorder={handleReorder}
            />
          )
        )}
      </main>

      {phase !== "grid" && profile.items.length >= 2 && (
        <ShuffleDeck
          items={itemsById}
          order={deckOrder}
          username={profile.username}
          isOwnProfile={isOwnProfile}
          leaving={phase === "reveal"}
          onReveal={reveal}
          onLeft={deckLeft}
          onOpenItem={setOpenItemId}
          onDisableOwnShuffle={disableOwnShuffle}
        />
      )}

      <ItemModal
        item={openItem}
        ownerUsername={profile.username}
        onClose={() => setOpenItemId(null)}
        onReservationChange={handleReservationChange}
      />
    </>
  );
}
