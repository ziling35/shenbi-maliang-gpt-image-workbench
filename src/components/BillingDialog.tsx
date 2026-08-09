import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, WalletCards, X } from "lucide-react";
import { api } from "../api";

export function BillingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("10");
  const [paymentType, setPaymentType] = useState("alipay");
  const account = useQuery({ queryKey: ["billing-account"], queryFn: api.billingAccount, enabled: open, refetchInterval: (query) => query.state.data?.orders.some((order) => order.status === "pending") ? 3000 : false });
  const recharge = useMutation({
    mutationFn: () => api.createRecharge({ amount: Number(amount), type: paymentType }),
    onSuccess: (data) => { window.location.href = data.paymentUrl; },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["billing-account"] })
  });
  if (!open) return null;
  const payment = account.data?.payment;
  return (
    <div className="modal-backdrop billing-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="billing-dialog" role="dialog" aria-modal="true" aria-label="余额充值">
        <header><div><span className="billing-dialog-icon"><WalletCards size={22} /></span><div><h2>余额与充值</h2><p>余额用于图片生成和编辑任务</p></div></div><button className="icon-btn" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button></header>
        <div className="billing-balance"><span>当前余额</span><strong>¥{((account.data?.balanceCents ?? 0) / 100).toFixed(2)}</strong></div>
        {payment?.enabled ? <form onSubmit={(event) => { event.preventDefault(); recharge.mutate(); }}>
          <label>充值金额（元）<input type="number" min={(payment.minimumRechargeCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <div className="billing-payment-types">{payment.paymentTypes.map((type) => <button type="button" key={type} className={paymentType === type ? "active" : ""} onClick={() => setPaymentType(type)}><CreditCard size={17} />{type === "wxpay" ? "微信支付" : type === "qqpay" ? "QQ支付" : "支付宝"}</button>)}</div>
          {recharge.error ? <div className="form-error">{recharge.error.message}</div> : null}
          <button className="primary-btn" disabled={recharge.isPending}>{recharge.isPending ? "正在创建订单..." : "立即充值"}</button>
        </form> : <div className="billing-disabled">管理员尚未开启在线支付</div>}
        <div className="billing-orders"><h3>模型价格</h3>{(account.data?.prices ?? []).length === 0 ? <p>暂无可用模型价格</p> : (account.data?.prices ?? []).map((price) => <div key={price.model}><span>{price.model}</span><small>¥{(price.price_cents / 100).toFixed(2)} / 张</small></div>)}</div>
        <div className="billing-orders"><h3>最近充值</h3>{(account.data?.orders ?? []).length === 0 ? <p>暂无充值记录</p> : (account.data?.orders ?? []).map((order) => <div key={order.id}><span>¥{(order.amount_cents / 100).toFixed(2)}</span><small>{order.status === "paid" ? "已到账" : "待支付"}</small></div>)}</div>
        <div className="billing-orders"><h3>余额明细</h3>{(account.data?.ledger ?? []).length === 0 ? <p>暂无余额变动</p> : (account.data?.ledger ?? []).map((entry) => <div key={entry.id}><span>{entry.description}</span><small className={entry.amount_cents >= 0 ? "billing-income" : "billing-expense"}>{entry.amount_cents >= 0 ? "+" : "-"}¥{(Math.abs(entry.amount_cents) / 100).toFixed(2)}</small></div>)}</div>
      </section>
    </div>
  );
}
