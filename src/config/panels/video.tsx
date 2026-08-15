import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { configApi } from "../../api";
import type { VideoProviderConfig } from "../../types";
import { useToast } from "../../ui";

type VideoPriceDraft = {
  providerId: string;
  model: string;
  duration: 4 | 6 | 8;
  price: string;
  enabled: boolean;
};

const VIDEO_MODELS: VideoProviderConfig["model"][] = [
  "veo-3.1-fast-generate-preview",
  "veo-3.1-generate-preview",
  "veo-3.1-generate-preview-ref"
];
const GROK_VIDEO_MODELS = ["grok-imagine-video-1.5", "grok-imagine-video"];

function emptyProvider(index: number): VideoProviderConfig {
  return {
    id: `VIDEO-${Date.now()}-${index}`,
    name: "Veo 视频渠道",
    enabled: true,
    baseUrl: "http://img.yunfei.best",
    apiKeyEnv: "",
    apiKeyValue: "",
    model: "veo-3.1-fast-generate-preview",
    protocol: "veo_videos",
    proxyEnabled: false
  };
}

export function VideoProvidersPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const query = useQuery({ queryKey: ["config-video-providers"], queryFn: configApi.videoProviders });
  const [providers, setProviders] = useState<VideoProviderConfig[]>([]);
  const [prices, setPrices] = useState<VideoPriceDraft[]>([]);

  useEffect(() => {
    if (!query.data) return;
    setProviders(query.data.providers);
    setPrices(query.data.prices.map((item) => ({
      providerId: item.provider_id,
      model: item.model,
      duration: item.duration === 4 || item.duration === 6 ? item.duration : 8,
      price: (item.price_cents / 100).toFixed(2),
      enabled: Boolean(item.enabled)
    })));
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => configApi.saveVideoProviders({
      providers,
      prices: prices.map((item) => ({ ...item, price: Number(item.price) }))
    }),
    onSuccess: () => {
      showToast("视频渠道与价格已保存");
      queryClient.invalidateQueries({ queryKey: ["config-video-providers"] });
      queryClient.invalidateQueries({ queryKey: ["video-providers"] });
    },
    onError: (error) => showToast(error instanceof Error ? error.message : "保存失败", "error")
  });

  const addPrice = (provider: VideoProviderConfig) => {
    setPrices((items) => [
      ...items,
      { providerId: provider.id, model: provider.model, duration: 4, price: "0.00", enabled: true },
      { providerId: provider.id, model: provider.model, duration: 6, price: "0.00", enabled: true },
      { providerId: provider.id, model: provider.model, duration: 8, price: "0.00", enabled: true }
    ]);
  };

  return (
    <div className="config-section-stack video-provider-config">
      <section className="config-card">
        <div className="page-header compact">
          <div>
            <h2>视频渠道</h2>
            <p>支持 Veo 与 Grok2API 异步视频接口，模型、密钥和代理按渠道独立配置。</p>
          </div>
          <button className="secondary-btn" type="button" onClick={() => setProviders((items) => [...items, emptyProvider(items.length + 1)])}>
            <Plus size={15} />新增渠道
          </button>
        </div>
        <div className="video-provider-list">
          {providers.map((provider, index) => (
            <article className="video-provider-card" key={provider.id}>
              <div className="video-provider-card-head">
                <strong>{provider.name || `视频渠道 ${index + 1}`}</strong>
                <label><input type="checkbox" checked={provider.enabled} onChange={(event) => setProviders((items) => items.map((item, row) => row === index ? { ...item, enabled: event.target.checked } : item))} />启用</label>
                <button className="icon-btn" type="button" aria-label="删除视频渠道" onClick={() => {
                  setProviders((items) => items.filter((_, row) => row !== index));
                  setPrices((items) => items.filter((item) => item.providerId !== provider.id));
                }}><Trash2 size={16} /></button>
              </div>
              <div className="video-provider-form-grid">
                <label>渠道名称<input value={provider.name} onChange={(event) => setProviders((items) => items.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} /></label>
                <label>渠道 ID<input className="readonly-input" readOnly value={provider.id} /></label>
                <label className="wide">协议<select value={provider.protocol ?? "veo_videos"} onChange={(event) => {
                  const protocol = event.target.value as VideoProviderConfig["protocol"];
                  setProviders((items) => items.map((item, row) => row === index ? {
                    ...item,
                    protocol,
                    model: protocol === "grok_videos" ? "grok-imagine-video-1.5" : "veo-3.1-fast-generate-preview",
                    baseUrl: protocol === "grok_videos" ? "http://grok2api.ziling.site/v1" : item.baseUrl
                  } : item));
                }}><option value="veo_videos">Veo / 通用视频</option><option value="grok_videos">Grok2API Videos</option></select></label>
                <label className="wide">服务地址<input placeholder="http://img.yunfei.best" value={provider.baseUrl} onChange={(event) => setProviders((items) => items.map((item, row) => row === index ? { ...item, baseUrl: event.target.value } : item))} /></label>
                <label>模型<select value={provider.model} onChange={(event) => {
                  const model = event.target.value as VideoProviderConfig["model"];
                  setProviders((items) => items.map((item, row) => row === index ? { ...item, model } : item));
                  setPrices((items) => items.map((item) => item.providerId === provider.id ? { ...item, model } : item));
                }}>{(provider.protocol === "grok_videos" ? GROK_VIDEO_MODELS : VIDEO_MODELS).map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
                <label>密钥环境变量<input placeholder="可选，如 VEO_API_KEY" value={provider.apiKeyEnv} onChange={(event) => setProviders((items) => items.map((item, row) => row === index ? { ...item, apiKeyEnv: event.target.value } : item))} /></label>
                <label className="wide">API Key<input type="password" value={provider.apiKeyValue} onChange={(event) => setProviders((items) => items.map((item, row) => row === index ? { ...item, apiKeyValue: event.target.value } : item))} /></label>
                <label className="toggle-row"><input type="checkbox" checked={provider.proxyEnabled} onChange={(event) => setProviders((items) => items.map((item, row) => row === index ? { ...item, proxyEnabled: event.target.checked } : item))} />使用全局代理</label>
              </div>
              <button className="secondary-btn" type="button" onClick={() => addPrice(provider)}><Plus size={15} />添加 4/6/8 秒价格</button>
            </article>
          ))}
          {providers.length === 0 ? <div className="settings-empty">暂无视频渠道，点击“新增渠道”开始配置。</div> : null}
        </div>
      </section>

      <section className="config-card">
        <div className="page-header compact">
          <div><h2>视频模型价格</h2><p>按照渠道、模型和视频时长收费；提交任务时预扣，失败自动退款。</p></div>
          <button className="secondary-btn" type="button" disabled={providers.length === 0} onClick={() => providers[0] && addPrice(providers[0])}><Plus size={15} />添加价格</button>
        </div>
        <div className="billing-price-list">
          {prices.map((price, index) => (
            <div className="billing-price-row video-price-row" key={`${price.providerId}-${price.model}-${price.duration}-${index}`}>
              <select value={price.providerId} onChange={(event) => {
                const provider = providers.find((item) => item.id === event.target.value);
                setPrices((items) => items.map((item, row) => row === index ? { ...item, providerId: event.target.value, model: provider?.model ?? item.model } : item));
              }}>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select>
              <input readOnly value={price.model} />
              <select value={price.duration} onChange={(event) => setPrices((items) => items.map((item, row) => row === index ? { ...item, duration: Number(event.target.value) as 4 | 6 | 8 } : item))}>
                <option value={4}>4 秒</option><option value={6}>6 秒</option><option value={8}>8 秒</option>
              </select>
              <input type="number" min="0" step="0.01" value={price.price} placeholder="价格（元）" onChange={(event) => setPrices((items) => items.map((item, row) => row === index ? { ...item, price: event.target.value } : item))} />
              <label><input type="checkbox" checked={price.enabled} onChange={(event) => setPrices((items) => items.map((item, row) => row === index ? { ...item, enabled: event.target.checked } : item))} />启用</label>
              <button className="icon-btn" type="button" aria-label="删除价格" onClick={() => setPrices((items) => items.filter((_, row) => row !== index))}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </section>

      <button className="primary-btn billing-config-save" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
        <Save size={16} />{save.isPending ? "保存中..." : "保存视频配置"}
      </button>
    </div>
  );
}
