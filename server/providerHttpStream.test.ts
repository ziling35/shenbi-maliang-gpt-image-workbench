import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { describe, expect, test } from "bun:test";
import { providerReliableStreamFetch } from "./providerHttp";

describe("reliable provider stream transport", () => {
  test("reads a close-delimited SSE response through Node streams", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "close" });
      response.write('data: {"part":1}\n\n');
      setTimeout(() => response.end('data: {"part":2}\n\n'), 10);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const response = await providerReliableStreamFetch(
        { channel: "api", api_key_value: "" } as never,
        `http://127.0.0.1:${port}/stream`,
        { method: "POST", headers: { Accept: "text/event-stream" }, body: "{}" }
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"part":2');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  test("accepts a raw close-delimited SSE response", async () => {
    const server = createNetServer((socket) => {
      socket.once("data", () => {
        socket.end([
          "HTTP/1.1 200 OK",
          "Content-Type: text/event-stream",
          "Connection: close",
          "",
          'data: {"part":1}\n\n'
        ].join("\r\n"));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const response = await providerReliableStreamFetch(
        { channel: "api", api_key_value: "" } as never,
        `http://127.0.0.1:${port}/stream`,
        { method: "POST", headers: { Accept: "text/event-stream" }, body: "{}" }
      );
      expect(await response.text()).toContain('"part":1');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("rejects a response truncated before its declared content length", async () => {
    const server = createNetServer((socket) => {
      socket.once("data", () => {
        socket.end([
          "HTTP/1.1 200 OK",
          "Content-Type: text/event-stream",
          "Content-Length: 100",
          "Connection: close",
          "",
          'data: {"part":1}\n\n'
        ].join("\r\n"));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      let failed = false;
      try {
        const response = await providerReliableStreamFetch(
          { channel: "api", api_key_value: "" } as never,
          `http://127.0.0.1:${port}/stream`,
          { method: "POST", headers: { Accept: "text/event-stream" }, body: "{}" }
        );
        await response.text();
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
