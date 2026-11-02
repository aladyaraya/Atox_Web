import path from "node:path";
import { ticketingConfig as configured } from "./config";

/** Existing browser fixtures get isolated relative sale dates, never a clock override. */
export function resolveTicketingConfig(env = process.env, now = Date.now()) {
  if (env.NODE_ENV !== "development" || !env.ADMIN_FIXTURE_FILE)
    return configured;
  const directory = path.dirname(path.resolve(env.ADMIN_FIXTURE_FILE));
  if (
    !/^admin-e2e-\d+$/.test(path.basename(directory)) ||
    path.dirname(directory) !== path.resolve(".data") ||
    path.resolve(env.DB_PATH || "") !== path.join(directory, "db")
  )
    throw new Error("Ticket fixtures require the isolated admin-e2e database");
  const fixture = structuredClone(configured);
  for (const ticket of fixture.tickets) {
    ticket.opensAt = new Date(now - 86400000).toISOString();
    ticket.closesAt = new Date(
      now + (ticket.id === "early" ? -3600000 : 86400000),
    ).toISOString();
  }
  return fixture;
}

export const ticketingConfig = resolveTicketingConfig();
