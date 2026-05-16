"use client";

import { useMemo } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import type {
  Channel,
  ChannelDataSourceData,
  ChannelNarrationMessage,
} from "@/lib/types";
import type { RegionComponentProps } from "../component-registry";

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  published: string | null;
  link: string;
};

export default function BroadcastNews({ channel, narration }: RegionComponentProps) {
  const items = useMemo(() => extractItems(channel), [channel]);
  const chosenItemId = narration?.scene?.chosenItemId ?? narration?.metadata?.chosenItemId;
  const item =
    (chosenItemId ? items.find((candidate) => candidate.id === chosenItemId) : null) ??
    items[0] ??
    null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(125,220,255,0.15),transparent_30%),radial-gradient(circle_at_25%_80%,rgba(255,184,77,0.10),transparent_25%)]" />
      <div className="pointer-events-none absolute inset-4 rounded-[24px] border border-white/10" />
      <div className="pointer-events-none absolute bottom-0 right-0 hidden h-[48vh] w-[min(34vw,520px)] bg-[radial-gradient(ellipse_at_bottom_right,rgba(246,240,223,0.10),rgba(40,242,143,0.06)_34%,transparent_70%)] lg:block" />
      <div className="pointer-events-none absolute left-6 right-6 top-6 z-10 flex items-start justify-between gap-6 text-[10px] uppercase tracking-[0.2em] text-white/45 sm:left-8 sm:right-8 sm:top-8">
        <span className="text-accent-green">Katechon</span>
        <span className="max-w-[48vw] truncate text-right">{channel.spec.title}</span>
      </div>
      <div className="relative flex h-full min-h-[520px] flex-col p-5 pt-20 sm:p-8 sm:pt-24 lg:p-10 lg:pt-28">
        {item ? (
          <article
            key={item.id}
            className="scene-story-in flex flex-1 flex-col justify-end lg:w-[calc(100%-420px)] xl:w-[calc(100%-520px)]"
          >
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
            </div>
          </article>
        ) : (
          <OffAirState channel={channel} />
        )}
        <CaptionStrip key={narration?.id ?? "caption-empty"} narration={narration ?? null} />
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

function CaptionStrip({ narration }: { narration: ChannelNarrationMessage | null }) {
  if (!narration) return null;
  const title = narration.scene?.ui?.lowerThirdTitle ?? narration.scene?.title ?? "narrator";
  const body = narration.scene?.ui?.lowerThirdBody ?? narration.scene?.speech ?? narration.text;
  return (
    <div className="pointer-events-none absolute bottom-6 left-6 right-[min(36vw,600px)] z-20 sm:bottom-8 sm:left-8">
      <div className="scene-lower-in pointer-events-auto rounded-2xl border border-white/10 bg-black/55 px-5 py-3 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-accent-green">
          <span>{title}</span>
          <span className="text-white/35">{narration.source}</span>
        </div>
        <p className="text-base leading-6 text-white/90">{body}</p>
      </div>
    </div>
  );
}

function extractItems(channel: Channel): NewsItem[] {
  const dataSource =
    channel.dataSourcesData.find((s) => s.sourceId === "wire" && !s.error) ??
    channel.dataSourcesData.find((s) => !s.error) ??
    null;
  const rawItems = readPayloadItems(dataSource?.data);
  return rawItems
    .map((item, index) => normalize(item, index, dataSource))
    .filter((item): item is NewsItem => Boolean(item))
    .slice(0, 24);
}

function readPayloadItems(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? items : [];
}

function normalize(
  value: unknown,
  index: number,
  source: ChannelDataSourceData | null,
): NewsItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const title =
    readString(item.title) || readString(item.question) || readString(item.name);
  if (!title) return null;
  return {
    id:
      readString(item.id) ||
      readString(item.link) ||
      `${source?.sourceId ?? "slot"}-${index}`,
    title,
    summary:
      readString(item.summary) ||
      readString(item.description) ||
      readString(item.text),
    source:
      readString(item.feed) ||
      readString(item.source) ||
      source?.sourceId ||
      "source",
    link: readString(item.link) || readString(item.url),
    published:
      readString(item.published) || readString(item.publishedAt) || null,
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: string | null): string {
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
