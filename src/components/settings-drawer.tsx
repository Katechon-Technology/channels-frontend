"use client";

import { useEffect, useState } from "react";
import { Check, Key, Loader2, Trash2, X } from "lucide-react";
import {
  fetchApiKeyProviders,
  removeUserApiKey,
  setUserApiKey,
} from "@/lib/graphql";

type ProviderId = "ANTHROPIC" | "OPENAI";
const PROVIDERS: Array<{ id: ProviderId; label: string; hint: string }> = [
  {
    id: "ANTHROPIC",
    label: "Anthropic",
    hint: "claude-haiku-4-5 used for narration. Keys start with sk-ant-.",
  },
  {
    id: "OPENAI",
    label: "OpenAI",
    hint: "gpt-4o-mini used for narration. Keys start with sk-.",
  },
];

interface SettingsDrawerProps {
  open: boolean;
  onClose(): void;
  getToken(): Promise<string | null>;
  onProvidersChanged?(providers: string[]): void;
}

export function SettingsDrawer({
  open,
  onClose,
  getToken,
  onProvidersChanged,
}: SettingsDrawerProps) {
  const [configured, setConfigured] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ProviderId, string>>>({});
  const [busy, setBusy] = useState<Partial<Record<ProviderId, "save" | "remove">>>({});
  const [drafts, setDrafts] = useState<Record<ProviderId, string>>({
    ANTHROPIC: "",
    OPENAI: "",
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const token = await getToken();
        const data = await fetchApiKeyProviders(token);
        if (cancelled) return;
        const providers = data.me?.apiKeyProviders ?? [];
        setConfigured(providers);
        onProvidersChanged?.(providers);
      } catch (err) {
        if (!cancelled) {
          setErrors({ ANTHROPIC: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(provider: ProviderId) {
    const key = drafts[provider].trim();
    if (key.length < 8) {
      setErrors((e) => ({ ...e, [provider]: "Key looks too short." }));
      return;
    }
    setBusy((b) => ({ ...b, [provider]: "save" }));
    setErrors((e) => ({ ...e, [provider]: undefined }));
    try {
      const token = await getToken();
      await setUserApiKey(provider, key, token);
      setDrafts((d) => ({ ...d, [provider]: "" }));
      const data = await fetchApiKeyProviders(token);
      const providers = data.me?.apiKeyProviders ?? [];
      setConfigured(providers);
      onProvidersChanged?.(providers);
    } catch (err) {
      setErrors((e) => ({ ...e, [provider]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy((b) => ({ ...b, [provider]: undefined }));
    }
  }

  async function handleRemove(provider: ProviderId) {
    setBusy((b) => ({ ...b, [provider]: "remove" }));
    setErrors((e) => ({ ...e, [provider]: undefined }));
    try {
      const token = await getToken();
      await removeUserApiKey(provider, token);
      const data = await fetchApiKeyProviders(token);
      const providers = data.me?.apiKeyProviders ?? [];
      setConfigured(providers);
      onProvidersChanged?.(providers);
    } catch (err) {
      setErrors((e) => ({ ...e, [provider]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy((b) => ({ ...b, [provider]: undefined }));
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface-1 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2 font-heading text-xl font-semibold text-white">
            <Key size={18} className="text-accent-green" />
            API keys
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-white/60 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-5 text-sm leading-6 text-white/55">
            Keys are stored on the backend and used to call LLM providers on your
            behalf for narration. They are never shown again after saving.
          </p>
          <div className="grid gap-4">
            {PROVIDERS.map(({ id, label, hint }) => {
              const isConfigured = configured.includes(id);
              const error = errors[id];
              const action = busy[id];
              return (
                <section
                  key={id}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{label}</div>
                      <div className="text-xs text-white/45">{hint}</div>
                    </div>
                    {isConfigured ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent-green/30 bg-accent-green/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-accent-green">
                        <Check size={12} /> configured
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/45">
                        not set
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={isConfigured ? "Replace existing key" : "sk-…"}
                      value={drafts[id]}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [id]: e.target.value }))
                      }
                      className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-accent-green/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSave(id)}
                      disabled={action === "save" || drafts[id].trim().length < 8}
                      className="inline-flex items-center gap-2 rounded bg-accent-green px-3 py-2 text-sm font-bold text-black transition-opacity disabled:opacity-40"
                    >
                      {action === "save" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      Save
                    </button>
                    {isConfigured ? (
                      <button
                        type="button"
                        onClick={() => handleRemove(id)}
                        disabled={action === "remove"}
                        className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70 hover:text-white disabled:opacity-40"
                      >
                        {action === "remove" ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {error ? (
                    <p className="mt-2 text-xs text-red-300">{error}</p>
                  ) : null}
                </section>
              );
            })}
            {loading ? (
              <p className="text-center text-xs text-white/40">loading…</p>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
