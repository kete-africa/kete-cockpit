import { randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { servicesStatus } from "@/features/status/status";
import { db } from "@/platform/db";
import { apps, probes } from "@/platform/schema";

// Phase 11, step E3: the status of Kete's services, from the Cockpit's own health readings — how
// each answers now, and how often it answered over a day and a week.

const run = randomBytes(4).toString("hex");
const ids = [`app_up_${run}`, `app_flaky_${run}`];
const at = new Date("2026-10-18T12:00:00Z");
const hoursAgo = (hours: number) => new Date(at.getTime() - hours * 3_600_000);

beforeAll(async () => {
  await db.insert(apps).values(
    ids.map((id, index) => ({
      id,
      product: `prd_status_${index}_${run}`,
      name: index === 0 ? `Compte Kete ${run}` : `Support ${run}`,
      environment: "staging" as const,
      baseUrl: `https://status-${index}-${run}.test`,
      createdBy: "usr_test",
    })),
  );
  await db.insert(probes).values([
    // Always up: today, yesterday, and three days ago.
    { appId: ids[0] as string, status: "healthy", checkedAt: hoursAgo(1) },
    { appId: ids[0] as string, status: "healthy", checkedAt: hoursAgo(30) },
    { appId: ids[0] as string, status: "degraded", checkedAt: hoursAgo(75) },
    // Down now, up an hour before; unreachable a week and more ago (outside the week).
    {
      appId: ids[1] as string,
      status: "unreachable",
      checkedAt: hoursAgo(0.5),
    },
    { appId: ids[1] as string, status: "healthy", checkedAt: hoursAgo(2) },
    { appId: ids[1] as string, status: "down", checkedAt: hoursAgo(26) },
    {
      appId: ids[1] as string,
      status: "unreachable",
      checkedAt: hoursAgo(24 * 9),
    },
  ]);
});

afterAll(async () => {
  await db.delete(apps).where(inArray(apps.id, ids));
});

describe("the status of the services", () => {
  it("says how each answers now, and how often it answered over a day and a week", async () => {
    const status = (await servicesStatus(at)).filter((s) =>
      s.name.endsWith(run),
    );
    expect(status.map((s) => [s.name, s.now, s.day, s.week])).toEqual([
      [`Compte Kete ${run}`, "healthy", 1, 1],
      [`Support ${run}`, "unreachable", 0.5, 1 / 3],
    ]);
    const support = status[1];
    // Seven days, the oldest first: yesterday down, today half up, nothing else read.
    expect(support?.days).toEqual([null, null, null, null, null, 0, 0.5]);
    expect(status[0]?.days[3]).toBe(1);
    expect(support?.checkedAt).toBe(hoursAgo(0.5).toISOString());
    // Nothing of an app's inside is said.
    expect(Object.keys(support ?? {}).sort()).toEqual(
      ["checkedAt", "day", "days", "environment", "name", "now", "week"].sort(),
    );
  });
});
