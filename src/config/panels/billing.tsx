import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { configApi } from "../../api";
import { useToast } from "../../ui";

type PriceForm = { model: string; price: string; enabled: boolean };
type ImagePriceForm = PriceForm & { providerId: string };
type BillingProvider = { id: string; name: string; model: string; enabled: number };

function ImagePriceEditor({ prices, providers, setPrices }: {
  prices: ImagePriceForm[];
  providers: BillingProvider[];
  setPrices: React.Dispatch<React.SetStateAction<ImagePriceForm[]>>;
}) {
  return <div className="billing-price-list">{prices.map((item, index) => <div className="billing-price-row billing-image-price-row" key={index}>
    <select value={item.providerId} onChange={(event) => {
      const providerId = event.target.value;
      const provider = providers.find((candidate) => candidate.id === providerId);
      setPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, providerId, model: provider?.model || row.model } : row));
    }}>
      <option value="">通用 / 全部渠道</option>
      {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}{provider.enabled ? "" : "（渠道已停用）"}</option>)}
    </select>
    <input placeholder="模型名称，如 gpt-image-2" value={item.model} onChange={(event) => setPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, model: event.target.value } : row))} />
    <input type="number" min="0" step="0.01" placeholder="每张价格" value={item.price} onChange={(event) => setPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, price: event.target.value } : row))} />
    <label><input type="checkbox" checked={item.enabled} onChange={(event) => setPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: event.target.checked } : row))} />启用</label>
    <button className="icon-btn" type="button" aria-label="删除价格" onClick={() => setPrices((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={16} /></button>
  </div>)}</div>;
}

function PriceEditor({ prices, setPrices, modelPlaceholder, pricePlaceholder }: {
  prices: PriceForm[];
  setPrices: React.Dispatch<React.SetStateAction<PriceForm[]>>;
  modelPlaceholder: string;
  pricePlaceholder: string;
}) {
  return <div className="billing-price-list">{prices.map((item, index) => <div className="billing-price-row" key={index}>
    <input placeholder={modelPlaceholder} value={item.model} onChange={(event) => setPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, model: event.target.value } : row))} />
    <input type="number" min="0" step="0.01" placeholder={pricePlaceholder} value={item.price} onChange={(event) => setPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, price: event.target.value } : row))} />
    <label><input type="checkbox" checked={item.enabled} onChange={(event) => setPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: event.target.checked } : row))} />启用</label>
    <button className="icon-btn" type="button" aria-label="删除价格" onClick={() => setPrices((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={16} /></button>
  </div>)}</div>;
}

