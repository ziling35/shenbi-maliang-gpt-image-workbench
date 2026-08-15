import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, ImagePlus, LoaderCircle, Upload, Volume2, VolumeX } from "lucide-react";
import { api } from "../api";
import type { VideoJob } from "../types";
import { useToast } from "../ui";

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

const MODE_OPTIONS: Array<{ value: VideoJob["mode"]; label: string; description: string }> = [
  { value: "text", label: "文生视频", description: "只使用提示词生成视频" },
  { value: "image", label: "单图生视频", description: "一张图片作为首帧" },
  { value: "frames", label: "首尾帧视频", description: "第一张为首帧，第二张为尾帧" },
  { value: "reference", label: "多参考图视频", description: "参考模型保持主体与场景一致" },
  { value: "edit", label: "视频编辑", description: "提交已有视频 URL 并描述修改内容" },
  { value: "extension", label: "视频延长", description: "提交已有视频 URL 并描述后续内容" }
];

export function VideosPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const providersQuery = useQuery({ queryKey: ["video-providers"], queryFn: api.videoProviders });
  const jobsQuery = useQuery({
    queryKey: ["videos"],
    queryFn: api.videos,
    refetchInterval: (query) => query.state.data?.jobs.some((job) => job.status === "queued" || job.status === "in_progress") ? 3000 : false
  });
  const providers = providersQuery.data?.providers ?? [];
  const [providerId, setProviderId] = useState("");
  const [mode, setMode] = useState<VideoJob["mode"]>("text");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [duration, setDuration] = useState<VideoJob["duration"]>(4);
  const [aspectRatio, setAspectRatio] = useState<VideoJob["aspectRatio"]>("16:9");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const selectedProvider = providers.find((provider) => provider.id === providerId) ?? providers[0];

  useEffect(() => {
    if (!providerId && providers[0]) setProviderId(providers[0].id);
  }, [providerId, providers]);

  useEffect(() => {
    if (mode === "reference") {
      setDuration(8);
      setAspectRatio("16:9");
    }
  }, [mode]);

  const allowedDurations = useMemo(() => selectedProvider?.prices.map((item) => item.duration) ?? [], [selectedProvider]);
  useEffect(() => {
    if (allowedDurations.length > 0 && !allowedDurations.includes(duration)) setDuration(allowedDurations[0]);
  }, [allowedDurations, duration]);

  const currentPrice = selectedProvider?.prices.find((item) => item.duration === duration)?.priceCents;
  const requiredImages = mode === "image" ? 1 : mode === "frames" ? 2 : mode === "reference" ? 1 : 0;
  const invalidReferenceModel = mode === "reference" && selectedProvider?.protocol !== "grok_videos" && selectedProvider?.model !== "veo-3.1-generate-preview-ref";
  const requiresVideoUrl = mode === "edit" || mode === "extension";

  const create = useMutation({
    mutationFn: () => api.createVideo({ providerId: selectedProvider?.id ?? "", mode, prompt: prompt.trim(), negativePrompt: negativePrompt.trim(), duration, aspectRatio, generateAudio, imageUrls: images, videoUrl: videoUrl.trim() }),
    onSuccess: () => {
      showToast("视频任务已提交，生成过程中可以离开本页");
      setPrompt("");
      setNegativePrompt("");
      setImages([]);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["billing-account"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "视频任务提交失败", "error")
  });

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const values = await Promise.all(Array.from(files).map(fileDataUrl));
      const maximum = mode === "image" ? 1 : mode === "frames" ? 2 : 8;
      setImages((items) => [...items, ...values].slice(0, maximum));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "图片读取失败", "error");
    }
  };

  const canSubmit = Boolean(selectedProvider && (requiresVideoUrl ? videoUrl.trim() : prompt.trim()) && (mode === "extension" || prompt.trim()) && allowedDurations.includes(duration) && !invalidReferenceModel && images.length >= requiredImages && !create.isPending);

  return (
    <section className="page-section video-workbench-page">
      <header className="page-header video-page-header">
        <div><h1><span className="page-header-icon"><Film size={21} /></span>AI 视频</h1><p>支持 Veo 文生视频、单图、首尾帧和多参考图异步生成。</p></div>
      </header>

      <div className="video-workbench-layout">
        <form className="video-create-panel" onSubmit={(event) => { event.preventDefault(); if (canSubmit) create.mutate(); }}>
          <div className="video-form-grid">
            <label>视频渠道<select value={selectedProvider?.id ?? ""} onChange={(event) => setProviderId(event.target.value)}>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}</select></label>
            <label>生成模式<select value={mode} onChange={(event) => { setMode(event.target.value as VideoJob["mode"]); setImages([]); }}>{MODE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><small>{MODE_OPTIONS.find((item) => item.value === mode)?.description}</small></label>
            <label>时长<select value={duration} disabled={mode === "reference"} onChange={(event) => setDuration(Number(event.target.value) as VideoJob["duration"])}>{([4, 6, 8] as const).map((seconds) => <option key={seconds} value={seconds} disabled={!allowedDurations.includes(seconds)}>{seconds} 秒{allowedDurations.includes(seconds) ? "" : "（未配置价格）"}</option>)}</select></label>
            <label>画面比例<select value={aspectRatio} disabled={mode === "reference"} onChange={(event) => setAspectRatio(event.target.value as VideoJob["aspectRatio"])}><option value="16:9">16:9 横屏</option><option value="9:16">9:16 竖屏</option></select></label>
          </div>

          <label className="video-prompt-field">视频提示词<textarea rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述主体、运动、镜头和氛围，不要在提示词中重复写比例与时长。" /></label>
          <label className="video-prompt-field">负向提示词（可选）<textarea rows={2} value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="不希望出现的内容" /></label>

          {requiresVideoUrl ? <label className="video-prompt-field">原视频 URL<input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://example.com/source.mp4" /></label> : null}

          {mode !== "text" ? (
            <div className="video-image-input">
              <div className="video-image-input-head"><span><ImagePlus size={17} />参考图片</span><small>{mode === "image" ? "上传 1 张" : mode === "frames" ? "按首帧、尾帧顺序上传 2 张" : "最多 8 张，多参考模式固定 8 秒 16:9"}</small></div>
              <label className="video-upload-button"><Upload size={17} />选择图片<input hidden type="file" accept="image/png,image/jpeg,image/webp" multiple={mode !== "image"} onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} /></label>
              <div className="video-reference-grid">{images.map((image, index) => <button type="button" key={`${image.slice(-24)}-${index}`} onClick={() => setImages((items) => items.filter((_, row) => row !== index))}><img src={image} alt={`参考图 ${index + 1}`} /><span>{mode === "frames" ? (index === 0 ? "首帧" : "尾帧") : `参考 ${index + 1}`}</span></button>)}</div>
            </div>
          ) : null}

          <div className="video-submit-row">
            <button className="video-audio-toggle" type="button" onClick={() => setGenerateAudio((value) => !value)}>{generateAudio ? <Volume2 size={17} /> : <VolumeX size={17} />}{generateAudio ? "生成音频" : "静音视频"}</button>
            <div className="video-price-hint">预计扣费：<strong>{currentPrice === undefined ? "未配置" : `¥${(currentPrice / 100).toFixed(2)}`}</strong></div>
            <button className="primary-btn" type="submit" disabled={!canSubmit}>{create.isPending ? <LoaderCircle className="spin" size={17} /> : <Film size={17} />}{create.isPending ? "提交中..." : "开始生成"}</button>
          </div>
          {invalidReferenceModel ? <div className="form-error">多参考图模式只能选择 `veo-3.1-generate-preview-ref` 渠道。</div> : null}
          {providers.length === 0 ? <div className="form-error">管理员尚未配置可用的视频渠道。</div> : null}
        </form>

        <section className="video-job-section">
          <div className="video-job-section-head"><div><h2>最近视频</h2><p>任务由服务器后台轮询，完成后自动保存到平台存储。</p></div></div>
          <div className="video-job-grid">
            {(jobsQuery.data?.jobs ?? []).map((job) => (
              <article className="video-job-card" key={job.id}>
                <div className="video-job-media">
                  {job.videoUrl ? <video src={job.videoUrl} controls preload="metadata" /> : <div className="video-job-placeholder"><LoaderCircle className={job.status === "queued" || job.status === "in_progress" ? "spin" : ""} size={30} /><strong>{job.status === "failed" ? "生成失败" : job.status === "queued" ? "等待生成" : "正在生成"}</strong><span>{job.progress}%</span></div>}
                </div>
                <div className="video-job-body"><div className="video-job-meta"><span>{job.model}</span><span>{job.duration} 秒</span><span>{job.aspectRatio}</span><span>{job.generateAudio ? "有声" : "静音"}</span></div><p>{job.prompt}</p>{job.error ? <small className="video-job-error">{job.error}</small> : null}<div className="video-progress"><span style={{ width: `${job.progress}%` }} /></div></div>
              </article>
            ))}
            {!jobsQuery.isLoading && (jobsQuery.data?.jobs.length ?? 0) === 0 ? <div className="settings-empty">暂无视频任务。</div> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
