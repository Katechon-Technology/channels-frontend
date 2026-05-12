import type { Channel, ChannelAgentJob, ChannelTemplate } from "./types";

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_KATECHON_BACKEND_URL || "http://localhost:8080/graphql";

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string | null,
): Promise<T> {
  const resp = await fetch(GRAPHQL_URL, {
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
  narrationMessages(limit: 8) { id text source createdAt }
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
