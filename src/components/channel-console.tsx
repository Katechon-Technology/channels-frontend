"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Activity,
  Bot,
  Captions,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  Power,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Tv,
  X,
  Zap,
} from "lucide-react";
import {
  applyMutation,
  createChannel,
  loadChannels,
  refreshChannelData,
  rejectMutation,
  requestMutation,
} from "@/lib/graphql";
import type {
  Channel,
  ChannelDataSourceData,
  ChannelTemplate,
} from "@/lib/types";

const POLL_MS = 30_000;
const TICK_MS = 250;

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

export function ChannelConsole() {
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
    loginCopy: "Privy login gates your channel mutations.",
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
    loginCopy: "Local dev auth is active. Requests use a literal Privy DID.",
    modeLabel: "dev",
  };
}

function ChannelConsoleInner({ auth }: { auth: AuthSession }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<ChannelTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playIndex, setPlayIndex] = useState(0);
  const [segmentStartedAt, setSegmentStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const active = useMemo(
    () => channels.find((channel) => channel.id === activeId) ?? channels[0] ?? null,
    [activeId, channels],
  );
  const latestPreview =
    active?.mutations.find((mutation) => mutation.status === "previewed") ?? null;
  const playout = active?.spec.playout;
  const durationSeconds = clampNumber(playout?.itemDurationSeconds ?? 10, 3, 300);
  const items = useMemo(() => (active ? extractBroadcastItems(active) : []), [active]);
  const itemKey = useMemo(() => itemsFingerprint(items), [items]);
  const currentItem = items.length ? items[playIndex % items.length] : null;
  const upNext = items.length
    ? Array.from({ length: Math.min(7, Math.max(items.length - 1, 0)) }, (_, idx) =>
        items[(playIndex + idx + 1) % items.length],
      )
    : [];
  const progress = Math.min(
    1,
    Math.max(0, (now - segmentStartedAt) / (durationSeconds * 1000)),
  );

  const refresh = useCallback(
    async (options: { autoTune?: boolean; quiet?: boolean } = {}) => {
      if (!options.quiet) setError(null);
      try {
        const token = await auth.getToken();
        const data = await loadChannels(token);
        let nextChannels = data.channels;
        let nextTemplates = data.channelTemplates;

        if (
          options.autoTune &&
          auth.modeLabel === "dev" &&
          nextChannels.length === 0 &&
          nextTemplates.some((template) => template.slug === "international-news")
        ) {
          const created = await createChannel("international-news", token);
          const afterCreate = await loadChannels(token);
          nextChannels =
            afterCreate.channels.length > 0
              ? afterCreate.channels
              : [created.createChannelFromTemplate];
          nextTemplates = afterCreate.channelTemplates;
        }

        setTemplates(nextTemplates);
        setChannels(nextChannels);
        setActiveId((current) =>
          current && nextChannels.some((channel) => channel.id === current)
            ? current
            : nextChannels[0]?.id ?? null,
        );
      } catch (err) {
        if (!options.quiet) setError(err instanceof Error ? err.message : String(err));
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

  useEffect(() => {
    setPlayIndex(0);
    setSegmentStartedAt(Date.now());
    setNow(Date.now());
  }, [active?.id, active?.activeSpecVersion.id, itemKey]);

  useEffect(() => {
    if (items.length === 0) return;
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow - segmentStartedAt >= durationSeconds * 1000) {
        setPlayIndex((index) => (items.length > 1 ? (index + 1) % items.length : 0));
        setSegmentStartedAt(nextNow);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [durationSeconds, items.length, segmentStartedAt]);

  async function createFromTemplate(templateSlug: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await createChannel(templateSlug, await auth.getToken());
      setChannels((current) => [data.createChannelFromTemplate, ...current]);
      setActiveId(data.createChannelFromTemplate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitTuning() {
    if (!active || !prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await requestMutation(active.id, prompt.trim(), await auth.getToken());
      setPrompt("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function applyPreview(mutationId: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await applyMutation(mutationId, await auth.getToken());
      setChannels((current) =>
        current.map((channel) =>
          channel.id === data.applyChannelMutation.channel.id
            ? data.applyChannelMutation.channel
            : channel,
        ),
      );
      setActiveId(data.applyChannelMutation.channel.id);
      await refresh({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function rejectPreview(mutationId: string) {
    setLoading(true);
    setError(null);
    try {
      await rejectMutation(mutationId, await auth.getToken());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function forceRefreshActive() {
    if (!active) return;
    setRefreshing(true);
    setError(null);
    try {
      await refreshChannelData(active.id, null, await auth.getToken());
      await refresh({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  if (!auth.ready || booting) {
    return <ShellState icon={<Loader2 className="animate-spin" />} title="Booting tuner" />;
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
    <main className="min-h-screen overflow-hidden bg-[#090b0c] text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_350px]">
        <ChannelRail
          activeId={active?.id ?? null}
          channels={channels}
          templates={templates}
          loading={loading}
          auth={auth}
          onSelect={(channelId) => setActiveId(channelId)}
          onCreate={createFromTemplate}
        />

        <section className="min-w-0 border-x border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(0,232,123,0.08),transparent_30%),linear-gradient(180deg,#101314,#070808)] p-3 sm:p-5">
          {active ? (
            <BroadcastStage
              channel={active}
              item={currentItem}
              items={items}
              upNext={upNext}
              progress={progress}
              durationSeconds={durationSeconds}
              refreshing={refreshing}
              onRefresh={forceRefreshActive}
            />
          ) : (
            <ShellState icon={<Tv />} title="No tuned channels" />
          )}
        </section>

        <aside className="bg-[#121516] p-4">
          <TunerPanel
            active={active}
            prompt={prompt}
            loading={loading}
            error={error}
            latestPreview={latestPreview}
            onPrompt={setPrompt}
            onSubmit={submitTuning}
            onApply={applyPreview}
            onReject={rejectPreview}
          />
          <NarrationPanel channel={active} />
        </aside>
      </div>
    </main>
  );
}

function ChannelRail({
  activeId,
  channels,
  templates,
  loading,
  auth,
  onSelect,
  onCreate,
}: {
  activeId: string | null;
  channels: Channel[];
  templates: ChannelTemplate[];
  loading: boolean;
  auth: AuthSession;
  onSelect: (channelId: string) => void;
  onCreate: (templateSlug: string) => void;
}) {
  return (
    <aside className="bg-[#0d0f10] p-4">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-accent-green">
            <Zap size={13} />
            on air
          </div>
          <h1 className="font-heading text-2xl font-semibold">Katechon TV</h1>
        </div>
        <button
          onClick={auth.logout}
          className="grid size-9 place-items-center rounded border border-white/10 bg-white/5 text-white/55 hover:text-white"
          title="Exit"
        >
          <Power size={16} />
        </button>
      </div>

      <div className="mb-5 border border-white/10 bg-black/35 p-3 text-xs text-white/45">
        <div className="truncate">{auth.operatorLabel}</div>
        <div className="mt-2 inline-flex items-center gap-2 border border-accent-blue/25 bg-accent-blue/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-accent-blue">
          <Radio size={12} />
          {auth.modeLabel}
        </div>
      </div>

      <div className="mb-6 grid gap-2">
        {channels.map((channel, index) => (
          <button
            key={channel.id}
            onClick={() => onSelect(channel.id)}
            className={`grid grid-cols-[54px_minmax(0,1fr)_20px] items-center gap-3 border p-3 text-left transition-colors ${
              channel.id === activeId
                ? "border-accent-green/50 bg-accent-green/10 text-white"
                : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25"
            }`}
          >
            <span className="font-heading text-sm text-accent-green">
              CH {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-base">{channel.name}</span>
              <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.14em] text-white/35">
                {channel.spec.channelType} / v{channel.activeSpecVersion.versionNumber}
              </span>
            </span>
            <ChevronRight size={16} className="text-white/25" />
          </button>
        ))}
      </div>

      <div className="border-t border-white/10 pt-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
          add channel
        </div>
        <div className="grid gap-2">
          {templates.map((template) => (
            <button
              key={template.slug}
              disabled={loading}
              onClick={() => onCreate(template.slug)}
              className="border border-white/10 bg-black/25 px-3 py-2 text-left text-xs text-white/55 hover:border-accent-blue/40 hover:text-white disabled:opacity-40"
            >
              {template.name}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function BroadcastStage({
  channel,
  item,
  items,
  upNext,
  progress,
  durationSeconds,
  refreshing,
  onRefresh,
}: {
  channel: Channel;
  item: BroadcastItem | null;
  items: BroadcastItem[];
  upNext: BroadcastItem[];
  progress: number;
  durationSeconds: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const source = preferredSource(channel);
  const isHyperliquidPreview =
    channel.spec.channelType === "hyperliquid" && !source?.componentId;

  return (
    <div className="flex min-h-[calc(100vh-40px)] flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-black/35 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 place-items-center border border-accent-green/30 bg-accent-green/10 text-accent-green">
            <Tv size={20} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-accent-green">
              live channel
            </div>
            <h2 className="truncate font-heading text-2xl font-semibold sm:text-3xl">
              {channel.spec.title}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="border border-white/10 bg-white/[0.04] px-3 py-2 text-white/50">
            {items.length} slots / {durationSeconds}s
          </span>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 border border-accent-blue/35 bg-accent-blue/10 px-3 text-accent-blue hover:bg-accent-blue/15 disabled:opacity-45"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="relative min-h-[520px] overflow-hidden border border-white/10 bg-black matrix-scanline">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(77,158,255,0.12),transparent_30%),radial-gradient(circle_at_25%_80%,rgba(255,176,32,0.08),transparent_25%)]" />
          <div className="relative flex h-full min-h-[520px] flex-col p-5 sm:p-7">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em]">
              <span className="inline-flex items-center gap-2 text-accent-green">
                <Activity size={14} />
                transmitting
              </span>
              <span className="text-white/35">{sourceStatus(source)}</span>
            </div>

            {item ? (
              <article className="flex flex-1 flex-col justify-end">
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="border border-accent-green/30 bg-accent-green/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-accent-green">
                    {item.kicker}
                  </span>
                  <span className="border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/45">
                    {formatDate(item.published)}
                  </span>
                </div>
                <h3 className="max-w-5xl font-heading text-4xl font-semibold leading-tight text-white sm:text-6xl">
                  {item.title}
                </h3>
                <p className="mt-5 max-w-4xl text-base leading-7 text-white/65 sm:text-lg">
                  {item.summary || "No summary was provided by the source."}
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
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
            ) : isHyperliquidPreview ? (
              <SpecDrivenMarketPreview channel={channel} />
            ) : (
              <OffAirState channel={channel} source={source} />
            )}
          </div>
        </div>

        <ProgramGuide items={upNext} current={item} channel={channel} />
      </section>

      <LowerThird channel={channel} item={item} />
    </div>
  );
}

function ProgramGuide({
  items,
  current,
  channel,
}: {
  items: BroadcastItem[];
  current: BroadcastItem | null;
  channel: Channel;
}) {
  return (
    <aside className="border border-white/10 bg-black/35 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">program queue</div>
        <span className="text-[10px] uppercase tracking-[0.16em] text-accent-amber">
          {channel.spec.playout?.strategy ?? "latest-first"}
        </span>
      </div>
      {current && (
        <div className="mb-3 border border-accent-green/30 bg-accent-green/10 p-3">
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-accent-green">
            now
          </div>
          <p className="text-sm font-semibold leading-5 text-white">{current.title}</p>
        </div>
      )}
      <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
        {items.map((item, index) => (
          <article key={`${item.id}-${index}`} className="border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-white/35">
              <span>next {String(index + 1).padStart(2, "0")}</span>
              <span>{formatDate(item.published)}</span>
            </div>
            <h4 className="text-sm font-semibold leading-5 text-white/80">{item.title}</h4>
            <p className="mt-2 text-xs leading-5 text-white/45">{item.source}</p>
          </article>
        ))}
        {items.length === 0 && (
          <div className="border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/45">
            The queue will populate once the selected data source returns broadcastable items.
          </div>
        )}
      </div>
    </aside>
  );
}

function TunerPanel({
  active,
  prompt,
  loading,
  error,
  latestPreview,
  onPrompt,
  onSubmit,
  onApply,
  onReject,
}: {
  active: Channel | null;
  prompt: string;
  loading: boolean;
  error: string | null;
  latestPreview: Channel["mutations"][number] | null;
  onPrompt: (value: string) => void;
  onSubmit: () => void;
  onApply: (mutationId: string) => void;
  onReject: (mutationId: string) => void;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Bot size={18} className="text-accent-green" />
        <h2 className="font-heading text-xl font-semibold">Remote Tuner</h2>
      </div>
      <textarea
        value={prompt}
        onChange={(event) => onPrompt(event.target.value)}
        placeholder="Narrow this to European news, then Berlin tax and finance..."
        className="h-36 w-full resize-none border border-surface-3 bg-black/35 p-3 text-sm text-white/80 outline-none focus:border-accent-green/50"
      />
      <button
        disabled={!active || loading || !prompt.trim()}
        onClick={onSubmit}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-accent-green px-4 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        Request retune
      </button>
      {error && (
        <div className="mt-3 border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-200">
          {error}
        </div>
      )}

      {latestPreview && (
        <section className="mt-5 border border-accent-amber/30 bg-accent-amber/10 p-3">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-accent-amber">
            <Sparkles size={14} />
            retune proposal
          </div>
          <div className="max-h-64 overflow-auto border border-white/10 bg-black/35 p-3 text-xs text-white/60">
            <pre>{JSON.stringify(latestPreview.diff, null, 2)}</pre>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              disabled={loading}
              onClick={() => onApply(latestPreview.id)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded bg-accent-green text-sm font-bold text-black"
            >
              <Check size={15} />
              Apply
            </button>
            <button
              disabled={loading}
              onClick={() => onReject(latestPreview.id)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded border border-white/10 bg-surface-2 text-sm text-white/65"
            >
              <X size={15} />
              Reject
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

function NarrationPanel({ channel }: { channel: Channel | null }) {
  return (
    <section className="mt-5 border border-surface-3 bg-black/20 p-3">
      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
        <Captions size={14} className="text-accent-blue" />
        caption bus
      </div>
      <div className="grid gap-2">
        {(channel?.narrationMessages ?? []).slice(0, 4).map((message) => (
          <div
            key={message.id}
            className="border border-white/10 bg-surface-2/50 p-2 text-xs leading-5 text-white/60"
          >
            {message.text}
          </div>
        ))}
        {!channel?.narrationMessages.length && (
          <p className="text-xs leading-5 text-white/40">
            Captions arrive independently from the channel data stream.
          </p>
        )}
      </div>
    </section>
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
        next slot
      </div>
    </div>
  );
}

function LowerThird({ channel, item }: { channel: Channel; item: BroadcastItem | null }) {
  const caption = channel.narrationMessages[0]?.text;
  return (
    <div className="border border-white/10 bg-black/45 p-3">
      <div className="grid gap-2 sm:grid-cols-[170px_minmax(0,1fr)] sm:items-center">
        <div className="font-heading text-sm uppercase tracking-[0.18em] text-accent-green">
          {channel.name}
        </div>
        <div className="truncate text-sm text-white/65">
          {caption || item?.title || "Awaiting next transmission"}
        </div>
      </div>
    </div>
  );
}

function OffAirState({
  channel,
  source,
}: {
  channel: Channel;
  source: ChannelDataSourceData | null;
}) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div className="max-w-xl">
        <div className="mx-auto mb-4 grid size-16 place-items-center border border-accent-amber/30 bg-accent-amber/10 text-accent-amber">
          <RefreshCw size={24} />
        </div>
        <h3 className="font-heading text-3xl font-semibold">Signal warming up</h3>
        <p className="mt-3 text-sm leading-6 text-white/55">
          {source?.error ||
            `${channel.spec.title} is tuned, but the selected source has not returned broadcastable items yet.`}
        </p>
      </div>
    </div>
  );
}

function SpecDrivenMarketPreview({ channel }: { channel: Channel }) {
  const source = channel.spec.dataSources.find((item) => item.id === "hyperliquid");
  const selected = stringify(source?.constraints.selectedMarket ?? "BTC");
  const timeframe = stringify(source?.constraints.timeframe ?? "5m");
  const chart = channel.spec.ui.blocks.find((block) => block.type === "markets.chart");
  const indicators = Array.isArray(chart?.props.indicators)
    ? chart.props.indicators.map((indicator) => stringify(indicator))
    : [];

  return (
    <div className="flex flex-1 flex-col justify-end">
      <div className="mb-4 inline-flex w-fit border border-accent-amber/30 bg-accent-amber/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-accent-amber">
        spec preview / no live source
      </div>
      <h3 className="font-heading text-6xl font-semibold text-white">{selected}-PERP</h3>
      <p className="mt-3 max-w-3xl text-lg leading-7 text-white/60">
        Read-only Hyperliquid channel configured for {timeframe} analytics. Live market data will appear here once a component-backed source is wired.
      </p>
      <div className="mt-8 h-60 border border-white/10 bg-black/40 p-4">
        <svg viewBox="0 0 640 220" className="h-full w-full" role="img" aria-label="Spec-driven market chart preview">
          <polyline
            points="0,160 70,145 130,171 200,96 270,112 340,64 410,82 485,48 550,71 640,55"
            fill="none"
            stroke="#00e87b"
            strokeWidth="4"
          />
          <polyline
            points="0,178 95,158 180,143 280,122 390,95 510,76 640,68"
            fill="none"
            stroke="#4d9eff"
            strokeDasharray="8 8"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {indicators.map((indicator) => (
          <span key={indicator} className="border border-accent-blue/30 bg-accent-blue/10 px-2 py-1 text-xs text-accent-blue">
            {indicator}
          </span>
        ))}
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
  const dataSource = preferredSource(channel);
  const rawItems = getPayloadItems(dataSource?.data);
  const limit = clampNumber(channel.spec.playout?.limit ?? 100, 1, 250);
  return rawItems
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

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "";
}

function sourceStatus(source: ChannelDataSourceData | null): string {
  if (!source) return "no source selected";
  if (source.error) return source.error;
  if (source.lastRunAt) return `updated ${formatDate(source.lastRunAt)}`;
  return source.componentId ? "component connected" : "spec-only source";
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
