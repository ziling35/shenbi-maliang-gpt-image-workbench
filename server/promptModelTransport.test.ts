import { expect, test } from "bun:test";
import {
  promptModelRequestError,
  promptModelResponseText,
  requestPromptProviderText,
  shouldRetryWithResponses
} from "./promptModelTransport";
import type { PromptOptimizerProviderRow } from "./promptOptimizerRoutes";

function provider(): PromptOptimizerProviderRow {
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
    updated_at: ""
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
