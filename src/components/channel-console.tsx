"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Bot, Captions, Check, Loader2, Radio, Send, Tv, X } from "lucide-react";
import {
  applyMutation,
  createChannel,
  loadChannels,
  requestMutation,
  rejectMutation,
} from "@/lib/graphql";
import type { Channel, ChannelTemplate } from "@/lib/types";
import { ChannelBlockRenderer } from "./channel-blocks";

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
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(
    () => channels.find((channel) => channel.id === activeId) ?? channels[0] ?? null,
    [activeId, channels],
  );
  const latestPreview = active?.mutations.find((mutation) => mutation.status === "previewed") ?? null;

  async function refresh() {
    setError(null);
    try {
      const data = await loadChannels(await auth.getToken());
      setTemplates(data.channelTemplates);
      setChannels(data.channels);
      if (!activeId && data.channels[0]) setActiveId(data.channels[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    void refresh();
  }, [auth.ready, auth.authenticated]);

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

  if (!auth.ready) {
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
    <main className="min-h-screen bg-surface-0 text-foreground">
      <div className="grid min-h-screen grid-cols-[290px_minmax(0,1fr)_360px] gap-0">
        <aside className="border-r border-surface-3 bg-surface-1/70 p-4">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-accent-green">on air</div>
              <h1 className="font-heading text-2xl font-semibold">Channels</h1>
            </div>
            <button
              onClick={auth.logout}
              className="rounded border border-white/10 bg-surface-2 px-3 py-2 text-xs text-white/55 hover:text-white"
            >
              Exit
            </button>
          </div>

          <div className="mb-5 rounded border border-white/10 bg-black/20 p-3 text-xs text-white/45">
            <span>{auth.operatorLabel}</span>
            <span className="ml-2 rounded border border-accent-blue/25 bg-accent-blue/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-accent-blue">
              {auth.modeLabel}
            </span>
          </div>

          <div className="grid gap-2">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveId(channel.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  channel.id === active?.id
                    ? "border-accent-green/40 bg-accent-green/10"
                    : "border-white/10 bg-surface-2/40 hover:border-white/20"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate font-heading text-lg">{channel.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                    v{channel.activeSpecVersion.versionNumber}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-white/45">{channel.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/35">templates</div>
            <div className="grid gap-2">
              {templates.map((template) => (
                <button
                  key={template.slug}
                  disabled={loading}
                  onClick={() => createFromTemplate(template.slug)}
                  className="rounded border border-white/10 bg-black/20 px-3 py-2 text-left text-xs text-white/55 hover:border-accent-blue/40 hover:text-white"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0 p-5">
          {active ? (
            <ChannelViewport channel={active} />
          ) : (
            <ShellState icon={<Tv />} title="Create a channel from a template" />
          )}
        </section>

        <aside className="border-l border-surface-3 bg-surface-1/70 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Bot size={18} className="text-accent-green" />
            <h2 className="font-heading text-xl font-semibold">Tuner</h2>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Tune this channel to European news, then focus Berlin tax and finance..."
            className="h-36 w-full resize-none rounded border border-surface-3 bg-black/30 p-3 text-sm text-white/80 outline-none focus:border-accent-green/50"
          />
          <button
            disabled={!active || loading || !prompt.trim()}
            onClick={submitTuning}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-accent-green px-4 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Request mutation
          </button>
          {error && (
            <div className="mt-3 rounded border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-200">
              {error}
            </div>
          )}

          {latestPreview && (
            <section className="mt-5 rounded-lg border border-accent-amber/30 bg-accent-amber/10 p-3">
              <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-accent-amber">
                preview mutation
              </div>
              <div className="max-h-64 overflow-auto rounded border border-white/10 bg-black/35 p-3 text-xs text-white/60">
                <pre>{JSON.stringify(latestPreview.diff, null, 2)}</pre>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  disabled={loading}
                  onClick={() => applyPreview(latestPreview.id)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded bg-accent-green text-sm font-bold text-black"
                >
                  <Check size={15} />
                  Apply
                </button>
                <button
                  disabled={loading}
                  onClick={() => rejectPreview(latestPreview.id)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded border border-white/10 bg-surface-2 text-sm text-white/65"
                >
                  <X size={15} />
                  Reject
                </button>
              </div>
            </section>
          )}

          <NarrationPanel channel={active} />
        </aside>
      </div>
    </main>
  );
}

function ChannelViewport({ channel }: { channel: Channel }) {
  const blocks = channel.spec.ui.blocks;
  const grid =
    channel.spec.ui.layout === "market-terminal"
      ? "grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]"
      : "grid-cols-[minmax(0,1fr)_minmax(320px,0.46fr)]";

  return (
    <div className="min-h-[calc(100vh-40px)]">
      <header className="mb-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-accent-green">
              {channel.spec.channelType} channel
            </div>
            <h2 className="font-heading text-4xl font-semibold">{channel.spec.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">{channel.description}</p>
          </div>
          <span className="rounded border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-accent-green">
            live config
          </span>
        </div>
      </header>
      <div className={`grid gap-4 ${grid}`}>
        {blocks.map((block) => (
          <ChannelBlockRenderer key={block.id} block={block} spec={channel.spec} />
        ))}
      </div>
    </div>
  );
}

function NarrationPanel({ channel }: { channel: Channel | null }) {
  return (
    <section className="mt-5 rounded-lg border border-surface-3 bg-black/20 p-3">
      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
        <Captions size={14} className="text-accent-blue" />
        narration bus
      </div>
      <div className="grid gap-2">
        {(channel?.narrationMessages ?? []).slice(0, 4).map((message) => (
          <div key={message.id} className="rounded border border-white/10 bg-surface-2/50 p-2 text-xs leading-5 text-white/60">
            {message.text}
          </div>
        ))}
        {!channel?.narrationMessages.length && (
          <p className="text-xs leading-5 text-white/40">
            Caption messages will appear here. The avatar/TTS layer can subscribe
            separately without blocking the dashboard.
          </p>
        )}
      </div>
    </section>
  );
}

function ShellState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center text-white/55">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded border border-accent-green/30 bg-accent-green/10 text-accent-green">
          {icon}
        </div>
        <p className="font-heading text-2xl text-white">{title}</p>
      </div>
    </div>
  );
}
