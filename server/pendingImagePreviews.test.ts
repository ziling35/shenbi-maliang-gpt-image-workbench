import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  activePendingImagePreviewsForJobs,
  createStreamingPendingImagePreview,
  getPendingImagePreview,
  releasePendingImagePreviewsForJob
} from "./pendingImagePreviews";

describe("pending image previews", () => {
  test("exposes the same live preview after a browser reconnect", () => {
    const writer = createStreamingPendingImagePreview({
      provider: { id: "provider-1" } as never,
      userId: "user-1",
      jobId: "job-1",
      imageIndex: 2,
      mimeType: "image/png"
    });
    writer.write(new Uint8Array([1, 2, 3]));

    const active = activePendingImagePreviewsForJobs("user-1", ["job-1"]);
    expect(active.get("job-1")).toEqual([{
      previewId: writer.previewId,
      jobId: "job-1",
      imageIndex: 2,
      url: writer.url,
      fallbackUrl: writer.url,
      mimeType: "image/png",
      streaming: true
    }]);
    expect(getPendingImagePreview("user-1", writer.token)?.liveStream?.chunks).toHaveLength(1);

    writer.finish();
    releasePendingImagePreviewsForJob("job-1", true);
    expect(activePendingImagePreviewsForJobs("user-1", ["job-1"]).has("job-1")).toBe(false);
  });

  test("creates temporary progressive frames without changing the original stream", async () => {
    const source = await sharp({
      create: { width: 640, height: 640, channels: 3, background: "#4477aa" }
    }).png().toBuffer();
    const writer = createStreamingPendingImagePreview({
      provider: { id: "provider-2" } as never,
      userId: "user-2",
      jobId: "job-2",
      imageIndex: 1,
      mimeType: "image/png"
    });
    writer.write(source.subarray(0, Math.floor(source.length * 0.7)));
    await new Promise((resolve) => setTimeout(resolve, 250));

    const preview = getPendingImagePreview("user-2", writer.token);
    expect(preview?.liveStream?.bytesReceived).toBe(Math.floor(source.length * 0.7));
    expect(preview?.liveStream?.chunks[0]).toEqual(source.subarray(0, Math.floor(source.length * 0.7)));

    writer.fail();
    releasePendingImagePreviewsForJob("job-2", true);
  });
});
