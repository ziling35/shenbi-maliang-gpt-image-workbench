import { createHash, timingSafeEqual } from "node:crypto";
import type { Context, Hono } from "hono";
import { requireConfig, requireUser } from "./auth";
import { appDb, configDb, getAll, getOne, run } from "./db";
import { storedSitePublicBaseUrl } from "./siteSettings";
import { makeId, now } from "./utils";

type ModelPrice = { model: string; price_cents: number; enabled: number; updated_at: string };
type EpayRow = { enabled: number; api_url: string; merchant_id: string; merchant_key: string; payment_types: string; minimum_recharge_cents: number; updated_at: string };

function epaySettings(secret = false) {
  const row = getOne<EpayRow>(configDb, "select * from epay_settings where id = 'default'");
  return {
    enabled: Boolean(row?.enabled), apiUrl: row?.api_url ?? "", merchantId: row?.merchant_id ?? "",
    merchantKey: secret ? row?.merchant_key ?? "" : row?.merchant_key ? "********" : "",
    paymentTypes: String(row?.payment_types ?? "alipay,wxpay").split(",").map((item) => item.trim()).filter(Boolean),
    minimumRechargeCents: Number(row?.minimum_recharge_cents ?? 100), updatedAt: row?.updated_at ?? ""
  };
}

