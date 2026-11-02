import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveTicketingConfig } from "../src/modules/ticketing/runtime-config";
import { ticketingConfig } from "../src/modules/ticketing/config";
import { ticketState } from "../src/modules/ticketing/service";

const env = {
  ...process.env,
  NODE_ENV: "development" as const,
  ADMIN_FIXTURE_FILE: path.resolve(".data/admin-e2e-123/identities.json"),
  DB_PATH: path.resolve(".data/admin-e2e-123/db"),
};
test("Browser sale fixtures remain independent of calendar dates without modifying demo configuration", () => {
  const original = JSON.stringify(ticketingConfig);
  for (const date of ["2026-10-20", "2026-11-02", "2030-01-02"]) {
    const now = new Date(date);
    const fixture = resolveTicketingConfig(env, now.getTime());
    assert.equal(ticketState(fixture.tickets[0], 100, now), "ended");
    assert.equal(ticketState(fixture.tickets[1], 100, now), "on_sale");
    const standard = fixture.tickets[1];
    assert.equal(
      ticketState(standard, 100, new Date(standard.opensAt)),
      "on_sale",
    );
    assert.equal(
      ticketState(standard, 100, new Date(Date.parse(standard.opensAt) - 1)),
      "not_open",
    );
    assert.equal(
      ticketState(standard, 100, new Date(standard.closesAt)),
      "ended",
    );
  }
  assert.equal(JSON.stringify(ticketingConfig), original);
});
test("Fixture dates cannot affect production, normal development or another database", () => {
  assert.equal(
    resolveTicketingConfig({ ...env, NODE_ENV: "production" }),
    ticketingConfig,
  );
  assert.equal(
    resolveTicketingConfig({ ...env, ADMIN_FIXTURE_FILE: "" }),
    ticketingConfig,
  );
  assert.throws(() =>
    resolveTicketingConfig({ ...env, DB_PATH: ".data/pglite" }),
  );
  assert.throws(() =>
    resolveTicketingConfig({
      ...env,
      ADMIN_FIXTURE_FILE: ".data/mail-test/identities.json",
    }),
  );
});
