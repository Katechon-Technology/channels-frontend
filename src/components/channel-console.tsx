"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Bot,
  Eraser,
  Loader2,
  Radio,
  RotateCcw,
  Settings,
  Share2,
  Tv,
} from "lucide-react";
import {
  applyMutation,
  createChannel,
  fetchApiKeyProviders,
  flushChannelNarration,
  loadChannels,
  narrateChannel,
  previewChannelPatch,
  rejectMutation,
  requestMutation,
  subscribeChannelAgentJobUpdated,
  subscribeChannelNarration,
  subscribeChannelUpdated,
  type ChannelMutationPreview,
} from "@/lib/graphql";
import { latestNarrationFor } from "@/lib/channel-data";
import {
  buildFocusPatch,
  buildResetPatch,
  focusOptionsForChannel,
  isAutoApplyOption,
  type FocusOption,
} from "@/lib/focus-presets";
import { AvatarHost, type AvatarSpeechEvent } from "@/components/avatar-host";
import { ChannelGrid } from "@/components/channel-grid";
import { SettingsDrawer } from "@/components/settings-drawer";
import type {
  Channel,
  ChannelAgentJob,
  ChannelDataSourceData,
  ChannelMutation,
  ChannelNarrationMessage,
  ChannelSuggestedAction,
} from "@/lib/types";

// SSE subscriptions only deliver mutation + narration events, not plugin
// data-source refreshes — keep a moderate poll to stay current with rss/market
// data on the lazy-refresh cadence.
const POLL_MS = 30_000;
const TICK_MS = 250;
const NARRATION_KEEP = 16;
const BOOTSTRAP_CHANNEL_TEMPLATES = [
  "international-news",
  "hyperliquid-readonly",
  "polymarket-readonly",
] as const;

type AuthSession = {
  ready: boolean;
  authenticated: boolean;
  operatorLabel: string;
  login: () => void;
  logout: () => void;
  getToken: () => Promise<string | null>;
  loginCopy: string;
  modeLabel: string;
};

type BroadcastItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  published: string | null;
  link: string;
  kicker: string;
};

type PolymarketMarketEventDetail = {
  channelId?: unknown;
  markets?: unknown;
};

type PolymarketClientMarket = {
  id: string;
  slug?: string;
  question: string;
  yesPrice: number | null;
  noPrice?: number | null;
  volume24hr?: number | null;
  url?: string | null;
};

type ShareSnapshot = {
  createdAt: number;
  channel: Channel;
};

export function ChannelConsole() {
  const [shareSnapshot, setShareSnapshot] = useState<ShareSnapshot | null | undefined>(undefined);

  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get("share");
    setShareSnapshot(encoded ? decodeShareSnapshot(encoded) : null);
  }, []);

  if (shareSnapshot === undefined) {
    return <ShellState icon={<Loader2 className="animate-spin" />} title="Starting Katechon" />;
  }
  if (shareSnapshot) return <SharedChannelConsole snapshot={shareSnapshot} />;

  const devBypass = process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS === "1";
  if (devBypass) return <ChannelConsoleInner auth={devAuthSession()} />;
  return <PrivyChannelConsole />;
}

function PrivyChannelConsole() {
  const { ready, authenticated, login, logout, user, getAccessToken } = usePrivy();
  const auth: AuthSession = {
    ready,
    authenticated,
    operatorLabel:
      user?.email?.address || user?.wallet?.address || user?.id || "Authenticated operator",
    login,
    logout,
    getToken: async () => (authenticated ? await getAccessToken() : null),
    loginCopy: "Sign in to continue watching.",
    modeLabel: "privy",
  };

  return <ChannelConsoleInner auth={auth} />;
}

function devAuthSession(): AuthSession {
  const did = process.env.NEXT_PUBLIC_DEV_PRIVY_DID || "did:privy:test-user-1";
  return {
    ready: true,
    authenticated: true,
    operatorLabel: did,
    login: () => {},
    logout: () => {},
    getToken: async () => did,
    loginCopy: "Local preview mode is active.",
    modeLabel: "dev",
  };
}

