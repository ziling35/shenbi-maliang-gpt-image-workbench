import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { IMAGE_JOB_RUNNING_TIMEOUT_MS, PROVIDER_REQUEST_TIMEOUT_ERROR } from "./constants";
import { proxySettings, shouldUseProxy } from "./settingsStore";
import type { ProviderRow } from "./types";

type ProxyRequestInit = RequestInit & { proxy?: string };

function providerApiKey(provider: ProviderRow) {
  return provider.api_key_value || (provider.api_key_env ? Bun.env[provider.api_key_env] : "");
}

export function providerHeaders(provider: ProviderRow, contentType = "application/json", accept = "application/json") {
  const apiKey = providerApiKey(provider);
  const headers: Record<string, string> = {
    Accept: accept
  };
  if (contentType) headers["Content-Type"] = contentType;
  if (apiKey) {
    if (provider.api_key_header === "x-goog-api-key") headers["x-goog-api-key"] = apiKey;
    else headers.Authorization = `Bearer ${apiKey}`;
  }
  if (provider.channel === "chatgpt_web") {
    headers["Accept-Language"] = "en-US,en;q=0.9";
    headers.Origin = "https://chatgpt.com";
    headers.Referer = "https://chatgpt.com/";
    headers["User-Agent"] =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
    if (provider.web_account_id) headers["Chatgpt-Account-Id"] = provider.web_account_id;
    if (provider.web_cookies) headers.Cookie = provider.web_cookies;
  }
  return headers;
}

function retryDelay(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.min(1500, 300 * (attempt + 1))));
}

async function fetchWithConfiguredRetry(input: RequestInfo | URL, init: RequestInit, useProxy: boolean) {
  const settings = proxySettings();
  const finalInit = { ...init } as ProxyRequestInit;
  if (useProxy) finalInit.proxy = settings.url;
  const retryCount = useProxy ? settings.retryCount : 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await fetch(input, finalInit);
    } catch (error) {
      lastError = error;
      if (!useProxy || finalInit.signal?.aborted || attempt >= retryCount) throw error;
      await retryDelay(attempt);
    }
  }
  throw lastError;
}

export async function providerFetch(provider: ProviderRow, input: RequestInfo | URL, init: RequestInit) {
  return fetchWithConfiguredRetry(input, init, shouldUseProxy(provider));
}

function nodeRequestHeaders(init: RequestInit) {
  const headers: Record<string, string> = {};
  if (init.headers instanceof Headers) {
    init.headers.forEach((value, key) => { headers[key] = value; });
  } else if (Array.isArray(init.headers)) {
    for (const [key, value] of init.headers) headers[key] = value;
  } else if (init.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      if (value !== undefined) headers[key] = String(value);
    }
  }
  return headers;
}

export async function providerReliableStreamFetch(provider: ProviderRow, input: RequestInfo | URL, init: RequestInit) {
  if (shouldUseProxy(provider)) return providerFetch(provider, input, init);
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  const request = url.protocol === "http:" ? httpRequest : httpsRequest;
  const headers = nodeRequestHeaders(init);
  headers.Connection = headers.Connection || "close";
  const body = typeof init.body === "string" ? init.body : init.body ? String(init.body) : "";

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const req = request(url, {
      method: init.method || "GET",
      headers,
      signal: init.signal ?? undefined
    }, (res) => {
      if (settled) return;
      settled = true;
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) responseHeaders.set(key, value.join(", "));
        else if (value !== undefined) responseHeaders.set(key, String(value));
      }
      resolve(new Response(Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>, {
        status: res.statusCode || 502,
        statusText: res.statusMessage || "",
        headers: responseHeaders
      }));
    });
    req.once("error", fail);
    if (init.signal) {
      const abort = () => req.destroy(new Error("请求已取消"));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener("abort", abort, { once: true });
    }
    if (body) req.write(body);
    req.end();
  });
}

export async function proxyFetch(input: RequestInfo | URL, init: RequestInit) {
  const settings = proxySettings();
  return fetchWithConfiguredRetry(input, init, Boolean(settings.enabled && settings.url));
}

function mergeAbortSignals(signals: AbortSignal[]) {
  if (signals.length === 1) return { signal: signals[0], cleanup: () => undefined };
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of signals) signal.removeEventListener("abort", abort);
    }
  };
}

export async function withProviderRequestTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, externalSignal?: AbortSignal) {
  const timeoutController = new AbortController();
  const { signal, cleanup } = mergeAbortSignals([timeoutController.signal, ...(externalSignal ? [externalSignal] : [])]);
  const timeoutId = setTimeout(() => timeoutController.abort(), IMAGE_JOB_RUNNING_TIMEOUT_MS);
  try {
    return await operation(signal);
  } catch (error) {
    if (timeoutController.signal.aborted) throw new Error(PROVIDER_REQUEST_TIMEOUT_ERROR);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    cleanup();
  }
}
