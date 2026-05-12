import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { reweight, pct } from '@/lib/effectiveness/salesExecution';
import type { InValue } from '@libsql/client';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
async function runQuery(sql: string, args: InValue[] = []): Promise<Row[]> {
  await dbReady;
  const r = await db.execute({ sql, args });
  return r.rows as Row[];
}

function resolveRepIds(raw: unknown): string[] {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function dateMsOffset(dateStr: string, offsetMs: number): string {
  const d = new Date(dateStr);
  d.setTime(d.getTime() + offsetMs);
  return d.toISOString().slice(0, 10);
}

interface RepConfData {
  meetingsScheduled: number;
  meetingsHeld: number;
  companiesWithMeeting: number;
  coWithMtgFu: number;
  followupsCreated: number;
  followupsCompleted: number;
  targetsMet: number;
  targetsFu: number;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') ?? '';
    const endDate = searchParams.get('endDate') ?? '';

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });
    }

    // 1. Fetch conferences in range
    const confRows = await runQuery(
      `SELECT c.id, c.name, COALESCE(c.end_date, c.start_date) AS conf_date
       FROM conferences c
       WHERE COALESCE(c.end_date, c.start_date) >= ? AND COALESCE(c.end_date, c.start_date) <= ?
       ORDER BY conf_date ASC`,
      [startDate, endDate],
    );

    if (confRows.length === 0) {
      return NextResponse.json({ conferences: [], reps: [], priorAvg: {} });
    }

    const confIds = confRows.map(r => Number(r.id));
    const placeholders = confIds.map(() => '?').join(',');

    // 2. Fetch rep name map
    const repNameRows = await runQuery(
      `SELECT co.id, COALESCE(u.display_name, co.value) AS display_name, u.role
       FROM config_options co
       LEFT JOIN users u ON u.config_id = co.id
       WHERE co.category = 'user'`,
    );
    const repNameMap = new Map<string, { name: string; role: string | null }>();
    for (const r of repNameRows) {
      repNameMap.set(String(r.id), {
        name: String(r.display_name ?? r.id),
        role: r.role != null ? String(r.role) : null,
      });
    }

    // 3. Run parallel queries
    const [
      meetingRows,
      fuAttachRows,
      followupRows,
      targetTotalRows,
      targetMeetingRows,
      targetFuRows,
      budgetRows,
    ] = await Promise.all([
      // a. Meetings
      runQuery(
        `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                COUNT(*) AS meetings_scheduled,
                COUNT(CASE WHEN LOWER(COALESCE(cop.action_key,''))='meeting_held' THEN 1 END) AS meetings_held,
                COUNT(DISTINCT CASE WHEN LOWER(COALESCE(cop.action_key,''))='meeting_held' THEN a.company_id END) AS companies_with_meeting
         FROM meetings m
         JOIN attendees a ON m.attendee_id=a.id
         LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
         WHERE m.conference_id IN (${placeholders}) AND m.scheduled_by IS NOT NULL AND m.scheduled_by != ''
         GROUP BY m.conference_id, m.scheduled_by`,
        confIds,
      ),
      // b. Follow-up attachments (companies with meeting AND followup by rep)
      runQuery(
        `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                COUNT(DISTINCT CASE WHEN fu.id IS NOT NULL THEN a.company_id END) AS co_with_mtg_fu
         FROM meetings m
         JOIN attendees a ON m.attendee_id=a.id
         LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
         LEFT JOIN follow_ups fu ON fu.conference_id=m.conference_id AND fu.attendee_id=m.attendee_id
                                  AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
         WHERE m.conference_id IN (${placeholders})
           AND LOWER(COALESCE(cop.action_key,''))='meeting_held'
           AND m.scheduled_by IS NOT NULL AND m.scheduled_by!=''
         GROUP BY m.conference_id, m.scheduled_by`,
        confIds,
      ),
      // c. Follow-ups
      runQuery(
        `SELECT fu.conference_id, fu.assigned_rep AS rep_raw,
                COUNT(*) AS followups_created,
                SUM(CASE WHEN CAST(fu.completed AS TEXT) IN ('1','true') THEN 1 ELSE 0 END) AS followups_completed
         FROM follow_ups fu
         WHERE fu.conference_id IN (${placeholders})
           AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
           AND fu.assigned_rep IS NOT NULL AND fu.assigned_rep!=''
         GROUP BY fu.conference_id, fu.assigned_rep`,
        confIds,
      ),
      // d. Target totals
      runQuery(
        `SELECT conference_id, COUNT(DISTINCT attendee_id) AS total_targets
         FROM conference_targets
         WHERE conference_id IN (${placeholders})
         GROUP BY conference_id`,
        confIds,
      ),
      // e. Target meetings by rep
      runQuery(
        `SELECT m.conference_id, m.scheduled_by AS rep_raw, COUNT(DISTINCT m.attendee_id) AS targets_met
         FROM meetings m
         LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
         WHERE m.conference_id IN (${placeholders})
           AND LOWER(COALESCE(cop.action_key,''))='meeting_held'
           AND m.attendee_id IN (SELECT attendee_id FROM conference_targets WHERE conference_id=m.conference_id)
           AND m.scheduled_by IS NOT NULL AND m.scheduled_by!=''
         GROUP BY m.conference_id, m.scheduled_by`,
        confIds,
      ),
      // f. Target followups by rep
      runQuery(
        `SELECT fu.conference_id, fu.assigned_rep AS rep_raw, COUNT(DISTINCT fu.attendee_id) AS targets_fu
         FROM follow_ups fu
         WHERE fu.conference_id IN (${placeholders})
           AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
           AND fu.attendee_id IN (SELECT attendee_id FROM conference_targets WHERE conference_id=fu.conference_id)
           AND fu.assigned_rep IS NOT NULL AND fu.assigned_rep!=''
         GROUP BY fu.conference_id, fu.assigned_rep`,
        confIds,
      ),
      // g. Required pipeline (may not exist)
      runQuery(
        `SELECT conference_id, CAST(required_pipeline_amount AS REAL) AS req_pipeline
         FROM conference_budget
         WHERE conference_id IN (${placeholders})
           AND required_pipeline_amount IS NOT NULL
           AND CAST(required_pipeline_amount AS REAL) > 0`,
        confIds,
      ).catch(() => [] as Row[]),
    ]);

    // Build target total map: confId -> totalTargets
    const targetTotalMap = new Map<number, number>();
    for (const r of targetTotalRows) {
      targetTotalMap.set(Number(r.conference_id), Number(r.total_targets ?? 0));
    }

    // 4. Build repConfMap: repId -> confId -> RepConfData
    const repConfMap = new Map<string, Map<number, RepConfData>>();

    const getOrCreate = (repId: string, confId: number): RepConfData => {
      if (!repConfMap.has(repId)) repConfMap.set(repId, new Map());
      const confMap = repConfMap.get(repId)!;
      if (!confMap.has(confId)) {
        confMap.set(confId, {
          meetingsScheduled: 0,
          meetingsHeld: 0,
          companiesWithMeeting: 0,
          coWithMtgFu: 0,
          followupsCreated: 0,
          followupsCompleted: 0,
          targetsMet: 0,
          targetsFu: 0,
        });
      }
      return confMap.get(confId)!;
    }

    // Process meeting rows
    for (const r of meetingRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      const scheduled = Number(r.meetings_scheduled ?? 0) / reps.length;
      const held = Number(r.meetings_held ?? 0) / reps.length;
      const companiesWithMeeting = Number(r.companies_with_meeting ?? 0) / reps.length;
      for (const repId of reps) {
        const d = getOrCreate(repId, confId);
        d.meetingsScheduled += scheduled;
        d.meetingsHeld += held;
        d.companiesWithMeeting += companiesWithMeeting;
      }
    }

    // Process fu attach rows
    for (const r of fuAttachRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      const coWithMtgFu = Number(r.co_with_mtg_fu ?? 0) / reps.length;
      for (const repId of reps) {
        const d = getOrCreate(repId, confId);
        d.coWithMtgFu += coWithMtgFu;
      }
    }

    // Process followup rows
    for (const r of followupRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      const created = Number(r.followups_created ?? 0) / reps.length;
      const completed = Number(r.followups_completed ?? 0) / reps.length;
      for (const repId of reps) {
        const d = getOrCreate(repId, confId);
        d.followupsCreated += created;
        d.followupsCompleted += completed;
      }
    }

    // Process target meeting rows
    for (const r of targetMeetingRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      const targetsMet = Number(r.targets_met ?? 0) / reps.length;
      for (const repId of reps) {
        const d = getOrCreate(repId, confId);
        d.targetsMet += targetsMet;
      }
    }

    // Process target fu rows
    for (const r of targetFuRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      const targetsFu = Number(r.targets_fu ?? 0) / reps.length;
      for (const repId of reps) {
        const d = getOrCreate(repId, confId);
        d.targetsFu += targetsFu;
      }
    }

    // 5. Compute SES scores per rep per conference
    type RepConfScore = {
      sesScore: number | null;
      components: {
        meeting_execution: number | null;
        followup_execution: number | null;
        pipeline_influence: number | null;
        target_account_execution: number | null;
        rep_productivity: number | null;
      };
    };

    const repResults: {
      repId: string;
      repName: string;
      role: string | null;
      conferences: Record<number, RepConfScore>;
    }[] = [];

    for (const [repId, confMap] of Array.from(repConfMap.entries())) {
      const info = repNameMap.get(repId);
      // Only include reps we can name
      if (!info) continue;

      const conferences: Record<number, RepConfScore> = {};

      for (const [confId, d] of Array.from(confMap.entries())) {
        // meeting_execution: holdRate * 0.5 + fuAttachRate * 0.5
        const holdRate = pct(d.meetingsHeld, d.meetingsScheduled);
        const fuAttachRate = d.companiesWithMeeting > 0
          ? pct(d.coWithMtgFu, d.companiesWithMeeting)
          : null;

        let meeting_execution: number | null = null;
        if (holdRate != null && fuAttachRate != null) {
          meeting_execution = Math.round(holdRate * 0.5 + fuAttachRate * 0.5);
        } else if (holdRate != null) {
          meeting_execution = Math.round(holdRate);
        } else if (fuAttachRate != null) {
          meeting_execution = Math.round(fuAttachRate);
        }

        // followup_execution
        const followup_execution = pct(d.followupsCompleted, d.followupsCreated);
        const followup_execution_rounded = followup_execution != null ? Math.round(followup_execution) : null;

        // target_account_execution
        const totalTargets = targetTotalMap.get(confId) ?? 0;
        let target_account_execution: number | null = null;
        if (totalTargets > 0) {
          const raw = ((d.targetsMet + d.targetsFu) / totalTargets) * 100;
          target_account_execution = Math.round(Math.min(100, raw));
        }

        const { score } = reweight([
          { key: 'meeting_execution', score: meeting_execution, weight: 0.25 },
          { key: 'followup_execution', score: followup_execution_rounded, weight: 0.20 },
          { key: 'target_account_execution', score: target_account_execution, weight: 0.15 },
        ]);

        conferences[confId] = {
          sesScore: score,
          components: {
            meeting_execution,
            followup_execution: followup_execution_rounded,
            pipeline_influence: null,
            target_account_execution,
            rep_productivity: null,
          },
        };
      }

      if (Object.keys(conferences).length > 0) {
        repResults.push({
          repId,
          repName: info.name,
          role: info.role,
          conferences,
        });
      }
    }

    // 6. Prior period trend
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const durationMs = endMs - startMs;
    const priorStart = dateMsOffset(startDate, -durationMs);
    const priorEnd = dateMsOffset(endDate, -durationMs);

    let priorAvg: Record<string, number> = {};
    try {
      const priorConfRows = await runQuery(
        `SELECT c.id, COALESCE(c.end_date, c.start_date) AS conf_date
         FROM conferences c
         WHERE COALESCE(c.end_date, c.start_date) >= ? AND COALESCE(c.end_date, c.start_date) <= ?`,
        [priorStart, priorEnd],
      );

      if (priorConfRows.length > 0) {
        const priorConfIds = priorConfRows.map(r => Number(r.id));
        const priorPlaceholders = priorConfIds.map(() => '?').join(',');
        const priorTotalTargetRows = await runQuery(
          `SELECT conference_id, COUNT(DISTINCT attendee_id) AS total_targets
           FROM conference_targets WHERE conference_id IN (${priorPlaceholders}) GROUP BY conference_id`,
          priorConfIds,
        ).catch(() => [] as Row[]);
        const priorTargetTotalMap = new Map<number, number>();
        for (const r of priorTotalTargetRows) {
          priorTargetTotalMap.set(Number(r.conference_id), Number(r.total_targets ?? 0));
        }

        const [priorMeetingRows, priorFuAttachRows, priorFollowupRows, priorTargetMeetingRows, priorTargetFuRows] = await Promise.all([
          runQuery(
            `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                    COUNT(*) AS meetings_scheduled,
                    COUNT(CASE WHEN LOWER(COALESCE(cop.action_key,''))='meeting_held' THEN 1 END) AS meetings_held,
                    COUNT(DISTINCT CASE WHEN LOWER(COALESCE(cop.action_key,''))='meeting_held' THEN a.company_id END) AS companies_with_meeting
             FROM meetings m JOIN attendees a ON m.attendee_id=a.id
             LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
             WHERE m.conference_id IN (${priorPlaceholders}) AND m.scheduled_by IS NOT NULL AND m.scheduled_by != ''
             GROUP BY m.conference_id, m.scheduled_by`,
            priorConfIds,
          ),
          runQuery(
            `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                    COUNT(DISTINCT CASE WHEN fu.id IS NOT NULL THEN a.company_id END) AS co_with_mtg_fu
             FROM meetings m JOIN attendees a ON m.attendee_id=a.id
             LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
             LEFT JOIN follow_ups fu ON fu.conference_id=m.conference_id AND fu.attendee_id=m.attendee_id
                                      AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
             WHERE m.conference_id IN (${priorPlaceholders})
               AND LOWER(COALESCE(cop.action_key,''))='meeting_held'
               AND m.scheduled_by IS NOT NULL AND m.scheduled_by!=''
             GROUP BY m.conference_id, m.scheduled_by`,
            priorConfIds,
          ),
          runQuery(
            `SELECT fu.conference_id, fu.assigned_rep AS rep_raw,
                    COUNT(*) AS followups_created,
                    SUM(CASE WHEN CAST(fu.completed AS TEXT) IN ('1','true') THEN 1 ELSE 0 END) AS followups_completed
             FROM follow_ups fu
             WHERE fu.conference_id IN (${priorPlaceholders})
               AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
               AND fu.assigned_rep IS NOT NULL AND fu.assigned_rep!=''
             GROUP BY fu.conference_id, fu.assigned_rep`,
            priorConfIds,
          ),
          runQuery(
            `SELECT m.conference_id, m.scheduled_by AS rep_raw, COUNT(DISTINCT m.attendee_id) AS targets_met
             FROM meetings m
             LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
             WHERE m.conference_id IN (${priorPlaceholders})
               AND LOWER(COALESCE(cop.action_key,''))='meeting_held'
               AND m.attendee_id IN (SELECT attendee_id FROM conference_targets WHERE conference_id=m.conference_id)
               AND m.scheduled_by IS NOT NULL AND m.scheduled_by!=''
             GROUP BY m.conference_id, m.scheduled_by`,
            priorConfIds,
          ),
          runQuery(
            `SELECT fu.conference_id, fu.assigned_rep AS rep_raw, COUNT(DISTINCT fu.attendee_id) AS targets_fu
             FROM follow_ups fu
             WHERE fu.conference_id IN (${priorPlaceholders})
               AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
               AND fu.attendee_id IN (SELECT attendee_id FROM conference_targets WHERE conference_id=fu.conference_id)
               AND fu.assigned_rep IS NOT NULL AND fu.assigned_rep!=''
             GROUP BY fu.conference_id, fu.assigned_rep`,
            priorConfIds,
          ),
        ]);

        // Build prior repConfMap
        const priorRepConfMap = new Map<string, Map<number, RepConfData>>();
        const getPriorOrCreate = (repId: string, confId: number): RepConfData => {
          if (!priorRepConfMap.has(repId)) priorRepConfMap.set(repId, new Map());
          const cm = priorRepConfMap.get(repId)!;
          if (!cm.has(confId)) cm.set(confId, { meetingsScheduled: 0, meetingsHeld: 0, companiesWithMeeting: 0, coWithMtgFu: 0, followupsCreated: 0, followupsCompleted: 0, targetsMet: 0, targetsFu: 0 });
          return cm.get(confId)!;
        }

        for (const r of priorMeetingRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          const confId = Number(r.conference_id);
          for (const repId of reps) {
            const d = getPriorOrCreate(repId, confId);
            d.meetingsScheduled += Number(r.meetings_scheduled ?? 0) / reps.length;
            d.meetingsHeld += Number(r.meetings_held ?? 0) / reps.length;
            d.companiesWithMeeting += Number(r.companies_with_meeting ?? 0) / reps.length;
          }
        }
        for (const r of priorFuAttachRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          const confId = Number(r.conference_id);
          for (const repId of reps) {
            getPriorOrCreate(repId, confId).coWithMtgFu += Number(r.co_with_mtg_fu ?? 0) / reps.length;
          }
        }
        for (const r of priorFollowupRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          const confId = Number(r.conference_id);
          for (const repId of reps) {
            const d = getPriorOrCreate(repId, confId);
            d.followupsCreated += Number(r.followups_created ?? 0) / reps.length;
            d.followupsCompleted += Number(r.followups_completed ?? 0) / reps.length;
          }
        }
        for (const r of priorTargetMeetingRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          const confId = Number(r.conference_id);
          for (const repId of reps) {
            getPriorOrCreate(repId, confId).targetsMet += Number(r.targets_met ?? 0) / reps.length;
          }
        }
        for (const r of priorTargetFuRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          const confId = Number(r.conference_id);
          for (const repId of reps) {
            getPriorOrCreate(repId, confId).targetsFu += Number(r.targets_fu ?? 0) / reps.length;
          }
        }

        // Compute prior avg SES per rep
        for (const [repId, confMap] of Array.from(priorRepConfMap.entries())) {
          const scores: number[] = [];
          for (const [confId, d] of Array.from(confMap.entries())) {
            const holdRate = pct(d.meetingsHeld, d.meetingsScheduled);
            const fuAttachRate = d.companiesWithMeeting > 0 ? pct(d.coWithMtgFu, d.companiesWithMeeting) : null;
            let meeting_execution: number | null = null;
            if (holdRate != null && fuAttachRate != null) {
              meeting_execution = Math.round(holdRate * 0.5 + fuAttachRate * 0.5);
            } else if (holdRate != null) {
              meeting_execution = Math.round(holdRate);
            } else if (fuAttachRate != null) {
              meeting_execution = Math.round(fuAttachRate);
            }
            const fuExec = pct(d.followupsCompleted, d.followupsCreated);
            const fuExecRounded = fuExec != null ? Math.round(fuExec) : null;
            const totalTargets = priorTargetTotalMap.get(confId) ?? 0;
            let target_account_execution: number | null = null;
            if (totalTargets > 0) {
              target_account_execution = Math.round(Math.min(100, ((d.targetsMet + d.targetsFu) / totalTargets) * 100));
            }
            const { score } = reweight([
              { key: 'meeting_execution', score: meeting_execution, weight: 0.25 },
              { key: 'followup_execution', score: fuExecRounded, weight: 0.20 },
              { key: 'target_account_execution', score: target_account_execution, weight: 0.15 },
            ]);
            if (score != null) scores.push(score);
          }
          if (scores.length > 0) {
            priorAvg[repId] = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
          }
        }
      }
    } catch {
      // Prior period computation failed — return empty priorAvg
      priorAvg = {};
    }

    // 7. Build response
    const conferences = confRows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      date: String(r.conf_date),
    }));

    return NextResponse.json({
      conferences,
      reps: repResults,
      priorAvg,
    });
  } catch (err) {
    console.error('[rep-performance]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