export function BillingSettingsPanel() {
  const queryClient = useQueryClient(); const { showToast } = useToast();
  const query = useQuery({ queryKey: ["config-billing"], queryFn: configApi.billing });
  const [prices, setPrices] = useState<ImagePriceForm[]>([]);
  const [textPrices, setTextPrices] = useState<PriceForm[]>([]);
  const [epay, setEpay] = useState({ enabled: false, apiUrl: "", merchantId: "", merchantKey: "", paymentTypes: ["alipay", "wxpay"], minimumRecharge: "1" });
  useEffect(() => {
    if (!query.data) return;
    setPrices(query.data.prices.map((item) => ({ providerId: item.provider_id, model: item.model, price: (item.price_cents / 100).toFixed(2), enabled: Boolean(item.enabled) })));
    setTextPrices(query.data.textPrices.map((item) => ({ model: item.model, price: (item.price_cents / 100).toFixed(2), enabled: Boolean(item.enabled) })));
    setEpay({ enabled: query.data.epay.enabled, apiUrl: query.data.epay.apiUrl, merchantId: query.data.epay.merchantId, merchantKey: query.data.epay.merchantKey, paymentTypes: query.data.epay.paymentTypes, minimumRecharge: (query.data.epay.minimumRechargeCents / 100).toFixed(2) });
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => configApi.saveBilling({ prices: prices.map((item) => ({ ...item, price: Number(item.price) })), textPrices: textPrices.map((item) => ({ ...item, price: Number(item.price) })), epay: { ...epay, minimumRecharge: Number(epay.minimumRecharge) } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-billing"] });
      queryClient.invalidateQueries({ queryKey: ["billing-account"] });
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["guest-workbench-config"] });
      showToast("商业化配置已保存");
    },
    onError: (error) => showToast(error.message, "error")
  });
  const [userId, setUserId] = useState(""); const [adjustAmount, setAdjustAmount] = useState("");
  const adjust = useMutation({
    mutationFn: () => configApi.adjustBalance(userId, { amount: Number(adjustAmount), description: "后台手工调整" }),
    onSuccess: () => { showToast("余额已调整"); setAdjustAmount(""); queryClient.invalidateQueries({ queryKey: ["config-billing"] }); },
    onError: (error) => showToast(error.message, "error")
  });
  return <div className="config-section-stack billing-config-panel">
    <section className="config-card"><div className="page-header compact"><div><h2>生图模型价格</h2><p>渠道专属价格优先；没有专属记录时使用通用价格。专属记录停用后，该渠道不可生成。</p></div><button className="secondary-btn" type="button" onClick={() => setPrices((items) => [...items, { providerId: "", model: "", price: "0.00", enabled: true }])}><Plus size={15} />添加价格</button></div>
      <ImagePriceEditor prices={prices} providers={query.data?.providers ?? []} setPrices={setPrices} />
    </section>
    <section className="config-card"><div className="page-header compact"><div><h2>文字模型价格</h2><p>按每次成功模型调用计价；未配置、停用或价格为零时免费，请求失败自动退款。</p></div><button className="secondary-btn" type="button" onClick={() => setTextPrices((items) => [...items, { model: "", price: "0.00", enabled: true }])}><Plus size={15} />添加模型</button></div>
      <PriceEditor prices={textPrices} setPrices={setTextPrices} modelPlaceholder="模型名称，如 gpt-5.6-sol" pricePlaceholder="每次调用价格" />
    </section>
    <section className="config-card"><div className="page-header compact"><div><h2>易支付配置</h2><p>兼容经典易支付 MD5 协议，异步通知地址由系统自动生成。</p></div></div><div className="billing-config-grid"><label><span>启用在线支付</span><input type="checkbox" checked={epay.enabled} onChange={(event) => setEpay({ ...epay, enabled: event.target.checked })} /></label><label><span>接口地址</span><input placeholder="https://pay.example.com" value={epay.apiUrl} onChange={(event) => setEpay({ ...epay, apiUrl: event.target.value })} /></label><label><span>商户号 PID</span><input value={epay.merchantId} onChange={(event) => setEpay({ ...epay, merchantId: event.target.value })} /></label><label><span>商户密钥 KEY</span><input type="password" value={epay.merchantKey} onChange={(event) => setEpay({ ...epay, merchantKey: event.target.value })} /></label><label><span>最低充值金额（元）</span><input type="number" min="0.01" step="0.01" value={epay.minimumRecharge} onChange={(event) => setEpay({ ...epay, minimumRecharge: event.target.value })} /></label><label><span>支付方式</span><input value={epay.paymentTypes.join(",")} onChange={(event) => setEpay({ ...epay, paymentTypes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label></div></section>
    <section className="config-card"><div className="page-header compact"><div><h2>余额管理</h2><p>选择用户后增减余额；扣减后余额不能小于零。</p></div></div><div className="billing-user-list">{(query.data?.users ?? []).map((user) => <button type="button" className={userId === user.id ? "active" : ""} key={user.id} onClick={() => setUserId(user.id)}><span><strong>{user.username}</strong><small>{user.account}</small></span><b>¥{(user.balance_cents / 100).toFixed(2)}</b></button>)}</div><div className="billing-adjust-row"><input value={userId} readOnly placeholder="请选择用户" /><input type="number" step="0.01" placeholder="金额，可填负数" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} /><button className="secondary-btn" type="button" disabled={!userId || !adjustAmount || adjust.isPending} onClick={() => adjust.mutate()}>调整余额</button></div></section>
    <button className="primary-btn billing-config-save" type="button" disabled={save.isPending} onClick={() => save.mutate()}><Save size={16} />{save.isPending ? "保存中..." : "保存配置"}</button>
  </div>;
}
