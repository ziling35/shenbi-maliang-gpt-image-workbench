import { describe, expect, test } from "bun:test";
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

  test("tracks streamed bytes without repeatedly decoding partial images", () => {
    const source = Buffer.alloc(4 * 1024 * 1024, 7);
    const writer = createStreamingPendingImagePreview({
      provider: { id: "provider-2" } as never,
      userId: "user-2",
      jobId: "job-2",
      imageIndex: 1,
      mimeType: "image/png"
    });
    writer.write(source.subarray(0, 2 * 1024 * 1024));
    writer.write(source.subarray(2 * 1024 * 1024));

    const preview = getPendingImagePreview("user-2", writer.token);
    expect(preview?.liveStream?.bytesReceived).toBe(source.length);
    expect(preview?.liveStream?.chunks).toHaveLength(2);
    expect(preview?.liveStream?.frameVersion).toBe(0);
    expect(preview?.liveStream?.frameBuffer).toBeUndefined();

    writer.finish();
    releasePendingImagePreviewsForJob("job-2", true);
  });
});
