"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  ChevronRight,
  Clock,
  Loader2,
  Radio,
  RotateCcw,
  RefreshCw,
  Settings,
  Share2,
  Tv,
} from "lucide-react";
import {
  applyMutation,
  createChannel,
  fetchApiKeyProviders,
  loadChannels,
  narrateChannel,
  previewChannelPatch,
  rejectMutation,
  subscribeChannelAgentJobUpdated,
  subscribeChannelNarration,
  subscribeChannelUpdated,
  type ChannelMutationPreview,
} from "@/lib/graphql";
import { latestNarrationFor } from "@/lib/channel-data";
import { AvatarHost } from "@/components/avatar-host";
import { HormuzMapBackground } from "@/components/hormuz-map-background";
import { HyperliquidBroadcast } from "@/components/hyperliquid-broadcast";
import { SettingsDrawer } from "@/components/settings-drawer";
import type {
  Channel,
  ChannelAgentJob,
  ChannelDataSourceData,
  ChannelNarrationMessage,
} from "@/lib/types";

// SSE subscriptions only deliver mutation + narration events, not plugin
// data-source refreshes — keep a moderate poll to stay current with rss/market
// data on the lazy-refresh cadence.
const POLL_MS = 30_000;
const TICK_MS = 250;
const NARRATION_KEEP = 16;

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

