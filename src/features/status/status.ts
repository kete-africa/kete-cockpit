import { sql } from 'drizzle-orm';
import { db } from '@/platform/db';
import type { ProbeStatus } from '@/platform/schema';

// The status of Kete's services (phase 11, step E3: « la page d'état des services »): each app the
// Cockpit watches, as anyone may see it — its name, how it answers now, and how often it answered
// over the last day and week, from the Cockpit's own health readings. Nothing else of it: no
// address, no version, no dependency.

export interface ServiceStatus {
  name: string;
  environment: string;
  /** How it answered at its last reading; null before any. */
  now: ProbeStatus | null;
  checkedAt: string | null;
  /** The share of readings where it answered (healthy or degraded), 0 to 1; null without any. */
  day: number | null;
  week: number | null;
  /** The last seven days, the oldest first: each day's share, null for a day without readings. */
  days: (number | null)[];
}

const share = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Every watched service, by environment then name. */
export async function servicesStatus(at: Date = new Date()): Promise<ServiceStatus[]> {
  const { rows } = await db.execute<{
    id: string;
    name: string;
    environment: string;
    now: ProbeStatus | null;
    checked_at: Date | null;
    day: string | null;
    week: string | null;
  }>(sql`
    select a.id, a.name, a.environment,
           last.status as now, last.checked_at,
           avg(case when p.status in ('healthy', 'degraded') then 1 else 0 end)
             filter (where p.checked_at > ${at}::timestamptz - interval '24 hours') as day,
           avg(case when p.status in ('healthy', 'degraded') then 1 else 0 end) as week
      from apps a
      left join lateral (
        select status, checked_at from probes
         where app_id = a.id and checked_at <= ${at}::timestamptz
         order by checked_at desc limit 1) last on true
      left join probes p
        on p.app_id = a.id
       and p.checked_at > ${at}::timestamptz - interval '7 days'
       and p.checked_at <= ${at}::timestamptz
     group by a.id, a.name, a.environment, last.status, last.checked_at
     order by a.environment, a.name`);
  const { rows: daily } = await db.execute<{
    id: string;
    day: number;
    up: string;
  }>(sql`
    select app_id as id,
           6 - ((${at}::timestamptz at time zone 'UTC')::date
                - (checked_at at time zone 'UTC')::date) as day,
           avg(case when status in ('healthy', 'degraded') then 1 else 0 end) as up
      from probes
     where (checked_at at time zone 'UTC')::date
           > (${at}::timestamptz at time zone 'UTC')::date - 7
       and checked_at <= ${at}::timestamptz
     group by app_id, 2`);
  return rows.map((row) => {
    const days: (number | null)[] = Array.from({ length: 7 }, () => null);
    for (const one of daily.filter((d) => d.id === row.id)) {
      const index = Number(one.day);
      if (index >= 0 && index < 7) days[index] = Number(one.up);
    }
    return {
      name: row.name,
      environment: row.environment,
      now: row.now,
      checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
      day: share(row.day),
      week: share(row.week),
      days,
    };
  });
}
