import { describe, expect, test } from "bun:test";
import { GeminiInlineImageStreamDecoder, imageStreamBytesLookComplete } from "./providerRuntime";

describe("provider runtime image stream recovery", () => {
  test("recognizes complete PNG and JPEG byte streams", () => {
    const png = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
    ]);
    const jpeg = new Uint8Array([255, 216, 1, 2, 3, 255, 217]);

    expect(imageStreamBytesLookComplete("image/png", png)).toBe(true);
    expect(imageStreamBytesLookComplete("image/jpeg", jpeg)).toBe(true);
  });

  test("rejects truncated image byte streams", () => {
    expect(imageStreamBytesLookComplete("image/png", new Uint8Array([137, 80, 78, 71]))).toBe(false);
    expect(imageStreamBytesLookComplete("image/jpeg", new Uint8Array([255, 216, 1, 2, 3]))).toBe(false);
  });

  test("returns a completed Gemini image as soon as the base64 field closes", async () => {
    const png = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
    ]);
    const written: Buffer[] = [];
    let finished = false;
    const decoder = new GeminiInlineImageStreamDecoder(async () => ({
      write(chunk) {
        written.push(Buffer.from(chunk));
      },
      finish() {
        finished = true;
      },
      fail() {}
    }));
    await decoder.prepare();

    const prefixResult = await decoder.push('data: {"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"');
    const completed = await decoder.push(`${png.toString("base64")}"}}]}}]}\n\n`);

    expect(prefixResult).toBeNull();
    expect(finished).toBe(true);
    expect(Buffer.concat(written)).toEqual(png);
    expect((completed as { data: Array<{ b64_json: string }> }).data[0].b64_json).toBe(png.toString("base64"));
  });

  test("recovers a completed image after the SSE socket closes", async () => {
    const jpeg = Buffer.from([255, 216, 1, 2, 3, 255, 217]);
    const decoder = new GeminiInlineImageStreamDecoder(async () => ({ write() {}, finish() {}, fail() {} }));
    await decoder.prepare();
    await decoder.push(`data: {"inline_data":{"mime_type":"image/jpeg","data":"${jpeg.toString("base64")}"`);

    const recovered = await decoder.recoverCompletedImage();

    expect((recovered as { data: Array<{ b64_json: string }> }).data[0].b64_json).toBe(jpeg.toString("base64"));
  });
});
