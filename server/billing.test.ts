import { describe, expect, test } from "bun:test";
import {
  captureTextModelCharge,
  refundTextModelCharge,
  reserveImageCharge,
  reserveTextModelCharge,
  settlePartialImageCharge,
  signEpayParams
} from "./billing";
import { appDb, configDb } from "./db";
import { initAppDb, initConfigDb } from "./schema";

function billingFixture(balanceCents = 1_000) {
  initAppDb();
  initConfigDb();
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const userId = `billing_test_user_${suffix}`;
  const jobId = `billing_test_job_${suffix}`;
  const model = `billing-test-model-${suffix}`;
  const textModel = `billing-test-text-model-${suffix}`;
  const timestamp = new Date().toISOString();
  appDb.query(`insert into users(id,team_id,account,username,email,phone,password_hash,balance_cents,created_at,updated_at)
    values(?,null,?,?,?,?,?,?,?,?)`).run(userId, userId, userId, "", "", "test", balanceCents, timestamp, timestamp);
  configDb.query("insert into billing_model_prices(model,price_cents,enabled,updated_at) values(?,125,1,?)").run(model, timestamp);
  appDb.query(`insert into image_jobs(id,user_id,type,status,prompt,provider_id,created_at,updated_at)
    values(?,?,'generation','running','test','test',?,?)`).run(jobId, userId, timestamp, timestamp);
  return {
    userId,
    jobId,
    model,
    textModel,
    cleanup() {
      appDb.query("delete from billing_ledger where user_id=?").run(userId);
      appDb.query("delete from billing_text_reservations where user_id=?").run(userId);
      appDb.query("delete from billing_reservations where user_id=?").run(userId);
      appDb.query("delete from image_jobs where user_id=?").run(userId);
      appDb.query("delete from users where id=?").run(userId);
      configDb.query("delete from billing_model_prices where model=?").run(model);
      configDb.query("delete from billing_text_model_prices where model=?").run(textModel);
    }
  };
}

describe("billing", () => {
  test("uses classic Epay ASCII parameter ordering and excludes sign fields", () => {
    expect(signEpayParams({ type: "alipay", pid: "1001", money: "10.00", sign_type: "MD5", sign: "ignored" }, "secret"))
      .toBe("31a5f99ac1b73d40b5664d691ca5bcaa");
  });

  test("reserves balance and refunds a failed job exactly once", () => {
    const fixture = billingFixture();
    try {
      expect(reserveImageCharge(fixture.userId, fixture.jobId, fixture.model, 2)).toBe(250);
      expect(appDb.query("select balance_cents from users where id=?").get(fixture.userId)).toEqual({ balance_cents: 750 });
      appDb.query("update image_jobs set status='failed' where id=?").run(fixture.jobId);
      appDb.query("update image_jobs set status='failed' where id=?").run(fixture.jobId);
      expect(appDb.query("select balance_cents from users where id=?").get(fixture.userId)).toEqual({ balance_cents: 1_000 });
      expect(appDb.query("select status from billing_reservations where job_id=?").get(fixture.jobId)).toEqual({ status: "refunded" });
      expect(appDb.query("select count(*) as count from billing_ledger where user_id=? and type='refund'").get(fixture.userId)).toEqual({ count: 1 });
    } finally {
      fixture.cleanup();
    }
  });

  test("rejects insufficient balance without creating a reservation", () => {
    const fixture = billingFixture(100);
    try {
      expect(() => reserveImageCharge(fixture.userId, fixture.jobId, fixture.model, 1)).toThrow("余额不足");
      expect(appDb.query("select balance_cents from users where id=?").get(fixture.userId)).toEqual({ balance_cents: 100 });
      expect(appDb.query("select job_id from billing_reservations where job_id=?").get(fixture.jobId)).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  test("refunds missing images and captures only the delivered count", () => {
    const fixture = billingFixture();
    try {
      expect(reserveImageCharge(fixture.userId, fixture.jobId, fixture.model, 4)).toBe(500);
      expect(settlePartialImageCharge(fixture.jobId, 2)).toBe(250);
      appDb.query("update image_jobs set status='succeeded' where id=?").run(fixture.jobId);
      expect(appDb.query("select balance_cents from users where id=?").get(fixture.userId)).toEqual({ balance_cents: 750 });
      expect(appDb.query("select image_count,amount_cents,status from billing_reservations where job_id=?").get(fixture.jobId)).toEqual({ image_count: 2, amount_cents: 250, status: "captured" });
      expect(appDb.query("select amount_cents from billing_ledger where reference_id=?").get(`${fixture.jobId}:partial`)).toEqual({ amount_cents: 250 });
    } finally {
      fixture.cleanup();
    }
  });

  test("does not charge text models without an enabled positive price", () => {
    const fixture = billingFixture();
    try {
      expect(reserveTextModelCharge(fixture.userId, fixture.textModel, "prompt_optimize")).toBeNull();
      expect(appDb.query("select balance_cents from users where id=?").get(fixture.userId)).toEqual({ balance_cents: 1_000 });
      expect(appDb.query("select count(*) as count from billing_text_reservations where user_id=?").get(fixture.userId)).toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  test("captures one configured text model call", () => {
    const fixture = billingFixture();
    try {
      configDb.query("insert into billing_text_model_prices(model,price_cents,enabled,updated_at) values(?,35,1,?)").run(fixture.textModel, new Date().toISOString());
      const reservationId = reserveTextModelCharge(fixture.userId, fixture.textModel, "prompt_optimize", "request-1");
      expect(reservationId).toBeString();
      expect(appDb.query("select balance_cents from users where id=?").get(fixture.userId)).toEqual({ balance_cents: 965 });
      captureTextModelCharge(reservationId);
      expect(appDb.query("select amount_cents,status from billing_text_reservations where id=?").get(reservationId!)).toEqual({ amount_cents: 35, status: "captured" });
      expect(appDb.query("select count(*) as count from billing_ledger where user_id=? and type='consume'").get(fixture.userId)).toEqual({ count: 1 });
    } finally {
      fixture.cleanup();
    }
  });

  test("refunds a failed text model call exactly once", () => {
    const fixture = billingFixture();
    try {
      configDb.query("insert into billing_text_model_prices(model,price_cents,enabled,updated_at) values(?,45,1,?)").run(fixture.textModel, new Date().toISOString());
      const reservationId = reserveTextModelCharge(fixture.userId, fixture.textModel, "translate", "request-2");
      expect(refundTextModelCharge(reservationId)).toBe(45);
      expect(refundTextModelCharge(reservationId)).toBe(0);
      expect(appDb.query("select balance_cents from users where id=?").get(fixture.userId)).toEqual({ balance_cents: 1_000 });
      expect(appDb.query("select status from billing_text_reservations where id=?").get(reservationId!)).toEqual({ status: "refunded" });
      expect(appDb.query("select count(*) as count from billing_ledger where user_id=? and type='refund' and reference_id=?").get(fixture.userId, reservationId!)).toEqual({ count: 1 });
    } finally {
      fixture.cleanup();
    }
  });
});
