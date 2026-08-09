import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CreditCard, History, ReceiptText, WalletCards, X } from "lucide-react";
import { api } from "../api";

const RECORDS_PER_PAGE = 6;

type BillingView = "recharge" | "records";
type RecordView = "orders" | "ledger";

export function BillingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("10");
  const [paymentType, setPaymentType] = useState("alipay");
  const [view, setView] = useState<BillingView>("recharge");
  const [recordView, setRecordView] = useState<RecordView>("orders");
  const [recordPage, setRecordPage] = useState(0);
  const account = useQuery({
    queryKey: ["billing-account"],
    queryFn: api.billingAccount,
    enabled: open,
    refetchInterval: (query) => query.state.data?.orders.some((order) => order.status === "pending") ? 3000 : false
  });
  const recharge = useMutation({
    mutationFn: () => api.createRecharge({ amount: Number(amount), type: paymentType }),
    onSuccess: (data) => { window.location.href = data.paymentUrl; },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["billing-account"] })
  });
  const records = recordView === "orders" ? account.data?.orders ?? [] : account.data?.ledger ?? [];
  const pageCount = Math.max(1, Math.ceil(records.length / RECORDS_PER_PAGE));
  const visibleRecords = useMemo(
    () => records.slice(recordPage * RECORDS_PER_PAGE, (recordPage + 1) * RECORDS_PER_PAGE),
    [recordPage, records]
  );

  useEffect(() => {
    setRecordPage(0);
  }, [recordView, open]);

  useEffect(() => {
    if (recordPage < pageCount) return;
    setRecordPage(pageCount - 1);
  }, [pageCount, recordPage]);

  if (!open) return null;
  const payment = account.data?.payment;

  return (
    <div className="modal-backdrop billing-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="billing-dialog" role="dialog" aria-modal="true" aria-label="余额充值">
        <header>
          <div>
            <span className="billing-dialog-icon"><WalletCards size={22} /></span>
            <div><h2>余额与充值</h2><p>余额用于图片生成、编辑和文字模型调用</p></div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="billing-balance"><span>当前余额</span><strong>¥{((account.data?.balanceCents ?? 0) / 100).toFixed(2)}</strong></div>
        <div className="billing-view-tabs" role="tablist" aria-label="余额功能">
          <button type="button" role="tab" aria-selected={view === "recharge"} className={view === "recharge" ? "active" : ""} onClick={() => setView("recharge")}><CreditCard size={16} />充值</button>
          <button type="button" role="tab" aria-selected={view === "records"} className={view === "records" ? "active" : ""} onClick={() => setView("records")}><History size={16} />收支记录</button>
        </div>

        <div className="billing-dialog-content">
          {view === "recharge" ? (
            <div className="billing-recharge-view">
              {payment?.enabled ? (
                <form onSubmit={(event) => { event.preventDefault(); recharge.mutate(); }}>
                  <label>充值金额（元）<input type="number" min={(payment.minimumRechargeCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                  <div className="billing-payment-types">{payment.paymentTypes.map((type) => <button type="button" key={type} className={paymentType === type ? "active" : ""} onClick={() => setPaymentType(type)}><CreditCard size={17} />{type === "wxpay" ? "微信支付" : type === "qqpay" ? "QQ支付" : "支付宝"}</button>)}</div>
                  {recharge.error ? <div className="form-error">{recharge.error.message}</div> : null}
                  <button className="primary-btn" disabled={recharge.isPending}>{recharge.isPending ? "正在创建订单..." : "立即充值"}</button>
                </form>
              ) : <div className="billing-disabled">管理员尚未开启在线支付</div>}
              <div className="billing-orders billing-price-list">
                <h3>生图模型价格</h3>
                {(account.data?.prices ?? []).length === 0 ? <p>暂无可用模型价格</p> : (account.data?.prices ?? []).map((price) => <div key={price.model}><span>{price.model}</span><small>¥{(price.price_cents / 100).toFixed(2)} / 张</small></div>)}
              </div>
              <div className="billing-orders billing-price-list">
                <h3>文字模型价格</h3>
                {(account.data?.textPrices ?? []).length === 0 ? <p>暂无收费文字模型</p> : (account.data?.textPrices ?? []).map((price) => <div key={price.model}><span>{price.model}</span><small>¥{(price.price_cents / 100).toFixed(2)} / 次</small></div>)}
              </div>
            </div>
          ) : (
            <div className="billing-records-view">
              <div className="billing-record-tabs" role="tablist" aria-label="记录类型">
                <button type="button" role="tab" aria-selected={recordView === "orders"} className={recordView === "orders" ? "active" : ""} onClick={() => setRecordView("orders")}><ReceiptText size={15} />充值订单</button>
                <button type="button" role="tab" aria-selected={recordView === "ledger"} className={recordView === "ledger" ? "active" : ""} onClick={() => setRecordView("ledger")}><History size={15} />余额明细</button>
              </div>
              <div className="billing-record-list">
                {visibleRecords.length === 0 ? <p>暂无{recordView === "orders" ? "充值记录" : "余额变动"}</p> : recordView === "orders" ? visibleRecords.map((record) => {
                  const order = record as NonNullable<typeof account.data>["orders"][number];
                  return <div key={order.id}><span><strong>¥{(order.amount_cents / 100).toFixed(2)}</strong><small>{new Date(order.created_at).toLocaleString()}</small></span><small>{order.status === "paid" ? "已到账" : "待支付"}</small></div>;
                }) : visibleRecords.map((record) => {
                  const entry = record as NonNullable<typeof account.data>["ledger"][number];
                  return <div key={entry.id}><span><strong>{entry.description}</strong><small>{new Date(entry.created_at).toLocaleString()}</small></span><small className={entry.amount_cents >= 0 ? "billing-income" : "billing-expense"}>{entry.amount_cents >= 0 ? "+" : "-"}¥{(Math.abs(entry.amount_cents) / 100).toFixed(2)}</small></div>;
                })}
              </div>
              {records.length > RECORDS_PER_PAGE ? (
                <div className="billing-pagination">
                  <span>{recordPage + 1} / {pageCount}</span>
                  <div>
                    <button className="icon-btn" type="button" aria-label="上一页" disabled={recordPage === 0} onClick={() => setRecordPage((page) => page - 1)}><ChevronLeft size={17} /></button>
                    <button className="icon-btn" type="button" aria-label="下一页" disabled={recordPage >= pageCount - 1} onClick={() => setRecordPage((page) => page + 1)}><ChevronRight size={17} /></button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
