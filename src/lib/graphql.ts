import type {
  Channel,
  ChannelAgentJob,
  ChannelNarrationMessage,
  ChannelTemplate,
} from "./types";

const GRAPHQL_URL = process.env.NEXT_PUBLIC_KATECHON_BACKEND_URL;

function graphqlUrl(): string {
  if (!GRAPHQL_URL) {
    throw new Error("NEXT_PUBLIC_KATECHON_BACKEND_URL is required");
  }
  return GRAPHQL_URL;
}

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string | null,
): Promise<T> {
  const resp = await fetch(graphqlUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const body = (await resp.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!resp.ok || body.errors?.length) {
    throw new Error(body.errors?.map((e) => e.message).join("; ") || `GraphQL ${resp.status}`);
  }
  if (!body.data) throw new Error("GraphQL response missing data");
  return body.data;
}

export const CHANNEL_FIELDS = `
  id
  name
  slug
  templateSlug
  description
  tags
  spec
  activeSpecVersion { id versionNumber }
  mutations {
    id
    status
    operation
    prompt
    requestedPatch
    proposedSpec
    diff
    validationErrors
    createdAt
  }
  agentJobs { id status prompt error mutationId createdAt updatedAt }
  narrationMessages(limit: 8) { id text source createdAt metadata }
  dataSourcesData {
    sourceId
    sourceType
    componentRef
    componentId
    pluginType
    data
    lastRunAt
    error
  }
  suggestedActions
`;

export async function loadChannels(token?: string | null) {
  return graphql<{
    channelTemplates: ChannelTemplate[];
    channels: Channel[];
  }>(
    `
      query Channels {
        channelTemplates { slug name description tags spec }
        channels(mine: true) { ${CHANNEL_FIELDS} }
      }
    `,
    {},
    token,
  );
}

export async function createChannel(templateSlug: string, token?: string | null) {
  return graphql<{ createChannelFromTemplate: Channel }>(
    `
      mutation CreateChannel($templateSlug: String!) {
        createChannelFromTemplate(templateSlug: $templateSlug) { ${CHANNEL_FIELDS} }
      }
    `,
    { templateSlug },
    token,
  );
}

export interface ChannelMutationPreview {
  mutation: { id: string };
  canApply: boolean;
  validationErrors: string[];
  currentSpec: import("./types").ChannelSpec;
  proposedSpec: import("./types").ChannelSpec;
  diff: Record<string, { before: unknown; after: unknown }>;
}

export async function previewChannelPatch(
  channelId: string,
  patch: unknown,
  prompt?: string | null,
  token?: string | null,
) {
  return graphql<{ previewChannelSpecPatch: ChannelMutationPreview }>(
    `
      mutation PreviewChannelSpecPatch($channelId: ID!, $patch: JSON!, $prompt: String) {
        previewChannelSpecPatch(channelId: $channelId, patch: $patch, prompt: $prompt) {
          mutation { id }
          canApply
          validationErrors
          currentSpec
          proposedSpec
          diff
        }
      }
    `,
    { channelId, patch, prompt },
    token,
  );
}

export async function requestMutation(
  channelId: string,
  prompt: string,
  token?: string | null,
) {
  return graphql<{ requestChannelMutation: ChannelAgentJob }>(
    `
      mutation RequestChannelMutation($channelId: ID!, $prompt: String!) {
        requestChannelMutation(channelId: $channelId, prompt: $prompt) {
          id
          status
          prompt
          error
          mutationId
          createdAt
          updatedAt
        }
      }
    `,
    { channelId, prompt },
    token,
  );
}

export async function applyMutation(mutationId: string, token?: string | null) {
  return graphql<{ applyChannelMutation: { channel: Channel } }>(
    `
      mutation ApplyChannelMutation($mutationId: ID!) {
        applyChannelMutation(mutationId: $mutationId) {
          channel { ${CHANNEL_FIELDS} }
        }
      }
    `,
    { mutationId },
    token,
  );
}

export async function rejectMutation(mutationId: string, token?: string | null) {
  return graphql<{ rejectChannelMutation: { id: string; status: string } }>(
    `
      mutation RejectChannelMutation($mutationId: ID!) {
        rejectChannelMutation(mutationId: $mutationId) { id status }
      }
    `,
    { mutationId },
    token,
  );
}

export interface SubscriptionHandle {
  close(): void;
}

/**
 * Open a GraphQL subscription over Server-Sent Events. Uses Yoga's built-in
 * `Accept: text/event-stream` transport so no extra dependency is required.
 * The connection runs until `close()` is called or the server emits `complete`.
 */
export function subscribe<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string | null,
  handlers: {
    onNext: (data: T) => void;
    onError?: (err: Error) => void;
  },
): SubscriptionHandle {
  const controller = new AbortController();

  void (async () => {
    try {
      const resp = await fetch(graphqlUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`subscription HTTP ${resp.status}`);
      }
      const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += value;
        let frameEnd: number;
        while ((frameEnd = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, frameEnd);
          buffer = buffer.slice(frameEnd + 2);
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;
          if (parsed.event === "complete") return;
          if (parsed.event !== "next" || !parsed.data) continue;
          let json: { data?: T; errors?: Array<{ message: string }> };
          try {
            json = JSON.parse(parsed.data);
          } catch {
            continue;
          }
          if (json.errors?.length) {
            handlers.onError?.(new Error(json.errors.map((e) => e.message).join("; ")));
            continue;
          }
          if (json.data) handlers.onNext(json.data);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return {
    close: () => controller.abort(),
  };
}

function parseSseFrame(frame: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0 && event === "message") return null;
  return { event, data: dataLines.join("\n") };
}

export interface ChannelUpdatedPayload {
  channelUpdated: Channel;
}

export interface ChannelNarrationPayload {
  channelNarration: ChannelNarrationMessage & { channelId?: string };
}

export interface ChannelAgentJobPayload {
  channelAgentJobUpdated: ChannelAgentJob & { channelId?: string };
}

export function subscribeChannelUpdated(
  channelId: string,
  token: string | null,
  onNext: (channel: Channel) => void,
  onError?: (err: Error) => void,
): SubscriptionHandle {
  return subscribe<ChannelUpdatedPayload>(
    `
      subscription ChannelUpdated($channelId: ID!) {
        channelUpdated(channelId: $channelId) { ${CHANNEL_FIELDS} }
      }
    `,
    { channelId },
    token,
    {
      onNext: (data) => onNext(data.channelUpdated),
      ...(onError ? { onError } : {}),
    },
  );
}

export function subscribeChannelNarration(
  channelId: string,
  token: string | null,
  onNext: (message: ChannelNarrationMessage) => void,
  onError?: (err: Error) => void,
): SubscriptionHandle {
  return subscribe<ChannelNarrationPayload>(
    `
      subscription ChannelNarration($channelId: ID!) {
        channelNarration(channelId: $channelId) { id text source createdAt metadata }
      }
    `,
    { channelId },
    token,
    {
      onNext: (data) => onNext(data.channelNarration),
      ...(onError ? { onError } : {}),
    },
  );
}

export function subscribeChannelAgentJobUpdated(
  channelId: string,
  token: string | null,
  onNext: (job: ChannelAgentJob) => void,
  onError?: (err: Error) => void,
): SubscriptionHandle {
  return subscribe<ChannelAgentJobPayload>(
    `
      subscription ChannelAgentJob($channelId: ID!) {
        channelAgentJobUpdated(channelId: $channelId) {
          id status prompt error mutationId createdAt updatedAt
        }
      }
    `,
    { channelId },
    token,
    {
      onNext: (data) => onNext(data.channelAgentJobUpdated),
      ...(onError ? { onError } : {}),
    },
  );
}

export async function narrateChannel(
  channelId: string,
  provider: "ANTHROPIC" | "OPENAI",
  items: Array<{ id: string; title: string; summary?: string | null; link?: string | null; sourceLabel?: string | null }>,
  recentlyShown: string[],
  token?: string | null,
) {
  return graphql<{ narrateChannel: string }>(
    `
      mutation NarrateChannel(
        $channelId: ID!
        $provider: NarratorProvider!
        $items: [NarrationItemInput!]!
        $recentlyShown: [String!]
      ) {
        narrateChannel(
          channelId: $channelId
          provider: $provider
          items: $items
          recentlyShown: $recentlyShown
        )
      }
    `,
    { channelId, provider, items, recentlyShown },
    token,
  );
}

export async function fetchApiKeyProviders(token?: string | null) {
  return graphql<{ me: { id: string; apiKeyProviders: string[] } }>(
    `
      query MeApiKeys {
        me { id apiKeyProviders }
      }
    `,
    {},
    token,
  );
}

export async function setUserApiKey(
  provider: "ANTHROPIC" | "OPENAI",
  key: string,
  token?: string | null,
) {
  return graphql<{ setUserApiKey: boolean }>(
    `
      mutation SetUserApiKey($provider: NarratorProvider!, $key: String!) {
        setUserApiKey(provider: $provider, key: $key)
      }
    `,
    { provider, key },
    token,
  );
}

export async function removeUserApiKey(
  provider: "ANTHROPIC" | "OPENAI",
  token?: string | null,
) {
  return graphql<{ removeUserApiKey: boolean }>(
    `
      mutation RemoveUserApiKey($provider: NarratorProvider!) {
        removeUserApiKey(provider: $provider)
      }
    `,
    { provider },
    token,
  );
}

export async function refreshChannelData(
  channelId: string,
  sourceId?: string | null,
  token?: string | null,
) {
  return graphql<{
    refreshChannelData: Channel["dataSourcesData"];
  }>(
    `
      mutation RefreshChannelData($channelId: ID!, $sourceId: String) {
        refreshChannelData(channelId: $channelId, sourceId: $sourceId) {
          sourceId
          sourceType
          componentRef
          componentId
          pluginType
          data
          lastRunAt
          error
        }
      }
    `,
    { channelId, sourceId },
    token,
  );
}
