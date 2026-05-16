import type { GridTemplateId } from "./grid-presets";

export type ChannelRegion = {
  component: string;
  props: Record<string, unknown>;
  sourceRef?: string;
};

export type ChannelSpec = {
  version: "v2";
  channelType: "news" | "hyperliquid" | "polymarket";
  title: string;
  dataSources: Array<{
    id: string;
    type: string;
    componentRef?: string;
    constraints: Record<string, unknown>;
  }>;
  ui: {
    gridTemplate: GridTemplateId;
    gap?: string;
    regions: Record<string, ChannelRegion>;
  };
  playout?: {
    sourceRef: string;
    itemDurationSeconds: number;
    limit: number;
    strategy: "latest-first";
    resetOnMutation: boolean;
  };
  capabilities: {
    allowedGridTemplates: GridTemplateId[];
    allowedComponents: string[];
    allowedDataSourceTypes: string[];
    allowedConstraintKeys: Record<string, string[]>;
    allowedComponentProps: Record<string, string[]>;
    operations: string[];
  };
  narration: {
    enabled: boolean;
    mode: "captions-only";
    voice?: string;
    cadenceSeconds: number;
  };
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
  suggestedActions: ChannelSuggestedAction[];
};

export type ChannelSuggestedAction = {
  label: string;
  prompt: string;
};

export type ChannelScene = {
  title?: string;
  speech: string;
  chosenItemId?: string;
  sourceRef?: string;
  ui?: {
    lowerThirdTitle?: string;
    lowerThirdBody?: string;
    highlightRegion?: string;
    overlayTitle?: string;
    overlayBody?: string;
  };
  tts?: {
    voice?: string;
  };
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
  kind?: string | null;
  provider?: "ANTHROPIC" | "OPENAI" | null;
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
  scene?: ChannelScene | null;
  metadata?: { chosenItemId?: string; jobId?: string; provider?: string; itemCount?: number } | null;
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
