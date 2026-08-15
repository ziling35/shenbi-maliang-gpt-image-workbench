import { expect, test } from "bun:test";
import {
  promptModelRequestError,
  promptModelResponseText,
  requestPromptProviderText,
  shouldRetryWithResponses
} from "./promptModelTransport";
import { promptOptimizerRetryDelayMs, type PromptOptimizerProviderRow } from "./promptOptimizerRoutes";

function provider(overrides: Partial<PromptOptimizerProviderRow> = {}): PromptOptimizerProviderRow {
  return {
    id: "transport-test",
    name: "Transport Test",
    enabled: 1,
    base_url: "https://example.com/v1",
    endpoint_path: "/chat/completions",
    api_key_env: "",
    api_key_value: "test-key",
    model: "responses-only-model",
    models_json: "[]",
    availability_status: "normal",
    availability_error: "",
    availability_checked_at: "",
    stream_enabled: 1,
    thinking_enabled: 0,
    temperature: null,
    max_tokens: 256,
    retry_count: 0,
    sort_order: 1,
    created_at: "",
    updated_at: "",
    ...overrides
  };
}

test("extracts text from a Responses API output", () => {
  expect(promptModelResponseText({
    output: [{ type: "message", content: [{ type: "output_text", text: "兼容成功" }] }]
  })).toBe("兼容成功");
});

test("recognizes the Chat Completions unsupported error", () => {
  expect(shouldRetryWithResponses("This model is not supported on the Chat Completions endpoint")).toBeTrue();
});

test("parses Responses-style deltas from an SSE stream", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response([
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":"兼容流成功"}',
    "",
    "data: [DONE]",
    ""
  ].join("\n"), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  })) as unknown as typeof fetch;
  try {
    const result = await requestPromptProviderText({
      provider: provider({ id: "responses-sse-test", model: "responses-sse-model" }),
      messages: [{ role: "user", content: "测试流" }]
    });
    expect(result.content).toBe("兼容流成功");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retries a successful HTTP response when the model stream is empty", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = (async () => {
    requestCount += 1;
    const body = requestCount === 1
      ? "data: [DONE]\n\n"
      : 'data: {"choices":[{"delta":{"content":"自动重试成功"}}]}\n\ndata: [DONE]\n\n';
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" }
    });
  }) as unknown as typeof fetch;
  try {
    const result = await requestPromptProviderText({
      provider: provider({ id: "empty-retry-test", model: "empty-retry-model", retry_count: 1 }),
      messages: [{ role: "user", content: "测试重试" }]
    });
    expect(result.content).toBe("自动重试成功");
    expect(result.attemptCount).toBe(2);
    expect(requestCount).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back from Chat Completions to Responses", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
    if (requests.length === 1) {
      return new Response(JSON.stringify({ error: { message: "This model is not supported on the Chat Completions endpoint" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ output_text: "Responses 已返回" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
  try {
    const result = await requestPromptProviderText({
      provider: provider(),
      messages: [{ role: "user", content: "测试" }],
      temperature: 0.5
    });
    expect(result.content).toBe("Responses 已返回");
    expect(result.endpoint).toBe("https://example.com/v1/responses");
    expect(result.streamEnabled).toBeFalse();
    expect(requests.map((request) => request.url)).toEqual([
      "https://example.com/v1/chat/completions",
      "https://example.com/v1/responses"
    ]);
    expect(requests[1].body.input).toEqual([{ role: "user", content: "测试" }]);
    expect(requests[1].body.max_output_tokens).toBe(256);
    expect(requests[1].body).not.toHaveProperty("temperature");
    await requestPromptProviderText({ provider: provider(), messages: [{ role: "user", content: "再次测试" }] });
    expect(requests[2].url).toBe("https://example.com/v1/responses");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("turns an internal abort into a readable timeout", () => {
  const error = promptModelRequestError(new DOMException("aborted", "AbortError"), true, 60_000, "图片续改建议模型");
  expect(error.message).toBe("图片续改建议模型请求超时（已等待 60 秒），请稍后重试");
});

test("uses exponential delay for retryable prompt model failures", () => {
  expect(promptOptimizerRetryDelayMs(0)).toBe(1500);
  expect(promptOptimizerRetryDelayMs(1)).toBe(3000);
  expect(promptOptimizerRetryDelayMs(8)).toBe(15000);
});

test("honors Retry-After when the prompt model asks clients to wait", () => {
  expect(promptOptimizerRetryDelayMs(0, new Response(null, { status: 503, headers: { "Retry-After": "7" } }))).toBe(7000);
});
