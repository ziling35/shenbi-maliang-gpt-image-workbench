import {
  fetchPromptOptimizerWithRetry,
  normalizePromptOptimizerRetryCount,
  promptOptimizerHeaders,
  type PromptOptimizerProviderRow
} from "./promptOptimizerRoutes";
import { normalizePath, safeJson } from "./utils";

export type PromptModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type PromptModelTransportResult = {
  content: string;
  endpoint: string;
  streamEnabled: boolean;
  attemptCount: number;
  statusCode: number;
};

export class PromptModelTransportError extends Error {
  endpoint: string;
  streamEnabled: boolean;
  attemptCount: number;
  statusCode: number | null;

  constructor(message: string, metadata: Omit<PromptModelTransportError, "name" | "message">, options?: ErrorOptions) {
    super(message, options);
    this.name = "PromptModelTransportError";
    this.endpoint = metadata.endpoint;
    this.streamEnabled = metadata.streamEnabled;
    this.attemptCount = metadata.attemptCount;
    this.statusCode = metadata.statusCode;
  }
}

const responsesPreferredProviders = new Set<string>();

function providerProtocolKey(provider: PromptOptimizerProviderRow) {
  return [provider.id, provider.base_url, provider.endpoint_path, provider.model].join("\n");
}

function chatContentText(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return String(record.text ?? record.content ?? "");
  }).join("");
}

export function promptModelResponseText(data: unknown, fallbackText = "") {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const directOutput = chatContentText(record.output_text).trim();
  if (directOutput) return directOutput;
  const output = Array.isArray(record.output) ? record.output : [];
  const responseOutput = output.map((item) => {
    const outputItem = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return chatContentText(outputItem.content);
  }).join("").trim();
  if (responseOutput) return responseOutput;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
  const message = first.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
  return chatContentText(message.content ?? first.text).trim() || fallbackText.trim();
}

function streamFrameContent(frame: string) {
  let content = "";
  const payloads = frame.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  for (const payload of payloads) {
    const data = safeJson<unknown>(payload, null);
    const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const choices = Array.isArray(record.choices) ? record.choices : [];
    let payloadContent = "";
    for (const choiceValue of choices) {
      const choice = choiceValue && typeof choiceValue === "object" ? choiceValue as Record<string, unknown> : {};
      const delta = choice.delta && typeof choice.delta === "object" ? choice.delta as Record<string, unknown> : {};
      payloadContent += chatContentText(delta.content ?? choice.text);
    }
    if (!payloadContent) payloadContent = chatContentText(record.delta);
    if (!payloadContent) payloadContent = promptModelResponseText(record);
    content += payloadContent;
  }
  return content;
}

async function readStreamingChatCompletion(response: Response, onContent?: (delta: string, content: string) => void) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const delta = streamFrameContent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      if (delta) {
        content += delta;
        onContent?.(delta, content);
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  const delta = buffer.trim() ? streamFrameContent(buffer) : "";
  if (delta) {
    content += delta;
    onContent?.(delta, content);
  }
  return content.trim();
}

function shouldSendDeepSeekThinkingMode(provider: PromptOptimizerProviderRow) {
  return [provider.name, provider.base_url, provider.endpoint_path, provider.model]
    .some((value) => String(value ?? "").toLowerCase().includes("deepseek"));
}

