export type ChannelSpec = {
  version: "v1";
  channelType: "news" | "hyperliquid";
  title: string;
  dataSources: Array<{
    id: string;
    type: string;
    componentRef?: string;
    constraints: Record<string, unknown>;
  }>;
  ui: {
    layout: "channel-stack" | "split-dashboard" | "market-terminal";
    blocks: ChannelBlock[];
  };
  playout?: {
    sourceRef: string;
    itemDurationSeconds: number;
    limit: number;
    strategy: "latest-first";
    resetOnMutation: boolean;
  };
  capabilities: {
    allowedDataSourceTypes: string[];
    allowedBlocks: string[];
    allowedConstraintKeys: Record<string, string[]>;
    allowedBlockProps: Record<string, string[]>;
    operations: string[];
  };
  narration: {
    enabled: boolean;
    mode: "captions-only";
    voice?: string;
    cadenceSeconds: number;
  };
};

export type ChannelBlock = {
  id: string;
  type:
    | "news.feed"
    | "news.brief"
    | "news.sources"
    | "markets.ticker"
    | "markets.chart"
    | "markets.orderbook"
    | "markets.trades"
    | "markets.funding"
    | "narration.captions";
  title?: string;
  sourceRef?: string;
  props: Record<string, unknown>;
};

export type Channel = {
  id: string;
  name: string;
  slug: string;
  templateSlug?: string | null;
  description?: string | null;
  tags: string[];
  spec: ChannelSpec;
  activeSpecVersion: { id: string; versionNumber: number };
  mutations: ChannelMutation[];
  agentJobs: ChannelAgentJob[];
  narrationMessages: ChannelNarrationMessage[];
  dataSourcesData: ChannelDataSourceData[];
};

export type ChannelTemplate = {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  spec: ChannelSpec;
};

export type ChannelMutation = {
  id: string;
  status: string;
  operation: string;
  prompt?: string | null;
  requestedPatch: unknown;
  proposedSpec: ChannelSpec;
  diff: Record<string, { before: unknown; after: unknown }>;
  validationErrors: string[];
  createdAt: string;
};

export type ChannelAgentJob = {
  id: string;
  status: string;
  prompt: string;
  error?: string | null;
  mutationId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelNarrationMessage = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
};

export type ChannelDataSourceData = {
  sourceId: string;
  sourceType: string;
  componentRef?: string | null;
  componentId?: string | null;
  pluginType?: string | null;
  data?: unknown | null;
  lastRunAt?: string | null;
  error?: string | null;
};