function SharedChannelConsole({ snapshot }: { snapshot: ShareSnapshot }) {
  const [expired, setExpired] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const [segmentStartedAt, setSegmentStartedAt] = useState(() => Date.now());
  const channel = snapshot.channel;
  const durationSeconds = clampNumber(channel.spec.playout?.itemDurationSeconds ?? 10, 3, 300);
  const items = useMemo(() => extractBroadcastItems(channel), [channel]);
  const currentItem = items.length ? items[playIndex % items.length] : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (expired || items.length === 0) return;
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      if (nextNow - segmentStartedAt >= durationSeconds * 1000) {
        setPlayIndex((index) => (items.length > 1 ? (index + 1) % items.length : 0));
        setSegmentStartedAt(nextNow);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [durationSeconds, expired, items.length, segmentStartedAt]);

  function continueWatching() {
    window.location.href = "/";
  }

  return (
    <main className="katechon-shell min-h-screen overflow-hidden text-foreground">
      <div className={`grid min-h-screen grid-cols-1 gap-3 p-3 transition ${expired ? "blur-sm" : ""}`}>
        <section className="min-w-0 rounded-[28px] border border-white/10 bg-black/20 p-3 shadow-2xl shadow-black/30 sm:p-4">
          <BroadcastStage
            channel={channel}
            presetOptions={[]}
            suggestedActions={[]}
            pendingFocusLabel={null}
            onChoosePreset={() => {}}
            onChooseSuggested={() => {}}
          />
        </section>
      </div>
      <AvatarHost speechText={!expired && currentItem ? speechTextForItem(currentItem) : null} />
      {expired ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-md">
          <section className="max-w-md rounded-3xl border border-white/10 bg-surface-1 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-accent-green/30 bg-accent-green/10 text-accent-green">
              <Tv size={20} />
            </div>
            <h1 className="font-heading text-3xl font-semibold text-white">WOOPS</h1>
            <p className="mt-2 text-sm leading-6 text-white/55">
              That was a 10 second preview of this Katechon channel. Register to keep watching and build your own live setup.
            </p>
            <button
              type="button"
              onClick={continueWatching}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-accent-green px-4 text-sm font-bold text-black hover:opacity-90"
            >
              Register to continue
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ChannelConsoleInner({ auth }: { auth: AuthSession }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [playIndex, setPlayIndex] = useState(0);
  const [segmentStartedAt, setSegmentStartedAt] = useState(() => Date.now());
  const [pendingFocus, setPendingFocus] = useState<{
    channelId: string;
    label: string;
  } | null>(null);
  const [apiKeyProviders, setApiKeyProviders] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentPromptOpen, setAgentPromptOpen] = useState(false);
  const [agentPromptError, setAgentPromptError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<{
    channelId: string;
    label: string;
    preview: ChannelMutationPreview;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [flushingNarration, setFlushingNarration] = useState(false);
  const [activeNarrationId, setActiveNarrationId] = useState<string | null>(null);
  const [clientMarketItemsByChannel, setClientMarketItemsByChannel] = useState<
    Record<string, BroadcastItem[]>
  >({});
  const directorBusyRef = useRef(false);
  const narrationRequestPendingRef = useRef(false);
  const narrationChannelRef = useRef<string | null>(null);
  const playedNarrationIdsRef = useRef<Set<string>>(new Set());
  const requestedAfterSpeechRef = useRef<string | null>(null);
  const lastStagedNarrationIdRef = useRef<string | null>(null);

  const active = useMemo(
    () => channels.find((channel) => channel.id === activeId) ?? channels[0] ?? null,
    [activeId, channels],
  );
  const playout = active?.spec.playout;
  const durationSeconds = clampNumber(playout?.itemDurationSeconds ?? 10, 3, 300);
  const activeChannelId = active?.id ?? null;
  const storedItems = useMemo(() => (active ? extractBroadcastItems(active) : []), [active]);
  const items = useMemo(() => {
    if (active?.spec.channelType === "polymarket" && activeChannelId) {
      const clientItems = clientMarketItemsByChannel[activeChannelId] ?? [];
      if (clientItems.length > 0) return clientItems;
    }
    return storedItems;
  }, [active?.spec.channelType, activeChannelId, clientMarketItemsByChannel, storedItems]);
  const itemKey = useMemo(() => itemsFingerprint(items), [items]);
  const currentItem = items.length ? items[playIndex % items.length] : null;
  const activeNarrationMessages = active?.narrationMessages;
  const orderedNarrations = useMemo(
    () => orderNarrationMessages(activeNarrationMessages),
    [activeNarrationMessages],
  );
  const latestKnownNarration = useMemo(
    () => latestNarrationFor(activeNarrationMessages),
    [activeNarrationMessages],
  );
  const latestNarration = useMemo(
    () =>
      activeNarrationId
        ? activeNarrationMessages?.find((message) => message.id === activeNarrationId) ?? null
        : null,
    [activeNarrationId, activeNarrationMessages],
  );
  const latestScene = latestNarration?.scene ?? null;

  const refresh = useCallback(
    async (options: { autoTune?: boolean; quiet?: boolean } = {}) => {
      try {
        const token = await auth.getToken();
        const data = await loadChannels(token);
        let nextChannels = data.channels;

        if (options.autoTune) {
          const availableTemplates = new Set(data.channelTemplates.map((template) => template.slug));
          const existingTemplates = new Set(
            nextChannels
              .map((channel) => channel.templateSlug)
              .filter((slug): slug is string => Boolean(slug)),
          );
          const hasOnlyBootstrapChannels =
            nextChannels.length === 0 ||
            nextChannels.every(
              (channel) =>
                channel.templateSlug &&
                BOOTSTRAP_CHANNEL_TEMPLATES.includes(
                  channel.templateSlug as (typeof BOOTSTRAP_CHANNEL_TEMPLATES)[number],
                ),
            );
          const missingBootstrapTemplates = BOOTSTRAP_CHANNEL_TEMPLATES.filter(
            (slug) => availableTemplates.has(slug) && !existingTemplates.has(slug),
          );

          if (hasOnlyBootstrapChannels && missingBootstrapTemplates.length > 0) {
            const created = await Promise.all(
              missingBootstrapTemplates.map((slug) => createChannel(slug, token)),
            );
            const afterCreate = await loadChannels(token);
            nextChannels =
              afterCreate.channels.length > 0
                ? afterCreate.channels
                : [...nextChannels, ...created.map((result) => result.createChannelFromTemplate)];
          }
        }

        setChannels(nextChannels);
        setActiveId((current) =>
          current && nextChannels.some((channel) => channel.id === current)
            ? current
            : nextChannels[0]?.id ?? null,
        );
      } catch {
        // Keep the broadcast surface quiet; external orchestration can inspect backend errors.
      } finally {
        setBooting(false);
      }
    },
    [auth],
  );

  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    void refresh({ autoTune: true });
  }, [auth.ready, auth.authenticated, refresh]);

  useEffect(() => {
    function onPolymarketMarkets(event: Event) {
      const detail = (event as CustomEvent<PolymarketMarketEventDetail>).detail;
      const channelId = typeof detail?.channelId === "string" ? detail.channelId : null;
      if (!channelId || !Array.isArray(detail.markets)) return;
      const items = detail.markets
        .map((market, index) => normalizePolymarketClientMarket(market, index))
        .filter((item): item is BroadcastItem => Boolean(item));
      setClientMarketItemsByChannel((current) => {
        const previous = current[channelId] ?? [];
        if (itemsFingerprint(previous) === itemsFingerprint(items)) return current;
        return { ...current, [channelId]: items };
      });
    }

    window.addEventListener("katechon:polymarket-markets", onPolymarketMarkets);
    return () => window.removeEventListener("katechon:polymarket-markets", onPolymarketMarkets);
  }, []);

  useEffect(() => {
    if (!auth.ready || !auth.authenticated || !activeChannelId) return;
    const id = window.setInterval(() => {
      void refresh({ quiet: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [activeChannelId, auth.authenticated, auth.ready, refresh]);

  // Live updates over GraphQL SSE — replaces 30s polling for the active channel.
  useEffect(() => {
    if (!auth.ready || !auth.authenticated || !activeChannelId) return;
    let cancelled = false;
    const handles: Array<{ close(): void }> = [];

    const setUp = async () => {
      const token = await auth.getToken();
      if (cancelled) return;
      const channelId = activeChannelId;

      handles.push(
        subscribeChannelUpdated(channelId, token, (updated) => {
          setChannels((current) =>
            current.map((channel) => (channel.id === updated.id ? updated : channel)),
          );
        }),
      );

      handles.push(
        subscribeChannelNarration(channelId, token, (message: ChannelNarrationMessage) => {
          setChannels((current) =>
            current.map((channel) =>
              channel.id === channelId
                ? {
                    ...channel,
                    narrationMessages: mergeNarration(channel.narrationMessages, message),
                  }
                : channel,
            ),
          );
        }),
      );

      handles.push(
        subscribeChannelAgentJobUpdated(channelId, token, (job: ChannelAgentJob) => {
          setChannels((current) =>
            current.map((channel) =>
              channel.id === channelId
                ? { ...channel, agentJobs: mergeAgentJob(channel.agentJobs, job) }
                : channel,
            ),
          );
          setAgentBusy(
            job.kind !== "narration" && (job.status === "queued" || job.status === "running"),
          );
          if (job.kind === "narration" && job.status === "failed") {
            narrationRequestPendingRef.current = false;
          }
          if (job.kind !== "narration" && job.status === "previewed" && job.mutationId) {
            void (async () => {
              try {
                const data = await loadChannels(token);
                if (cancelled) return;
                setChannels(data.channels);
                const nextChannel = data.channels.find((channel) => channel.id === channelId);
                const mutation = nextChannel?.mutations.find((m) => m.id === job.mutationId);
                if (nextChannel && mutation) {
                  setPendingPreview({
                    channelId,
                    label: job.prompt || "Agent update",
                    preview: previewFromMutation(nextChannel, mutation),
                  });
                }
              } catch {
                // Polling will catch up; leave the user in the current scene.
              }
            })();
          }
        }),
      );
    };

    void setUp();

    return () => {
      cancelled = true;
      for (const h of handles) h.close();
    };
  }, [activeChannelId, auth, auth.authenticated, auth.ready]);

  useEffect(() => {
    setPlayIndex(0);
    setSegmentStartedAt(Date.now());
  }, [active?.id, active?.activeSpecVersion.id, itemKey]);

  const provider = apiKeyProviders[0] as "ANTHROPIC" | "OPENAI" | undefined;
  const agentDriven = !!provider;

  const recentlyShownIds = useMemo<string[]>(() => {
    return (activeNarrationMessages ?? [])
      .map((m) => m.scene?.chosenItemId ?? m.metadata?.chosenItemId)
      .filter((id): id is string => !!id)
      .slice(0, 8);
  }, [activeNarrationMessages]);

  const fireDirector = useCallback(
    async (recent: string[]) => {
      if (!activeChannelId || !provider || items.length === 0) return;
      if (directorBusyRef.current) return;
      if (narrationRequestPendingRef.current) return;
      directorBusyRef.current = true;
      narrationRequestPendingRef.current = true;
      try {
        const payload = items.map((it) => ({
          id: it.id,
          title: it.title,
          summary: it.summary || null,
          link: it.link || null,
          sourceLabel: it.source || null,
        }));
        const token = await auth.getToken();
        await narrateChannel(activeChannelId, provider, payload, recent, token);
      } catch {
        narrationRequestPendingRef.current = false;
        // The narrator failures surface separately via the agent-job log; the
        // missing-API-key prompt lives in the Settings drawer indicator.
      } finally {
        directorBusyRef.current = false;
      }
    },
    [activeChannelId, provider, items, auth],
  );

  // Load configured api-key providers once on auth-ready; refresh after slice-D mutations.
  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await auth.getToken();
        const data = await fetchApiKeyProviders(token);
        if (!cancelled) setApiKeyProviders(data.me?.apiKeyProviders ?? []);
      } catch {
        // Settings drawer will surface a re-fetch when opened.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, auth.authenticated, auth.ready]);

  // Stage one narration at a time. Incoming feed events queue in channel state
  // and only become visible after the current speech ends.
  useEffect(() => {
    if (!activeChannelId) {
      narrationChannelRef.current = null;
      playedNarrationIdsRef.current = new Set();
      setActiveNarrationId(null);
      return;
    }

    if (narrationChannelRef.current !== activeChannelId) {
      narrationChannelRef.current = activeChannelId;
      directorBusyRef.current = false;
      narrationRequestPendingRef.current = false;
      requestedAfterSpeechRef.current = null;
      lastStagedNarrationIdRef.current = null;

      const latestId = latestKnownNarration?.id ?? null;
      playedNarrationIdsRef.current = new Set(
        orderedNarrations
          .map((message) => message.id)
          .filter((id) => id !== latestId),
      );
      setActiveNarrationId(latestId);
      return;
    }

    const hasActiveNarration =
      !!activeNarrationId && orderedNarrations.some((message) => message.id === activeNarrationId);
    if (
      activeNarrationId &&
      hasActiveNarration &&
      !playedNarrationIdsRef.current.has(activeNarrationId)
    ) {
      return;
    }

    const next = nextQueuedNarration(orderedNarrations, playedNarrationIdsRef.current);
    if (next) setActiveNarrationId(next.id);
    else if (!hasActiveNarration) setActiveNarrationId(null);
  }, [activeChannelId, activeNarrationId, latestKnownNarration?.id, orderedNarrations]);

  useEffect(() => {
    const stagedId = latestNarration?.id ?? null;
    if (!activeChannelId || !stagedId || stagedId === lastStagedNarrationIdRef.current) return;
    lastStagedNarrationIdRef.current = stagedId;
    narrationRequestPendingRef.current = false;
    requestedAfterSpeechRef.current = null;
  }, [activeChannelId, latestNarration?.id]);

  // Scene controller: jump to the chosenItemId for the staged narration only.
  // The next narration request is driven by the avatar's actual speech-ended event.
  useEffect(() => {
    if (!activeChannelId || items.length === 0) return;

    if (!latestNarration) {
      if (agentDriven && orderedNarrations.length === 0) void fireDirector([]);
      return;
    }

    const chosenId = latestScene?.chosenItemId ?? latestNarration.metadata?.chosenItemId;
    if (chosenId) {
      const idx = items.findIndex((it) => it.id === chosenId);
      if (idx >= 0 && idx !== playIndex) {
        setPlayIndex(idx);
        setSegmentStartedAt(Date.now());
      }
    }
  }, [
    activeChannelId,
    agentDriven,
    fireDirector,
    items,
    latestNarration,
    latestScene,
    orderedNarrations.length,
    playIndex,
  ]);

  const handleAvatarSpeechEnd = useCallback(
    (event: AvatarSpeechEvent) => {
      if (!latestNarration || event.speechKey !== latestNarration.id) return;
      if (isInterruptedSpeechEnd(event)) return;
      if (requestedAfterSpeechRef.current === event.speechKey) return;

      requestedAfterSpeechRef.current = event.speechKey;
      playedNarrationIdsRef.current.add(latestNarration.id);

      const next = nextQueuedNarration(orderedNarrations, playedNarrationIdsRef.current);
      if (next) {
        setActiveNarrationId(next.id);
        return;
      }

      if (!agentDriven) return;

      const chosenId = latestScene?.chosenItemId ?? latestNarration.metadata?.chosenItemId;
      const recentForNext = chosenId
        ? [chosenId, ...recentlyShownIds.filter((id) => id !== chosenId)].slice(0, 8)
        : recentlyShownIds;
      void fireDirector(recentForNext);
    },
    [agentDriven, fireDirector, latestNarration, latestScene, orderedNarrations, recentlyShownIds],
  );

  // Auto-cycler — only runs as a fallback for non-news channels when the agent isn't driving.
  useEffect(() => {
    if (agentDriven || active?.spec.channelType === "news" || items.length === 0) return;
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      if (nextNow - segmentStartedAt >= durationSeconds * 1000) {
        setPlayIndex((index) => (items.length > 1 ? (index + 1) % items.length : 0));
        setSegmentStartedAt(nextNow);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [active?.spec.channelType, agentDriven, durationSeconds, items.length, segmentStartedAt]);

  const avatarSpeechText =
    latestScene?.speech ||
    latestNarration?.text ||
    (!agentDriven && currentItem ? speechTextForItem(currentItem) : null);
  const avatarSpeechKey =
    latestNarration?.id ??
    (!agentDriven && currentItem ? `item:${activeChannelId ?? "local"}:${currentItem.id}` : null);

  async function choosePreset(option: FocusOption) {
    if (!active || pendingFocus || pendingPreview) return;
    setPendingFocus({ channelId: active.id, label: option.label });
    try {
      const patch = buildFocusPatch(active, option);
      const token = await auth.getToken();
      const data = await previewChannelPatch(active.id, patch, option.prompt, token);
      if (isAutoApplyOption(option.kind)) {
        const applied = await applyMutation(
          data.previewChannelSpecPatch.mutation.id,
          await auth.getToken(),
        );
        setChannels((current) =>
          current.map((channel) =>
            channel.id === applied.applyChannelMutation.channel.id
              ? applied.applyChannelMutation.channel
              : channel,
          ),
        );
        setActiveId(applied.applyChannelMutation.channel.id);
        await refresh({ quiet: true });
      } else {
        setPendingPreview({
          channelId: active.id,
          label: option.label,
          preview: data.previewChannelSpecPatch,
        });
      }
    } catch {
      // Surface failures quietly; the focus switcher stays unchanged.
    } finally {
      setPendingFocus(null);
    }
  }

  async function chooseSuggestedAction(option: ChannelSuggestedAction) {
    if (!active || pendingFocus || pendingPreview) return;
    setPendingFocus({ channelId: active.id, label: option.label });
    try {
      await requestMutation(active.id, option.prompt, await auth.getToken());
      // The agent runs async; the preview modal opens via subscribeChannelAgentJobUpdated.
    } catch {
      // ignore
    } finally {
      setPendingFocus(null);
    }
  }

  async function submitAgentPrompt(prompt: string): Promise<boolean> {
    const trimmed = prompt.trim();
    if (!active || !trimmed || pendingFocus || pendingPreview) return false;
    setAgentPromptError(null);
    setPendingFocus({ channelId: active.id, label: "Sending…" });
    try {
      await requestMutation(active.id, trimmed, await auth.getToken());
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAgentPromptError(
        /AGENT_SERVICE_URL|not configured/i.test(message)
          ? "Agent service isn't configured on the backend. Set AGENT_SERVICE_URL and retry."
          : `Agent dispatch failed: ${message}`,
      );
      return false;
    } finally {
      setPendingFocus(null);
    }
  }

  async function applyPreview() {
    if (!pendingPreview || applying) return;
    setApplying(true);
    try {
      const data = await applyMutation(
        pendingPreview.preview.mutation.id,
        await auth.getToken(),
      );
      setChannels((current) =>
        current.map((channel) =>
          channel.id === data.applyChannelMutation.channel.id
            ? data.applyChannelMutation.channel
            : channel,
        ),
      );
      setActiveId(data.applyChannelMutation.channel.id);
      setPendingPreview(null);
      // Pull fresh data immediately — applying a focus typically swaps which
      // upstream the filtered_wire pulls from, and the lazy-refresh delivers
      // new items via this round-trip rather than the channelUpdated event.
      await refresh({ quiet: true });
    } catch {
      // leave the preview open so the user can retry or cancel
    } finally {
      setApplying(false);
    }
  }

  async function cancelPreview() {
    if (!pendingPreview) return;
    const id = pendingPreview.preview.mutation.id;
    setPendingPreview(null);
    try {
      await rejectMutation(id, await auth.getToken());
    } catch {
      // best-effort cleanup; mutation will time out server-side anyway
    }
  }

  async function shareActiveChannel() {
    if (!active) return;
    const snapshot = createShareSnapshot(active, items);
    const url = new URL("/share", window.location.origin);
    url.searchParams.set("share", encodeShareSnapshot(snapshot));
    await navigator.clipboard.writeText(url.toString());
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
  }

  async function resetAllChannels() {
    if (channels.length === 0 || pendingFocus || pendingPreview || applying) return;
    setPendingFocus({ channelId: active?.id ?? channels[0].id, label: "Reset" });
    try {
      const token = await auth.getToken();
      const updated: Channel[] = [];
      for (const channel of channels) {
        await flushChannelNarration(channel.id, token);
        const preview = await previewChannelPatch(
          channel.id,
          buildResetPatch(channel),
          "Reset all channels to their clean demo state.",
          token,
        );
        const data = await applyMutation(preview.previewChannelSpecPatch.mutation.id, token);
        updated.push(data.applyChannelMutation.channel);
      }
      setChannels((current) =>
        current.map((channel) =>
          updated.find((next) => next.id === channel.id) ?? channel,
        ),
      );
      await refresh({ quiet: true });
    } catch {
      // leave channels as-is
    } finally {
      setPendingFocus(null);
    }
  }

  async function flushActiveNarration() {
    if (!active || flushingNarration) return;
    setFlushingNarration(true);
    try {
      const token = await auth.getToken();
      directorBusyRef.current = false;
      narrationRequestPendingRef.current = false;
      requestedAfterSpeechRef.current = null;
      lastStagedNarrationIdRef.current = null;
      playedNarrationIdsRef.current = new Set();
      setActiveNarrationId(null);
      await flushChannelNarration(active.id, token);
      setChannels((current) =>
        current.map((channel) =>
          channel.id === active.id
            ? {
                ...channel,
                narrationMessages: [],
                agentJobs: channel.agentJobs.map((job) =>
                  job.kind === "narration" &&
                  (job.status === "queued" || job.status === "running")
                    ? { ...job, status: "cancelled", error: "Narration queue flushed." }
                    : job,
                ),
              }
            : channel,
        ),
      );
      await refresh({ quiet: true });
    } catch {
      // Keep the broadcast running; the next poll will restore server state.
    } finally {
      setFlushingNarration(false);
    }
  }

  useEffect(() => {
    if (!auth.authenticated || channels.length === 0) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

      const currentIndex = Math.max(0, channels.findIndex((channel) => channel.id === active?.id));
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setActiveId(channels[(currentIndex + 1) % channels.length]?.id ?? null);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveId(channels[(currentIndex - 1 + channels.length) % channels.length]?.id ?? null);
      }
      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (channels[index]) {
          event.preventDefault();
          setActiveId(channels[index].id);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active?.id, auth.authenticated, channels]);

  if (!auth.ready) {
    return <ShellState icon={<Loader2 className="animate-spin" />} title="Starting Katechon" />;
  }

  if (!auth.authenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface-0 p-6">
        <section className="w-full max-w-lg rounded-lg border border-surface-3 bg-surface-1 p-6 shadow-2xl">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded border border-accent-green/30 bg-accent-green/10 text-accent-green">
              <Tv size={20} />
            </span>
            <div>
              <h1 className="font-heading text-3xl font-semibold">Katechon Channels</h1>
              <p className="text-sm text-white/50">{auth.loginCopy}</p>
            </div>
          </div>
          <button
            onClick={auth.login}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-accent-green px-4 text-sm font-bold text-black transition-opacity hover:opacity-90"
          >
            <Radio size={16} />
            Login
          </button>
        </section>
      </main>
    );
  }

  if (booting) {
    return <ShellState icon={<Loader2 className="animate-spin" />} title="Starting Katechon" />;
  }

  return (
    <main className="katechon-shell min-h-screen overflow-hidden text-foreground">
      <div className="grid min-h-screen grid-cols-1 gap-3 p-3">
        <section className="min-w-0 rounded-[28px] border border-white/10 bg-black/20 p-3 shadow-2xl shadow-black/30 sm:p-4">
          {active ? (
            <BroadcastStage
              channel={active}
              presetOptions={focusOptionsForChannel(active)}
              suggestedActions={active.suggestedActions ?? []}
              narration={latestNarration}
              narrationDriven={agentDriven}
              scene={latestScene}
              pendingFocusLabel={pendingFocus?.channelId === active.id ? pendingFocus.label : null}
              onChoosePreset={choosePreset}
              onChooseSuggested={chooseSuggestedAction}
            />
          ) : (
            <ShellState icon={<Tv />} title="Nothing is on yet" />
          )}
        </section>
      </div>
      <AvatarHost
        speechText={avatarSpeechText}
        speechKey={avatarSpeechKey}
        onSpeechEnd={handleAvatarSpeechEnd}
      />
      <button
        type="button"
        onClick={flushActiveNarration}
        aria-label="Flush narration queue"
        title="Flush narration queue"
        className="fixed right-52 top-4 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur hover:bg-white/10 hover:text-white disabled:opacity-40"
        disabled={!active || flushingNarration || Boolean(pendingFocus) || Boolean(pendingPreview)}
      >
        {flushingNarration ? <Loader2 size={15} className="animate-spin" /> : <Eraser size={15} />}
      </button>
      <button
        type="button"
        onClick={resetAllChannels}
        aria-label="Reset all channels"
        className="fixed right-40 top-4 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur hover:bg-white/10 hover:text-white disabled:opacity-40"
        disabled={channels.length === 0 || Boolean(pendingFocus) || Boolean(pendingPreview) || applying}
      >
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        onClick={() => {
          setAgentPromptError(null);
          setAgentPromptOpen(true);
        }}
        aria-label="Run agent"
        disabled={!active || Boolean(pendingFocus) || Boolean(pendingPreview)}
        className="fixed right-28 top-4 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-accent-green/40 bg-accent-green/15 text-accent-green shadow-lg backdrop-blur hover:bg-accent-green/25 disabled:opacity-40"
      >
        <Bot size={16} />
        {agentBusy ? (
          <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 animate-pulse rounded-full border border-black bg-accent-green" />
        ) : null}
      </button>
      <button
        type="button"
        onClick={shareActiveChannel}
        aria-label="Share channel"
        className="fixed right-16 top-4 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur hover:bg-white/10 hover:text-white"
      >
        <Share2 size={15} />
        {shareCopied ? (
          <span className="absolute right-0 top-11 rounded-full border border-white/10 bg-black/75 px-3 py-1 text-[11px] text-white/75 backdrop-blur">
            Copied
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label="Open settings"
        className="fixed right-4 top-4 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur hover:bg-white/10 hover:text-white"
      >
        <Settings size={16} />
        {apiKeyProviders.length > 0 ? (
          <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border border-black bg-accent-green" />
        ) : null}
      </button>
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        getToken={auth.getToken}
        onProvidersChanged={setApiKeyProviders}
      />
      {agentBusy ? (
        <div className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-2 text-xs text-white/70 backdrop-blur">
          <Loader2 size={14} className="animate-spin text-accent-green" />
          Agent working…
        </div>
      ) : null}
      {pendingPreview ? (
        <MutationPreviewModal
          label={pendingPreview.label}
          preview={pendingPreview.preview}
          applying={applying}
          onApply={applyPreview}
          onCancel={cancelPreview}
        />
      ) : null}
      {agentPromptOpen && active ? (
        <RunAgentModal
          channelTitle={active.spec.title}
          pending={pendingFocus?.label === "Sending…"}
          error={agentPromptError}
          onCancel={() => setAgentPromptOpen(false)}
          onSubmit={async (prompt) => {
            const ok = await submitAgentPrompt(prompt);
            if (ok) setAgentPromptOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

function RunAgentModal({
  channelTitle,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  channelTitle: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-md">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-surface-1 p-6 shadow-2xl">
        <header className="mb-4 flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-full border border-accent-green/30 bg-accent-green/10 text-accent-green">
            <Bot size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-2xl font-semibold text-white">Run channel agent</h2>
            <p className="mt-1 text-xs text-white/55 truncate">Channel: {channelTitle}</p>
          </div>
        </header>
        <p className="mb-3 text-sm text-white/65">
          Describe what the agent should change. It can add a map, a ticker, popups,
          switch focus, or anything within this channel&apos;s capabilities.
        </p>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          autoFocus
          disabled={pending}
          placeholder="e.g. Add a live map of the Strait of Hormuz behind the broadcast."
          rows={5}
          className="w-full rounded-2xl border border-white/10 bg-black/35 p-3 text-sm text-white/85 placeholder:text-white/35 focus:border-accent-green/40 focus:outline-none disabled:opacity-50"
        />
        {error ? (
          <p className="mt-3 rounded-2xl border border-red-400/40 bg-red-500/10 p-3 text-xs leading-5 text-red-200">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/65 hover:bg-white/10 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(prompt)}
            disabled={!prompt.trim() || pending}
            className="inline-flex items-center gap-2 rounded-full bg-accent-green px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-black transition hover:opacity-90 disabled:opacity-40"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
            {pending ? "Sending…" : "Run agent"}
          </button>
        </div>
      </section>
    </div>
  );
}

function MutationPreviewModal({
  label,
  preview,
  applying,
  onApply,
  onCancel,
}: {
  label: string;
  preview: ChannelMutationPreview;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const diffEntries = Object.entries(preview.diff || {});
  const canApply = preview.canApply && preview.validationErrors.length === 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Cancel preview"
        onClick={onCancel}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <section className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-surface-1 p-6 shadow-2xl">
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-accent-green">Preview</div>
          <h2 className="font-heading text-2xl font-semibold text-white">{label}</h2>
          <p className="mt-1 text-sm text-white/55">
            Backend validated the proposed spec. Apply to commit, or cancel to leave the channel as-is.
          </p>
        </header>
        {preview.validationErrors.length > 0 ? (
          <div className="mb-4 rounded border border-red-400/30 bg-red-500/10 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-red-300">
              validation errors
            </div>
            <ul className="grid gap-1 text-sm text-red-200">
              {preview.validationErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {diffEntries.length === 0 ? (
          <p className="mb-4 text-sm text-white/55">No changes detected.</p>
        ) : (
          <div className="mb-4 grid max-h-72 gap-2 overflow-y-auto pr-1">
            {diffEntries.map(([path, change]) => (
              <div key={path} className="rounded border border-white/10 bg-black/30 p-3">
                <div className="text-[10px] uppercase tracking-[0.14em] text-accent-blue">{path}</div>
                <div className="mt-2 grid gap-1 text-xs">
                  <DiffSide label="before" value={change.before} tone="muted" />
                  <DiffSide label="after" value={change.after} tone="accent" />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!canApply || applying}
            className="inline-flex items-center gap-2 rounded bg-accent-green px-4 py-2 text-sm font-bold text-black transition-opacity disabled:opacity-40"
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : null}
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}

function DiffSide({
  label,
  value,
  tone,
}: {
  label: string;
  value: unknown;
  tone: "muted" | "accent";
}) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2">
      <span
        className={
          tone === "muted"
            ? "text-white/35"
            : "text-accent-green"
        }
      >
        {label}
      </span>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-white/75">
        {previewValue(value)}
      </pre>
    </div>
  );
}

function previewValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function previewFromMutation(
  channel: Channel,
  mutation: ChannelMutation,
): ChannelMutationPreview {
  return {
    mutation: { id: mutation.id },
    canApply: mutation.status === "previewed" && mutation.validationErrors.length === 0,
    validationErrors: mutation.validationErrors,
    currentSpec: channel.spec,
    proposedSpec: mutation.proposedSpec,
    diff: mutation.diff,
  };
}

function BroadcastStage({
  channel,
  presetOptions,
  suggestedActions,
  narration,
  narrationDriven,
  scene,
  pendingFocusLabel,
  onChoosePreset,
  onChooseSuggested,
}: {
  channel: Channel;
  presetOptions: FocusOption[];
  suggestedActions: ChannelSuggestedAction[];
  narration?: ChannelNarrationMessage | null;
  narrationDriven?: boolean;
  scene?: ChannelNarrationMessage["scene"] | null;
  pendingFocusLabel: string | null;
  onChoosePreset: (option: FocusOption) => void;
  onChooseSuggested: (option: ChannelSuggestedAction) => void;
}) {
  return (
    <div className="boot-in flex min-h-[calc(100vh-32px)] flex-col gap-4">
      <section className="grid flex-1 gap-4">
        <div className="katechon-stage relative min-h-[calc(100vh-64px)] overflow-hidden rounded-[30px] border border-white/10 bg-black matrix-scanline">
          <ChannelGrid
            channel={channel}
            narration={narration}
            narrationDriven={narrationDriven}
            scene={scene}
          />
          <FocusSwitcher
            presets={presetOptions}
            suggested={suggestedActions}
            pendingLabel={pendingFocusLabel}
            onChoosePreset={onChoosePreset}
            onChooseSuggested={onChooseSuggested}
          />
        </div>
      </section>
    </div>
  );
}

function FocusSwitcher({
  presets,
  suggested,
  pendingLabel,
  onChoosePreset,
  onChooseSuggested,
}: {
  presets: FocusOption[];
  suggested: ChannelSuggestedAction[];
  pendingLabel: string | null;
  onChoosePreset: (option: FocusOption) => void;
  onChooseSuggested: (option: ChannelSuggestedAction) => void;
}) {
  if (presets.length === 0 && suggested.length === 0) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-5 z-40 flex -translate-x-1/2 rounded-full border border-white/10 bg-black/45 p-1 shadow-2xl shadow-black/30 backdrop-blur-xl sm:top-6">
      {presets.map((option) => {
        const pending = pendingLabel === option.label;
        return (
          <button
            key={`preset-${option.label}`}
            type="button"
            disabled={Boolean(pendingLabel)}
            onClick={() => onChoosePreset(option)}
            title={option.hint}
            className={`min-w-24 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${
              pending
                ? "bg-accent-green text-black"
                : "text-white/62 hover:bg-white/10 hover:text-white disabled:opacity-40"
            }`}
          >
            {pending ? "Changing…" : option.label}
          </button>
        );
      })}
      {suggested.map((option) => {
        const pending = pendingLabel === option.label;
        return (
          <button
            key={`agent-${option.label}`}
            type="button"
            disabled={Boolean(pendingLabel)}
            onClick={() => onChooseSuggested(option)}
            title={option.prompt}
            className={`min-w-24 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${
              pending
                ? "bg-accent-blue text-black"
                : "border border-accent-blue/30 text-accent-blue/80 hover:bg-accent-blue/10 hover:text-accent-blue disabled:opacity-40"
            }`}
          >
            {pending ? "Asking…" : option.label}
          </button>
        );
      })}
    </div>
  );
}

function ShellState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-0">
      <div className="text-center text-white/55">
        <div className="mx-auto mb-4 grid size-14 place-items-center border border-accent-green/30 bg-accent-green/10 text-accent-green">
          {icon}
        </div>
        <p className="font-heading text-2xl text-white">{title}</p>
      </div>
    </div>
  );
}

function extractBroadcastItems(channel: Channel): BroadcastItem[] {
  // For news channels, the keyword-filter component currently doesn't receive
  // spec constraints — `filtered_wire`'s server-side output is effectively the
  // same as `wire`. We read raw wire items and apply `applyNewsFocus` on the
  // client using the spec's declared include/exclude/region, so the focus
  // switcher actually narrows the broadcast. Backend constraint propagation
  // is a separate slice.
  const dataSource =
    channel.spec.channelType === "news"
      ? (channel.dataSourcesData.find((s) => s.sourceId === "wire" && !s.error) ??
        preferredSource(channel))
      : preferredSource(channel);
  const rawItems = getPayloadItems(dataSource?.data);
  const filtered =
    channel.spec.channelType === "news"
      ? applyNewsFocus(channel, rawItems)
      : rawItems;
  const limit = clampNumber(channel.spec.playout?.limit ?? 100, 1, 250);
  return filtered
    .map((item, index) => normalizeBroadcastItem(item, index, dataSource))
    .filter((item): item is BroadcastItem => Boolean(item))
    .sort((a, b) => {
      const ta = a.published ? Date.parse(a.published) : 0;
      const tb = b.published ? Date.parse(b.published) : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

function preferredSource(channel: Channel): ChannelDataSourceData | null {
  const sourceRef = channel.spec.playout?.sourceRef;
  const byPlayout = sourceRef
    ? channel.dataSourcesData.find((source) => source.sourceId === sourceRef && !source.error)
    : null;
  if (byPlayout) return byPlayout;
  return (
    channel.dataSourcesData.find((source) => source.sourceId === "filtered_wire" && !source.error) ??
    channel.dataSourcesData.find((source) => source.sourceId === "wire" && !source.error) ??
    channel.dataSourcesData.find((source) => getPayloadItems(source.data).length > 0) ??
    channel.dataSourcesData[0] ??
    null
  );
}

function getPayloadItems(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? items : [];
}

function applyNewsFocus(channel: Channel, items: unknown[]): unknown[] {
  if (channel.spec.channelType !== "news") return items;
  const filterSource = channel.spec.dataSources.find((source) => source.id === "filtered_wire");
  const wireSource = channel.spec.dataSources.find((source) => source.id === "wire");
  const include = normalizeIncludeGroups(filterSource?.constraints.include);
  const exclude = normalizeStringList(filterSource?.constraints.exclude);
  const region = readConstraintString(filterSource?.constraints.region) || readConstraintString(wireSource?.constraints.region);
  const topic = readConstraintString(filterSource?.constraints.topic) || readConstraintString(wireSource?.constraints.topic);
  const regionTerms = region && region !== "global" ? regionTermsFor(region) : [];
  const topicTerms = topic ? [topic] : [];

  return items.filter((item) => {
    const haystack = itemSearchText(item);
    if (!haystack) return false;
    if (exclude.some((term) => haystack.includes(term.toLowerCase()))) return false;
    if (regionTerms.length > 0 && !regionTerms.some((term) => haystack.includes(term.toLowerCase()))) return false;
    if (topicTerms.length > 0 && !topicTerms.some((term) => haystack.includes(term.toLowerCase()))) return false;
    return include.every((group) => group.some((term) => haystack.includes(term.toLowerCase())));
  });
}

function itemSearchText(item: unknown): string {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const record = item as Record<string, unknown>;
  return [record.title, record.summary, record.description, record.text, record.feed, record.source]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function normalizeIncludeGroups(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "string")) {
    const terms = (value as string[]).filter((term) => term.trim().length > 0);
    return terms.length > 0 ? [terms] : [];
  }
  return value
    .filter((group): group is string[] => Array.isArray(group))
    .map((group) => group.filter((term): term is string => typeof term === "string" && term.trim().length > 0))
    .filter((group) => group.length > 0);
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((term): term is string => typeof term === "string" && term.trim().length > 0)
    : [];
}

function readConstraintString(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

function regionTermsFor(region: string): string[] {
  if (region === "europe") {
    return [
      "europe",
      "european",
      "eu ",
      "nato",
      "france",
      "germany",
      "uk",
      "britain",
      "spain",
      "italy",
      "poland",
      "netherlands",
      "brussels",
      "berlin",
      "paris",
      "madrid",
      "rome",
      "london",
      "warsaw",
    ];
  }
  if (region === "iran") {
    return ["iran", "iranian", "tehran", "khamenei", "irgc"];
  }
  return [region.replace(/-/g, " ")];
}

function normalizeBroadcastItem(
  value: unknown,
  index: number,
  source: ChannelDataSourceData | null,
): BroadcastItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const title = readString(item.title) || readString(item.question) || readString(item.name);
  if (!title) return null;
  const summary =
    readString(item.summary) ||
    readString(item.description) ||
    readString(item.text) ||
    predictionMarketSummary(item);
  const feed = readString(item.feed) || readString(item.source) || source?.sourceId || "source";
  const link = readString(item.link) || readString(item.url);
  const published = readString(item.published) || readString(item.publishedAt) || null;
  return {
    id: readString(item.id) || readString(item.link) || `${source?.sourceId ?? "slot"}-${index}`,
    title,
    summary,
    source: feed,
    published,
    link,
    kicker: source?.sourceType ?? "feed",
  };
}

function normalizePolymarketClientMarket(
  value: unknown,
  index: number,
): BroadcastItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const market = value as Partial<PolymarketClientMarket>;
  const title = typeof market.question === "string" ? market.question.trim() : "";
  if (!title) return null;
  const id =
    (typeof market.id === "string" && market.id.trim()) ||
    (typeof market.slug === "string" && market.slug.trim()) ||
    `polymarket-${index}`;
  const summaryParts: string[] = [];
  if (typeof market.yesPrice === "number" && Number.isFinite(market.yesPrice)) {
    summaryParts.push(`YES is priced around ${Math.round(market.yesPrice * 100)}%.`);
  }
  if (typeof market.volume24hr === "number" && Number.isFinite(market.volume24hr)) {
    summaryParts.push(`24 hour volume is about ${formatCompactCurrency(market.volume24hr)}.`);
  }
  return {
    id,
    title,
    summary: summaryParts.join(" "),
    source: "polymarket",
    published: null,
    link: typeof market.url === "string" ? market.url : "",
    kicker: "prediction-market",
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function predictionMarketSummary(item: Record<string, unknown>): string {
  const yes =
    readNumberValue(item.yesProb) ??
    readNumberValue(item.yesPrice) ??
    readOutcomePrice(item, "yes");
  const volume = readNumberValue(item.volume24h) ?? readNumberValue(item.volume24hr);
  const parts: string[] = [];
  if (yes !== null) parts.push(`YES is priced around ${Math.round(yes * 100)}%.`);
  if (volume !== null && volume > 0) {
    parts.push(`24 hour volume is about ${formatCompactCurrency(volume)}.`);
  }
  return parts.join(" ");
}

function readOutcomePrice(item: Record<string, unknown>, outcome: string): number | null {
  const outcomes = Array.isArray(item.outcomes) ? item.outcomes.map((value) => String(value)) : [];
  const prices = Array.isArray(item.outcomePrices) ? item.outcomePrices : [];
  const index = outcomes.findIndex((value) => value.toLowerCase() === outcome);
  if (index < 0) return null;
  return readNumberValue(prices[index]);
}

function readNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD",
  }).format(value);
}

function speechTextForItem(item: BroadcastItem): string {
  return [item.title, item.summary].filter(Boolean).join(". ");
}

function createShareSnapshot(channel: Channel, items: BroadcastItem[]): ShareSnapshot {
  const cloned = JSON.parse(JSON.stringify(channel)) as Channel;
  cloned.mutations = [];
  cloned.agentJobs = [];
  cloned.narrationMessages = [];

  if (cloned.spec.channelType === "news") {
    const snapshotItems = items.slice(0, 12).map((item) => ({
      id: item.id,
      title: truncateForShare(item.title, 180),
      summary: truncateForShare(item.summary, 360),
      source: truncateForShare(item.source, 90),
      published: item.published,
      link: truncateForShare(item.link, 300),
    }));
    cloned.dataSourcesData = [
      {
        sourceId: "wire",
        sourceType: "shared-preview",
        componentRef: null,
        componentId: null,
        pluginType: null,
        data: { items: snapshotItems },
        lastRunAt: new Date().toISOString(),
        error: null,
      },
      {
        sourceId: "filtered_wire",
        sourceType: "shared-preview",
        componentRef: null,
        componentId: null,
        pluginType: null,
        data: { items: snapshotItems },
        lastRunAt: new Date().toISOString(),
        error: null,
      },
    ];
  } else {
    cloned.dataSourcesData = [];
  }

  return { createdAt: Date.now(), channel: cloned };
}

function encodeShareSnapshot(snapshot: ShareSnapshot): string {
  const json = JSON.stringify(snapshot);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeShareSnapshot(encoded: string): ShareSnapshot | null {
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json) as ShareSnapshot;
    return parsed?.channel?.spec ? parsed : null;
  } catch {
    return null;
  }
}

function truncateForShare(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}


function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function itemsFingerprint(items: BroadcastItem[]): string {
  return items
    .slice(0, 8)
    .map((item) => item.id)
    .join("|");
}

function mergeNarration(
  existing: ChannelNarrationMessage[],
  incoming: ChannelNarrationMessage,
): ChannelNarrationMessage[] {
  if (existing.some((m) => m.id === incoming.id)) return existing;
  return [incoming, ...existing].slice(0, NARRATION_KEEP);
}

function orderNarrationMessages(
  messages: ChannelNarrationMessage[] | null | undefined,
): ChannelNarrationMessage[] {
  if (!messages?.length) return [];
  return [...messages].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

function nextQueuedNarration(
  messages: ChannelNarrationMessage[],
  playedIds: Set<string>,
): ChannelNarrationMessage | null {
  return messages.find((message) => !playedIds.has(message.id)) ?? null;
}

function isInterruptedSpeechEnd(event: AvatarSpeechEvent): boolean {
  return event.natural === false && !["decode-error", "error", "unavailable"].includes(event.reason ?? "");
}

function mergeAgentJob(
  existing: ChannelAgentJob[],
  incoming: ChannelAgentJob,
): ChannelAgentJob[] {
  const filtered = existing.filter((j) => j.id !== incoming.id);
  return [incoming, ...filtered].slice(0, 16);
}