export function signEpayParams(input: Record<string, string>, key: string) {
  const text = Object.entries(input).filter(([name, value]) => name !== "sign" && name !== "sign_type" && value !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([name, value]) => `${name}=${value}`).join("&");
  return createHash("md5").update(`${text}${key}`).digest("hex");
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left.toLowerCase()); const b = Buffer.from(right.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function reserveImageCharge(userId: string, jobId: string, model: string, imageCount: number, referenceId = jobId) {
  const price = getOne<ModelPrice>(configDb, "select * from billing_model_prices where model = ? and enabled = 1", model);
  if (!price) throw new Error(`模型 ${model} 尚未配置价格`);
  const amount = price.price_cents * imageCount;
  appDb.exec("begin immediate");
  try {
    const changed = run(appDb, "update users set balance_cents = balance_cents - ?, updated_at = ? where id = ? and balance_cents >= ?", amount, now(), userId, amount);
    if (!Number(changed.changes ?? 0)) throw new Error("余额不足，请先充值");
    const balance = getOne<{ balance_cents: number }>(appDb, "select balance_cents from users where id = ?", userId)?.balance_cents ?? 0;
    run(appDb, `insert into billing_reservations(job_id,user_id,model,image_count,amount_cents,status,created_at,updated_at) values(?,?,?,?,?,'reserved',?,?) on conflict(job_id) do update set model=excluded.model,image_count=excluded.image_count,amount_cents=excluded.amount_cents,status='reserved',updated_at=excluded.updated_at`, jobId, userId, model, imageCount, amount, now(), now());
    run(appDb, "insert into billing_ledger(id,user_id,type,amount_cents,balance_after_cents,reference_id,description,created_at) values(?,?,?,?,?,?,?,?)", makeId("ledger"), userId, "consume", -amount, balance, referenceId, `${model} x ${imageCount}`, now());
    appDb.exec("commit");
    return amount;
  } catch (error) { appDb.exec("rollback"); throw error; }
}

export function settlePartialImageCharge(jobId: string, actualImageCount: number) {
  const normalizedActualCount = Math.max(0, Math.trunc(Number(actualImageCount) || 0));
  if (normalizedActualCount <= 0) return 0;
  appDb.exec("begin immediate");
  try {
    const reservation = getOne<{ user_id: string; model: string; image_count: number; amount_cents: number; status: string }>(
      appDb,
      "select user_id,model,image_count,amount_cents,status from billing_reservations where job_id = ?",
      jobId
    );
    if (!reservation || reservation.status !== "reserved" || normalizedActualCount >= reservation.image_count) {
      appDb.exec("commit");
      return 0;
    }
    const unitPriceCents = Math.trunc(reservation.amount_cents / reservation.image_count);
    const actualAmountCents = unitPriceCents * normalizedActualCount;
    const refundCents = reservation.amount_cents - actualAmountCents;
    run(appDb, "update users set balance_cents = balance_cents + ?, updated_at = ? where id = ?", refundCents, now(), reservation.user_id);
    const balance = getOne<{ balance_cents: number }>(appDb, "select balance_cents from users where id = ?", reservation.user_id)?.balance_cents ?? 0;
    run(appDb, "update billing_reservations set image_count = ?, amount_cents = ?, updated_at = ? where job_id = ? and status = 'reserved'", normalizedActualCount, actualAmountCents, now(), jobId);
    run(appDb, "insert or ignore into billing_ledger(id,user_id,type,amount_cents,balance_after_cents,reference_id,description,created_at) values(?,?,?,?,?,?,?,?)", `partial_refund_${jobId}_${normalizedActualCount}`, reservation.user_id, "refund", refundCents, balance, `${jobId}:partial`, `渠道少返回图片，退还 ${reservation.image_count - normalizedActualCount} 张费用`, now());
    appDb.exec("commit");
    return refundCents;
  } catch (error) {
    appDb.exec("rollback");
    throw error;
  }
}

function creditOrder(orderId: string, tradeNo: string) {
  appDb.exec("begin immediate");
  try {
    const order = getOne<{ user_id: string; amount_cents: number; status: string }>(appDb, "select user_id, amount_cents, status from recharge_orders where id = ?", orderId);
    if (!order) throw new Error("订单不存在");
    if (order.status === "paid") { appDb.exec("commit"); return; }
    if (order.status !== "pending") throw new Error("订单状态不允许入账");
    const credited = run(appDb, "update users set balance_cents = balance_cents + ?, updated_at = ? where id = ?", order.amount_cents, now(), order.user_id);
    if (!Number(credited.changes ?? 0)) throw new Error("充值用户不存在");
    const balance = getOne<{ balance_cents: number }>(appDb, "select balance_cents from users where id = ?", order.user_id)?.balance_cents ?? 0;
    const paid = run(appDb, "update recharge_orders set status='paid',trade_no=?,paid_at=?,updated_at=? where id=? and status='pending'", tradeNo, now(), now(), orderId);
    if (!Number(paid.changes ?? 0)) throw new Error("订单已被其他通知处理");
    run(appDb, "insert into billing_ledger(id,user_id,type,amount_cents,balance_after_cents,reference_id,description,created_at) values(?,?,?,?,?,?,?,?)", makeId("ledger"), order.user_id, "recharge", order.amount_cents, balance, orderId, "在线充值", now());
    appDb.exec("commit");
  } catch (error) { appDb.exec("rollback"); throw error; }
}

export function registerBillingRoutes(api: Hono) {
  api.get("/billing/account", async (c) => {
    const user = await requireUser(c); if (!user) return c.json({ error: "未登录" }, 401);
    const current = getOne<{ balance_cents: number }>(appDb, "select balance_cents from users where id = ?", user.id);
    const orders = getAll(appDb, "select id,amount_cents,status,payment_type,created_at,paid_at from recharge_orders where user_id=? order by created_at desc limit 20", user.id);
    const ledger = getAll(appDb, "select id,type,amount_cents,balance_after_cents,description,created_at from billing_ledger where user_id=? order by created_at desc,id desc limit 30", user.id);
    const prices = getAll<ModelPrice>(configDb, "select model,price_cents,enabled,updated_at from billing_model_prices where enabled=1 order by model");
    const payment = epaySettings();
    return c.json({
      balanceCents: current?.balance_cents ?? 0,
      payment: { enabled: payment.enabled, paymentTypes: payment.paymentTypes, minimumRechargeCents: payment.minimumRechargeCents },
      prices,
      orders,
      ledger
    });
  });
  api.post("/billing/recharge", async (c) => {
    const user = await requireUser(c); if (!user) return c.json({ error: "未登录" }, 401);
    const body = await c.req.json().catch(() => ({})); const settings = epaySettings(true);
    const amountCents = Math.round(Number(body.amount) * 100); const type = String(body.type ?? "alipay");
    if (!settings.enabled) return c.json({ error: "在线支付尚未启用" }, 400);
    if (!settings.apiUrl || !settings.merchantId || !settings.merchantKey) return c.json({ error: "易支付配置不完整" }, 400);
    if (!Number.isSafeInteger(amountCents) || amountCents < settings.minimumRechargeCents) return c.json({ error: "充值金额低于最低限制" }, 400);
    if (!settings.paymentTypes.includes(type)) return c.json({ error: "不支持该支付方式" }, 400);
    const origin = storedSitePublicBaseUrl() || new URL(c.req.url).origin; const orderId = makeId("pay");
    run(appDb, "insert into recharge_orders(id,user_id,amount_cents,status,payment_type,created_at,updated_at) values(?,?,?,'pending',?,?,?)", orderId, user.id, amountCents, type, now(), now());
    const params: Record<string,string> = { pid: settings.merchantId, type, out_trade_no: orderId, notify_url: `${origin}/api/billing/epay/notify`, return_url: `${origin}/?payment=return`, name: "账户余额充值", money: (amountCents / 100).toFixed(2), sign_type: "MD5" };
    params.sign = signEpayParams(params, settings.merchantKey);
    return c.json({ orderId, paymentUrl: `${settings.apiUrl.replace(/\/$/, "")}/submit.php?${new URLSearchParams(params)}` });
  });
  api.all("/billing/epay/notify", async (c) => {
    const params = c.req.method === "GET" ? Object.fromEntries(new URL(c.req.url).searchParams) : Object.fromEntries(await c.req.parseBody().then((body) => Object.entries(body).map(([k,v]) => [k,String(v)])));
    const settings = epaySettings(true); const sign = String(params.sign ?? "");
    if (!sign || !secureEqual(signEpayParams(params, settings.merchantKey), sign)) return c.text("fail", 400);
    if (String(params.trade_status) !== "TRADE_SUCCESS") return c.text("fail", 400);
    const order = getOne<{ amount_cents: number }>(appDb, "select amount_cents from recharge_orders where id = ?", String(params.out_trade_no ?? ""));
    if (!order || Math.round(Number(params.money) * 100) !== order.amount_cents || String(params.pid) !== settings.merchantId) return c.text("fail", 400);
    creditOrder(String(params.out_trade_no), String(params.trade_no ?? "")); return c.text("success");
  });
  api.get("/config/billing", (c) => {
    const blocked = requireConfig(c); if (blocked) return blocked;
    return c.json({ prices: getAll(configDb, "select model,price_cents,enabled,updated_at from billing_model_prices order by model"), epay: epaySettings(), users: getAll(appDb, "select id,account,username,balance_cents from users order by created_at desc") });
  });
  api.put("/config/billing", async (c) => {
    const blocked = requireConfig(c); if (blocked) return blocked;
    const body = await c.req.json().catch(() => ({})); const timestamp = now();
    const prices = Array.isArray(body.prices) ? body.prices : [];
    configDb.exec("begin immediate"); try {
      run(configDb, "delete from billing_model_prices");
      for (const item of prices) { const model=String(item.model??"").trim(); const cents=Math.round(Number(item.price)*100); if(model&&Number.isSafeInteger(cents)&&cents>=0) run(configDb,"insert into billing_model_prices(model,price_cents,enabled,updated_at) values(?,?,?,?)",model,cents,item.enabled===false?0:1,timestamp); }
      const epay=body.epay??{}; const existing=epaySettings(true); const key=String(epay.merchantKey??"")==="********"?existing.merchantKey:String(epay.merchantKey??"");
      if (epay.enabled && (!String(epay.apiUrl??"").trim() || !String(epay.merchantId??"").trim() || !key)) throw new Error("启用易支付前请完整填写接口地址、商户号和商户密钥");
      run(configDb, `insert into epay_settings(id,enabled,api_url,merchant_id,merchant_key,payment_types,minimum_recharge_cents,updated_at) values('default',?,?,?,?,?,?,?) on conflict(id) do update set enabled=excluded.enabled,api_url=excluded.api_url,merchant_id=excluded.merchant_id,merchant_key=excluded.merchant_key,payment_types=excluded.payment_types,minimum_recharge_cents=excluded.minimum_recharge_cents,updated_at=excluded.updated_at`, epay.enabled?1:0,String(epay.apiUrl??"").trim(),String(epay.merchantId??"").trim(),key,(Array.isArray(epay.paymentTypes)?epay.paymentTypes:["alipay","wxpay"]).join(","),Math.max(1,Math.round(Number(epay.minimumRecharge??1)*100)),timestamp);
      configDb.exec("commit");
    } catch(error){configDb.exec("rollback");throw error;}
    return c.json({ ok:true });
  });
  api.post("/config/billing/users/:id/balance", async (c) => {
    const blocked=requireConfig(c); if(blocked)return blocked; const body=await c.req.json().catch(() => ({})); const cents=Math.round(Number(body.amount)*100);
    if(!Number.isSafeInteger(cents)) return c.json({error:"金额无效"},400); const id=c.req.param("id");
    appDb.exec("begin immediate"); try { const changed=run(appDb,"update users set balance_cents=balance_cents+?,updated_at=? where id=? and balance_cents+?>=0",cents,now(),id,cents); if(!Number(changed.changes??0)) throw new Error("用户不存在或调整后余额不能为负数"); const balance=getOne<{balance_cents:number}>(appDb,"select balance_cents from users where id=?",id)?.balance_cents??0; run(appDb,"insert into billing_ledger(id,user_id,type,amount_cents,balance_after_cents,reference_id,description,created_at) values(?,?,?,?,?,'',?,?)",makeId("ledger"),id,"admin_adjust",cents,balance,String(body.description??"后台调整"),now()); appDb.exec("commit"); return c.json({balanceCents:balance}); } catch(error){appDb.exec("rollback");throw error;}
  });
}