type FocusOption = {
  label: string;
  hint: string;
  prompt: string;
  kind:
    | "news-world"
    | "news-europe"
    | "news-iran"
    | "news-hormuz-map"
    | "market-btc"
    | "market-eth"
    | "market-sol"
    | "market-indicators";
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
  const [now, setNow] = useState(() => Date.now());
  const channel = snapshot.channel;
  const durationSeconds = clampNumber(channel.spec.playout?.itemDurationSeconds ?? 10, 3, 300);
  const items = useMemo(() => extractBroadcastItems(channel), [channel]);
  const currentItem = items.length ? items[playIndex % items.length] : null;
  const progress = Math.min(
    1,
    Math.max(0, (now - segmentStartedAt) / (durationSeconds * 1000)),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (expired || items.length === 0) return;
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
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
            item={currentItem}
            progress={progress}
            durationSeconds={durationSeconds}
            focusOptions={[]}
            pendingFocusLabel={null}
            onChooseFocus={() => {}}
            narration={null}
            narrationHint={null}
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
  const [now, setNow] = useState(() => Date.now());
  const [pendingFocus, setPendingFocus] = useState<{
    channelId: string;
    label: string;
  } | null>(null);
  const [apiKeyProviders, setApiKeyProviders] = useState<string[]>([]);
  const [narrationKeyHint, setNarrationKeyHint] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<{
    channelId: string;
    label: string;
    preview: ChannelMutationPreview;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const directorBusyRef = useRef(false);

  const active = useMemo(
    () => channels.find((channel) => channel.id === activeId) ?? channels[0] ?? null,
    [activeId, channels],
  );
  const playout = active?.spec.playout;
  const durationSeconds = clampNumber(playout?.itemDurationSeconds ?? 10, 3, 300);
  const items = useMemo(() => (active ? extractBroadcastItems(active) : []), [active]);
  const itemKey = useMemo(() => itemsFingerprint(items), [items]);
  const currentItem = items.length ? items[playIndex % items.length] : null;
  const progress = Math.min(
    1,
    Math.max(0, (now - segmentStartedAt) / (durationSeconds * 1000)),
  );

  const refresh = useCallback(
    async (options: { autoTune?: boolean; quiet?: boolean } = {}) => {
      try {
        const token = await auth.getToken();
        const data = await loadChannels(token);
        let nextChannels = data.channels;

        if (
          options.autoTune &&
          auth.modeLabel === "dev" &&
          nextChannels.length === 0 &&
          data.channelTemplates.some((template) => template.slug === "international-news")
        ) {
          const created = await createChannel("international-news", token);
          const afterCreate = await loadChannels(token);
          nextChannels =
            afterCreate.channels.length > 0
              ? afterCreate.channels
              : [created.createChannelFromTemplate];
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
    if (!auth.ready || !auth.authenticated || !active) return;
    const id = window.setInterval(() => {
      void refresh({ quiet: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [active, auth.authenticated, auth.ready, refresh]);

  // Live updates over GraphQL SSE — replaces 30s polling for the active channel.
  useEffect(() => {
    if (!auth.ready || !auth.authenticated || !active) return;
    let cancelled = false;
    const handles: Array<{ close(): void }> = [];

    const setUp = async () => {
      const token = await auth.getToken();
      if (cancelled) return;
      const channelId = active.id;

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
          setAgentBusy(job.status === "queued" || job.status === "running");
        }),
      );
    };

    void setUp();

    return () => {
      cancelled = true;
      for (const h of handles) h.close();
    };
  }, [active?.id, auth, auth.authenticated, auth.ready]);

  useEffect(() => {
    setPlayIndex(0);
    setSegmentStartedAt(Date.now());
    setNow(Date.now());
  }, [active?.id, active?.activeSpecVersion.id, itemKey]);

  const provider = apiKeyProviders[0] as "ANTHROPIC" | "OPENAI" | undefined;
  const agentDriven = !!provider;

  const recentlyShownIds = useMemo<string[]>(() => {
    if (!active) return [];
    return (active.narrationMessages ?? [])
      .map((m) => m.metadata?.chosenItemId)
      .filter((id): id is string => !!id)
      .slice(0, 8);
  }, [active?.narrationMessages]);

  const fireDirector = useCallback(
    async (recent: string[]) => {
      if (!active || !provider || items.length === 0) return;
      if (directorBusyRef.current) return;
      directorBusyRef.current = true;
      try {
        const payload = items.map((it) => ({
          id: it.id,
          title: it.title,
          summary: it.summary || null,
          link: it.link || null,
          sourceLabel: it.source || null,
        }));
        const token = await auth.getToken();
        await narrateChannel(active.id, provider, payload, recent, token);
        setNarrationKeyHint(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/MISSING_API_KEY/i.test(message) || /no api key/i.test(message)) {
          setNarrationKeyHint("Configure an API key in Settings to enable narration.");
        }
      } finally {
        directorBusyRef.current = false;
      }
    },
    [active?.id, provider, items, auth],
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

  const latestNarration = useMemo(
    () => (active ? latestNarrationFor(active.narrationMessages) : null),
    [active?.narrationMessages],
  );

  // Surface a key-missing hint when the agent can't run yet.
  useEffect(() => {
    if (agentDriven) {
      setNarrationKeyHint(null);
    } else if (apiKeyProviders.length === 0) {
      setNarrationKeyHint("Configure an API key in Settings to enable narration.");
    }
  }, [agentDriven, apiKeyProviders.length]);

  // Agent-driven scene controller: jump to the chosenItemId on every new
  // narration message, then schedule the next director call once the current
  // narration has likely played out. Falls back to the simple auto-cycler
  // below when no API key is configured.
  useEffect(() => {
    if (!agentDriven || !active || items.length === 0) return;

    if (!latestNarration) {
      // No narration yet — kick off the first scene.
      void fireDirector([]);
      return;
    }

    const chosenId = latestNarration.metadata?.chosenItemId;
    if (chosenId) {
      const idx = items.findIndex((it) => it.id === chosenId);
      if (idx >= 0 && idx !== playIndex) {
        setPlayIndex(idx);
        setSegmentStartedAt(Date.now());
      }
    }

    // Roughly model "narration is done speaking" via text length: ~55ms/char,
    // clamped to [8s, 30s]. If the message is already older than that, advance
    // very soon.
    const speakMs = Math.min(30_000, Math.max(8_000, latestNarration.text.length * 55));
    const elapsedMs = Date.now() - Date.parse(latestNarration.createdAt);
    const remainingMs = Math.max(800, speakMs - elapsedMs);

    const timer = window.setTimeout(() => {
      const recentForNext = chosenId
        ? [chosenId, ...recentlyShownIds.filter((id) => id !== chosenId)].slice(0, 8)
        : recentlyShownIds;
      void fireDirector(recentForNext);
    }, remainingMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, items, latestNarration?.id, agentDriven, fireDirector]);

  // Auto-cycler — only runs as a fallback when the agent isn't driving.
  useEffect(() => {
    if (agentDriven || items.length === 0) return;
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow - segmentStartedAt >= durationSeconds * 1000) {
        setPlayIndex((index) => (items.length > 1 ? (index + 1) % items.length : 0));
        setSegmentStartedAt(nextNow);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [agentDriven, durationSeconds, items.length, segmentStartedAt]);

  async function chooseFocus(option: FocusOption) {
    if (!active || pendingFocus || pendingPreview) return;
    setPendingFocus({ channelId: active.id, label: option.label });
    try {
      const patch = buildFocusPatch(active, option);
      const data = await previewChannelPatch(
        active.id,
        patch,
        option.prompt,
        await auth.getToken(),
      );
      if (option.kind === "news-hormuz-map" || option.kind === "market-indicators") {
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

  if (!auth.ready || booting) {
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

  return (
    <main className="katechon-shell min-h-screen overflow-hidden text-foreground">
      <div className="grid min-h-screen grid-cols-1 gap-3 p-3">
        <section className="min-w-0 rounded-[28px] border border-white/10 bg-black/20 p-3 shadow-2xl shadow-black/30 sm:p-4">
          {active ? (
            <BroadcastStage
              channel={active}
              item={currentItem}
              progress={progress}
              durationSeconds={durationSeconds}
              focusOptions={focusOptionsForChannel(active)}
              pendingFocusLabel={pendingFocus?.channelId === active.id ? pendingFocus.label : null}
              onChooseFocus={chooseFocus}
              narration={latestNarration}
              narrationHint={narrationKeyHint}
            />
          ) : (
            <ShellState icon={<Tv />} title="Nothing is on yet" />
          )}
        </section>
      </div>
      <AvatarHost
        speechText={
          latestNarration?.text ||
          (currentItem ? speechTextForItem(currentItem) : null)
        }
      />
      <button
        type="button"
        onClick={resetAllChannels}
        aria-label="Reset all channels"
        className="fixed right-28 top-4 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur hover:bg-white/10 hover:text-white disabled:opacity-40"
        disabled={channels.length === 0 || Boolean(pendingFocus) || Boolean(pendingPreview) || applying}
      >
        <RotateCcw size={15} />
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
    </main>
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

function BroadcastStage({
  channel,
  item,
  progress,
  durationSeconds,
  focusOptions,
  pendingFocusLabel,
  onChooseFocus,
  narration,
  narrationHint,
}: {
  channel: Channel;
  item: BroadcastItem | null;
  progress: number;
  durationSeconds: number;
  focusOptions: FocusOption[];
  pendingFocusLabel: string | null;
  onChooseFocus: (option: FocusOption) => void;
  narration: ChannelNarrationMessage | null;
  narrationHint: string | null;
}) {
  const showHormuzMap = hasHormuzMap(channel);

  if (channel.spec.channelType === "hyperliquid") {
    return (
      <div className="boot-in flex min-h-[calc(100vh-32px)] flex-col gap-4">
        <section className="grid flex-1 gap-4">
          <div className="katechon-stage relative min-h-[calc(100vh-64px)] overflow-hidden rounded-[30px] border border-white/10 bg-black matrix-scanline">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(125,220,255,0.15),transparent_30%),radial-gradient(circle_at_25%_80%,rgba(255,184,77,0.10),transparent_25%)]" />
            <div className="pointer-events-none absolute inset-4 rounded-[24px] border border-white/10" />
            <div className="pointer-events-none absolute bottom-0 right-0 hidden h-[48vh] w-[min(34vw,520px)] bg-[radial-gradient(ellipse_at_bottom_right,rgba(246,240,223,0.10),rgba(40,242,143,0.06)_34%,transparent_70%)] lg:block" />
            <HyperliquidBroadcast channel={channel} />
            <FocusSwitcher
              options={focusOptions}
              pendingLabel={pendingFocusLabel}
              onChoose={onChooseFocus}
            />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="boot-in flex min-h-[calc(100vh-32px)] flex-col gap-4">
      <section className="grid flex-1 gap-4">
        <div className="katechon-stage relative min-h-[calc(100vh-64px)] overflow-hidden rounded-[30px] border border-white/10 bg-black matrix-scanline">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(125,220,255,0.15),transparent_30%),radial-gradient(circle_at_25%_80%,rgba(255,184,77,0.10),transparent_25%)]" />
          {showHormuzMap ? <HormuzMapBackground /> : null}
          <div className="pointer-events-none absolute inset-4 rounded-[24px] border border-white/10" />
          <div className="pointer-events-none absolute bottom-0 right-0 hidden h-[48vh] w-[min(34vw,520px)] bg-[radial-gradient(ellipse_at_bottom_right,rgba(246,240,223,0.10),rgba(40,242,143,0.06)_34%,transparent_70%)] lg:block" />
          <FocusSwitcher
            options={focusOptions}
            pendingLabel={pendingFocusLabel}
            onChoose={onChooseFocus}
          />
          <div className="pointer-events-none absolute left-6 right-6 top-6 z-10 flex items-start justify-between gap-6 text-[10px] uppercase tracking-[0.2em] text-white/45 sm:left-8 sm:right-8 sm:top-8">
            <span className="text-accent-green">Katechon</span>
            <span className="max-w-[48vw] truncate text-right">{channel.spec.title}</span>
          </div>
          <div className="relative flex h-full min-h-[520px] flex-col p-5 pt-20 sm:p-8 sm:pt-24 lg:p-10 lg:pt-28">
            {item ? (
              <article className="flex flex-1 flex-col justify-end lg:w-[calc(100%-420px)] xl:w-[calc(100%-520px)]">
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="border border-accent-green/30 bg-accent-green/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-accent-green">
                    Now playing
                  </span>
                  <span className="border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/45">
                    {formatDate(item.published)}
                  </span>
                </div>
                <h3 className="max-w-5xl font-heading text-5xl font-extrabold leading-[0.93] tracking-tight text-white sm:text-7xl">
                  {item.title}
                </h3>
                <p className="mt-5 line-clamp-3 max-w-4xl text-base leading-7 text-white/65 sm:text-lg">
                  {item.summary || "More details are coming in."}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <a
                    href={item.link || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-2 truncate border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/60 hover:text-white"
                  >
                    <span className="truncate">{item.source}</span>
                    <ChevronRight size={15} />
                  </a>
                  <Countdown progress={progress} seconds={durationSeconds} />
                </div>
              </article>
            ) : (
              <OffAirState channel={channel} />
            )}
            <CaptionStrip narration={narration} hint={narrationHint} />
          </div>
        </div>
      </section>
    </div>
  );
}

function CaptionStrip({
  narration,
  hint,
}: {
  narration: ChannelNarrationMessage | null;
  hint: string | null;
}) {
  if (!narration && !hint) return null;
  return (
    <div className="pointer-events-none absolute bottom-6 left-6 right-[min(36vw,600px)] z-20 sm:bottom-8 sm:left-8">
      <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/55 px-5 py-3 backdrop-blur">
        {narration ? (
          <>
            <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-accent-green">
              <span>narrator</span>
              <span className="text-white/35">{narration.source}</span>
            </div>
            <p className="text-base leading-6 text-white/90">{narration.text}</p>
          </>
        ) : (
          <p className="text-xs text-white/60">{hint}</p>
        )}
      </div>
    </div>
  );
}

function FocusSwitcher({
  options,
  pendingLabel,
  onChoose,
}: {
  options: FocusOption[];
  pendingLabel: string | null;
  onChoose: (option: FocusOption) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-5 z-40 flex -translate-x-1/2 rounded-full border border-white/10 bg-black/45 p-1 shadow-2xl shadow-black/30 backdrop-blur-xl sm:top-6">
      {options.map((option) => {
        const pending = pendingLabel === option.label;
        return (
          <button
            key={option.label}
            type="button"
            disabled={Boolean(pendingLabel)}
            onClick={() => onChoose(option)}
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
    </div>
  );
}

function Countdown({ progress, seconds }: { progress: number; seconds: number }) {
  const remaining = Math.max(0, Math.ceil(seconds * (1 - progress)));
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid size-14 place-items-center rounded-full text-sm font-bold text-accent-green"
        style={{
          background: `conic-gradient(#00e87b ${progress * 360}deg, rgba(255,255,255,0.12) 0deg)`,
        }}
      >
        <div className="grid size-11 place-items-center rounded-full bg-black">
          {remaining}
        </div>
      </div>
      <div className="text-xs uppercase tracking-[0.16em] text-white/40">
        <Clock size={14} className="mb-1 text-accent-green" />
        next story
      </div>
    </div>
  );
}

function OffAirState({ channel }: { channel: Channel }) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div className="max-w-xl">
        <div className="mx-auto mb-4 grid size-16 place-items-center border border-accent-amber/30 bg-accent-amber/10 text-accent-amber">
          <RefreshCw size={24} />
        </div>
        <h3 className="font-heading text-3xl font-semibold">Coming up shortly</h3>
        <p className="mt-3 text-sm leading-6 text-white/55">
          {channel.spec.title} is getting the next segment ready.
        </p>
      </div>
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
  const summary = readString(item.summary) || readString(item.description) || readString(item.text);
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

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function focusOptionsForChannel(channel: Channel): FocusOption[] {
  if (channel.spec.channelType === "news") {
    if (hasHormuzMap(channel)) return [];
    if (isIranFocus(channel)) {
      return [
        {
          label: "Add a map of Strait of Hormuz",
          hint: "Add a live map layer around the Strait of Hormuz.",
          kind: "news-hormuz-map",
          prompt:
            "Add a cinematic map layer focused on the Strait of Hormuz, with key ports, islands, and shipping corridor points highlighted behind the Iran news broadcast.",
        },
      ];
    }
    return [
      {
        label: "World",
        hint: "Return to a broad international briefing.",
        kind: "news-world",
        prompt:
          "Make this a broad world news channel again. Set the news region to global, clear keyword include and exclude filters, keep the simple broadcast presentation, and keep story rotation readable for a general viewer.",
      },
      {
        label: "Europe",
        hint: "Focus the channel on European news.",
        kind: "news-europe",
        prompt:
          "Focus this news channel on Europe. Update the news source and keyword filter toward Europe, EU, NATO, France, Germany, UK, Britain, Spain, Italy, Poland, the Netherlands, Brussels, and major European capitals. Keep the UI as a simple viewer-facing broadcast.",
      },
      {
        label: "Iran",
        hint: "Follow Iran and the wider region.",
        kind: "news-iran",
        prompt:
          "Focus this news channel on Iran. Prioritize stories about Iran, Tehran, the IRGC, Iranian leadership, sanctions, the Persian Gulf, and Iran's relationships with neighbors and the US. Keep the UI as a simple viewer-facing broadcast.",
      },
    ];
  }

  if (channel.spec.channelType === "hyperliquid") {
    if (hasMarketSelected(channel) && !hasMarketIndicators(channel)) {
      return [
        {
          label: "Add indicators",
          hint: "Add EMA overlays and VWAP to the chart.",
          kind: "market-indicators",
          prompt:
            "Add chart overlays for this selected market: EMA 20, EMA 50, and VWAP. Keep the market and timeframe unchanged.",
        },
      ];
    }
    return [
      {
        label: "BTC",
        hint: "Watch Bitcoin on a five-minute chart.",
        kind: "market-btc",
        prompt:
          "Switch the market channel to BTC with a 5m timeframe. Update selectedMarket, the chart props, and the title so the viewer sees a BTC market watch.",
      },
      {
        label: "ETH",
        hint: "Watch Ethereum on a fifteen-minute chart.",
        kind: "market-eth",
        prompt:
          "Switch the market channel to ETH with a 15m timeframe. Update selectedMarket, the chart props, and the title so the viewer sees an ETH market watch.",
      },
      {
        label: "SOL",
        hint: "Watch Solana on a one-minute chart.",
        kind: "market-sol",
        prompt:
          "Switch the market channel to SOL with a 1m timeframe. Update selectedMarket, the chart props, and the title so the viewer sees a SOL market watch.",
      },
    ];
  }

  return [];
}

function buildResetPatch(channel: Channel): Partial<Channel["spec"]> {
  if (channel.spec.channelType === "hyperliquid") {
    return {
      title: "Hyperliquid Top Markets",
      dataSources: channel.spec.dataSources.map((source) =>
        source.id === "hyperliquid"
          ? {
              ...source,
              constraints: {
                ...source.constraints,
                mode: "top-markets",
                limit: 10,
                selectedMarket: "BTC",
                timeframe: "5m",
              },
            }
          : source,
      ),
      ui: {
        ...channel.spec.ui,
        layout: "market-terminal",
        blocks: channel.spec.ui.blocks.map((block) =>
          block.type === "markets.chart"
            ? {
                ...block,
                title: "BTC Chart",
                props: { ...block.props, market: "BTC", timeframe: "5m", indicators: [] },
              }
            : block,
        ),
      },
    };
  }

  return {
    title: "International News",
    dataSources: channel.spec.dataSources.map((source) => {
      if (source.id === "wire") {
        return {
          ...source,
          constraints: { ...source.constraints, region: "global", topic: null, event: null, limit: 100 },
        };
      }
      if (source.id === "filtered_wire") {
        return {
          ...source,
          constraints: { ...source.constraints, include: [], exclude: [], region: "global", topic: null, event: null },
        };
      }
      return source;
    }),
    playout: { ...channel.spec.playout, sourceRef: "filtered_wire", itemDurationSeconds: 10, limit: 100, strategy: "latest-first", resetOnMutation: true },
  };
}

function buildFocusPatch(channel: Channel, option: FocusOption): Partial<Channel["spec"]> {
  if (option.kind === "market-indicators") {
    return {
      ui: {
        ...channel.spec.ui,
        blocks: channel.spec.ui.blocks.map((block) =>
          block.type === "markets.chart"
            ? {
                ...block,
                props: {
                  ...block.props,
                  indicators: [
                    { type: "ema", period: 20 },
                    { type: "ema", period: 50 },
                    { type: "vwap" },
                  ],
                },
              }
            : block,
        ),
      },
    };
  }

  if (option.kind === "news-hormuz-map") {
    return {
      title: "Iran Watch · Strait of Hormuz",
      dataSources: channel.spec.dataSources.map((source) => {
        if (source.id === "wire" || source.id === "filtered_wire") {
          return {
            ...source,
            constraints: { ...source.constraints, event: "strait-of-hormuz-map" },
          };
        }
        return source;
      }),
    };
  }

  if (option.kind.startsWith("news-")) {
    const focus = newsFocusConstraints(option.kind);
    return {
      title: focus.title,
      dataSources: channel.spec.dataSources.map((source) => {
        if (source.id === "wire") {
          return {
            ...source,
            constraints: { ...source.constraints, region: focus.region, topic: focus.topic, limit: 100 },
          };
        }
        if (source.id === "filtered_wire") {
          return {
            ...source,
            constraints: {
              ...source.constraints,
              include: focus.include,
              exclude: focus.exclude,
              region: focus.region,
              topic: focus.topic,
            },
          };
        }
        return source;
      }),
      playout: { ...channel.spec.playout, sourceRef: "filtered_wire", itemDurationSeconds: 10, limit: 100, strategy: "latest-first", resetOnMutation: true },
    };
  }

  const market = option.kind === "market-eth" ? "ETH" : option.kind === "market-sol" ? "SOL" : "BTC";
  const timeframe = option.kind === "market-eth" ? "15m" : option.kind === "market-sol" ? "1m" : "5m";
  return {
    title: `${market} Market Watch`,
    dataSources: channel.spec.dataSources.map((source) =>
      source.id === "hyperliquid"
        ? {
            ...source,
            constraints: { ...source.constraints, selectedMarket: market, timeframe },
          }
        : source,
    ),
    ui: {
      ...channel.spec.ui,
      blocks: channel.spec.ui.blocks.map((block) =>
        block.type === "markets.chart"
          ? {
              ...block,
              title: `${market} Chart`,
              props: { ...block.props, market, timeframe, indicators: [] },
            }
          : block,
      ),
    },
  };
}

function hasMarketSelected(channel: Channel): boolean {
  if (channel.spec.channelType !== "hyperliquid") return false;
  const source = channel.spec.dataSources.find((item) => item.id === "hyperliquid");
  return typeof source?.constraints.selectedMarket === "string";
}

function hasMarketIndicators(channel: Channel): boolean {
  if (channel.spec.channelType !== "hyperliquid") return false;
  const chart = channel.spec.ui.blocks.find((block) => block.type === "markets.chart");
  return Array.isArray(chart?.props.indicators) && chart.props.indicators.length > 0;
}

function hasHormuzMap(channel: Channel): boolean {
  if (channel.spec.channelType !== "news") return false;
  return channel.spec.dataSources.some((source) => source.constraints.event === "strait-of-hormuz-map");
}

function isIranFocus(channel: Channel): boolean {
  if (channel.spec.channelType !== "news") return false;
  if (channel.spec.title.toLowerCase().includes("iran")) return true;
  return channel.spec.dataSources.some((source) => {
    const region = typeof source.constraints.region === "string" ? source.constraints.region.toLowerCase() : "";
    const includeText = JSON.stringify(source.constraints.include ?? "").toLowerCase();
    return region.includes("iran") || includeText.includes("iran") || includeText.includes("tehran");
  });
}

function newsFocusConstraints(kind: FocusOption["kind"]) {
  if (kind === "news-europe") {
    return {
      title: "Europe Watch",
      region: "europe",
      topic: null,
      include: [
        [
          "Europe",
          "European",
          "EU",
          "NATO",
          "France",
          "Germany",
          "UK",
          "Britain",
          "Spain",
          "Italy",
          "Poland",
          "Netherlands",
          "Brussels",
          "Berlin",
          "Paris",
          "Madrid",
          "Rome",
          "London",
          "Warsaw",
        ],
      ],
      exclude: [],
    };
  }
  if (kind === "news-iran") {
    return {
      title: "Iran Watch",
      region: "iran",
      topic: null,
      include: [
        [
          "Iran",
          "Iranian",
          "Tehran",
          "Khamenei",
          "IRGC",
          "Persian Gulf",
          "Hormuz",
          "Quds",
          "Revolutionary Guard",
        ],
      ],
      exclude: [],
    };
  }
  return {
    title: "International News",
    region: "global",
    topic: null,
    include: [],
    exclude: [],
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "undated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function mergeAgentJob(
  existing: ChannelAgentJob[],
  incoming: ChannelAgentJob,
): ChannelAgentJob[] {
  const filtered = existing.filter((j) => j.id !== incoming.id);
  return [incoming, ...filtered].slice(0, 16);
}