function responsesEndpoint(provider: PromptOptimizerProviderRow) {
  const configured = normalizePath(provider.base_url, provider.endpoint_path || "/chat/completions");
  if (/\/responses(?:[/?#]|$)/i.test(configured)) return configured;
  if (/\/chat\/completions(?:[/?#]|$)/i.test(configured)) return configured.replace(/\/chat\/completions(?=([/?#]|$))/i, "/responses");
  return normalizePath(provider.base_url, "/responses");
}

function isResponsesEndpoint(provider: PromptOptimizerProviderRow) {
  return /\/responses(?:[/?#]|$)/i.test(provider.endpoint_path || "");
}

export function shouldRetryWithResponses(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("not supported on the chat completions endpoint")
    || (normalized.includes("chat completions") && normalized.includes("responses"));
}

function responseErrorMessage(response: Response, text: string) {
  const data = safeJson<Record<string, unknown>>(text, {});
  const nestedError = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : null;
  return String(nestedError?.message ?? data.message ?? text ?? response.statusText).trim() || "文字模型请求失败";
}

async function requestProtocol({
  provider,
  messages,
  protocol,
  temperature,
  signal,
  onContent
}: {
  provider: PromptOptimizerProviderRow;
  messages: PromptModelMessage[];
  protocol: "chat" | "responses";
  temperature?: number | null;
  signal?: AbortSignal;
  onContent?: (delta: string, content: string) => void;
}) {
  const streamEnabled = protocol === "chat" && Boolean(provider.stream_enabled);
  const endpoint = protocol === "responses"
    ? responsesEndpoint(provider)
    : normalizePath(provider.base_url, provider.endpoint_path || "/chat/completions");
  const maxTokens = Math.trunc(Number(provider.max_tokens ?? 0));
  const body: Record<string, unknown> = protocol === "responses"
    ? { model: provider.model, input: messages }
    : { model: provider.model, messages, ...(streamEnabled ? { stream: true } : {}) };
  if (protocol === "chat" && temperature !== null && temperature !== undefined && Number.isFinite(Number(temperature))) {
    body.temperature = Number(temperature);
  }
  if (protocol === "chat" && shouldSendDeepSeekThinkingMode(provider)) {
    body.thinking = { type: (provider.thinking_enabled ?? 1) === 0 ? "disabled" : "enabled" };
  }
  if (maxTokens > 0) body[protocol === "responses" ? "max_output_tokens" : "max_tokens"] = maxTokens;
  let attemptCount = 0;
  let statusCode: number | null = null;
  try {
    const emptyResponseRetryCount = normalizePromptOptimizerRetryCount(provider.retry_count);
    for (let emptyResponseAttempt = 0; emptyResponseAttempt <= emptyResponseRetryCount; emptyResponseAttempt += 1) {
      const response = await fetchPromptOptimizerWithRetry(provider, endpoint, {
        method: "POST",
        signal,
        headers: {
          ...promptOptimizerHeaders(provider, streamEnabled ? "text/event-stream" : "application/json"),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }, {
        onAttempt: () => { attemptCount += 1; }
      });
      statusCode = response.status;
      if (!response.ok) {
        const text = await response.text();
        throw new Error(responseErrorMessage(response, text));
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      let content = "";
      if (streamEnabled && contentType.includes("text/event-stream")) {
        content = await readStreamingChatCompletion(response, onContent);
      } else {
        const text = await response.text();
        content = promptModelResponseText(safeJson<unknown>(text, null), text);
        if (content) onContent?.(content, content);
      }
      if (content.trim()) return { content: content.trim(), endpoint, streamEnabled, attemptCount, statusCode };
      if (signal?.aborted || emptyResponseAttempt >= emptyResponseRetryCount) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 350 * (emptyResponseAttempt + 1))));
    }
    throw new Error(`文字模型连续 ${attemptCount} 次没有返回内容`);
  } catch (error) {
    if (error instanceof PromptModelTransportError) throw error;
    throw new PromptModelTransportError(error instanceof Error ? error.message : String(error), {
      endpoint,
      streamEnabled,
      attemptCount,
      statusCode
    }, { cause: error });
  }
}

export async function requestPromptProviderText({
  provider,
  messages,
  temperature,
  signal,
  onContent
}: {
  provider: PromptOptimizerProviderRow;
  messages: PromptModelMessage[];
  temperature?: number | null;
  signal?: AbortSignal;
  onContent?: (delta: string, content: string) => void;
}): Promise<PromptModelTransportResult> {
  const protocolKey = providerProtocolKey(provider);
  const protocol = isResponsesEndpoint(provider) || responsesPreferredProviders.has(protocolKey) ? "responses" : "chat";
  try {
    return await requestProtocol({ provider, messages, protocol, temperature, signal, onContent });
  } catch (error) {
    if (protocol !== "chat" || !(error instanceof PromptModelTransportError) || !shouldRetryWithResponses(error.message)) throw error;
    const result = await requestProtocol({ provider, messages, protocol: "responses", temperature, signal, onContent });
    responsesPreferredProviders.add(protocolKey);
    return result;
  }
}

export function promptModelRequestError(error: unknown, timedOut: boolean, timeoutMs: number, label = "文字模型") {
  if (!timedOut) return error instanceof Error ? error : new Error(String(error));
  return new Error(`${label}请求超时（已等待 ${Math.round(timeoutMs / 1000)} 秒），请稍后重试`, { cause: error });
}
