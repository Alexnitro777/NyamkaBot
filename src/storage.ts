import type { ResultSetHeader } from 'mysql2/promise';
import { eq, and, sql, asc, desc } from 'drizzle-orm';
import { pool, db } from './db';
import {
  applications,
  appeals,
  counters,
  joinMethods,
  guildSettings,
  appConfig,
  userHistory,
} from './schema';
import {
  Application,
  ApplicationStatus,
  Appeal,
  AppealStatus,
  HistoryRecord,
  HistoryEventType,
} from './types';

async function addColumnIfMissing(table: string, definition: string): Promise<void> {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

let initialized = false;

export async function initStorage(): Promise<void> {
  if (initialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      guildId VARCHAR(32) NOT NULL,
      userId VARCHAR(32) NOT NULL,
      username VARCHAR(255) NOT NULL,
      answers TEXT NOT NULL,
      submittedAt BIGINT NOT NULL,
      status VARCHAR(32) NOT NULL,
      reviewMessageUrl TEXT NULL,
      reviewerId VARCHAR(32) NULL,
      reason TEXT NULL,
      questionChannelId VARCHAR(32) NULL,
      number INT NULL,
      joinMethod TEXT NULL,
      removedRoles TEXT NULL,
      PRIMARY KEY (guildId, userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appeals (
      guildId VARCHAR(32) NOT NULL,
      userId VARCHAR(32) NOT NULL,
      username VARCHAR(255) NOT NULL,
      text TEXT NOT NULL,
      submittedAt BIGINT NOT NULL,
      status VARCHAR(32) NOT NULL,
      reviewMessageUrl TEXT NULL,
      reviewerId VARCHAR(32) NULL,
      reason TEXT NULL,
      resolvedAt BIGINT NULL,
      questionChannelId VARCHAR(32) NULL,
      blacklistReason TEXT NULL,
      number INT NULL,
      PRIMARY KEY (guildId, userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS counters (
      guildId VARCHAR(32) NOT NULL,
      name VARCHAR(64) NOT NULL,
      value BIGINT NOT NULL,
      PRIMARY KEY (guildId, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS join_methods (
      guildId VARCHAR(32) NOT NULL,
      userId VARCHAR(32) NOT NULL,
      method TEXT NOT NULL,
      joinedAt BIGINT NOT NULL,
      PRIMARY KEY (guildId, userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guildId VARCHAR(32) NOT NULL,
      \`key\` VARCHAR(64) NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (guildId, \`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      \`key\` VARCHAR(64) NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guildId VARCHAR(32) NOT NULL,
      userId VARCHAR(32) NOT NULL,
      type VARCHAR(32) NOT NULL,
      timestamp BIGINT NOT NULL,
      executorId VARCHAR(32) NULL,
      reason TEXT NULL,
      details TEXT NULL,
      INDEX idx_guild_user_time (guildId, userId, timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await addColumnIfMissing('applications', 'questionChannelId VARCHAR(32) NULL');
  await addColumnIfMissing('applications', 'number INT NULL');
  await addColumnIfMissing('applications', 'joinMethod TEXT NULL');
  await addColumnIfMissing('applications', 'removedRoles TEXT NULL');

  await addColumnIfMissing('appeals', 'reviewMessageUrl TEXT NULL');
  await addColumnIfMissing('appeals', 'resolvedAt BIGINT NULL');
  await addColumnIfMissing('appeals', 'questionChannelId VARCHAR(32) NULL');
  await addColumnIfMissing('appeals', 'blacklistReason TEXT NULL');
  await addColumnIfMissing('appeals', 'number INT NULL');

  initialized = true;
}

export async function getGuildSettings(guildId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: guildSettings.key, value: guildSettings.value })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId));

  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key] = row.value;
  }
  return out;
}

export async function getAppConfigValue(key: string): Promise<string | undefined> {
  const rows = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, key));

  return rows.length ? rows[0].value : undefined;
}

export async function setAppConfigValue(key: string, value: string): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function saveJoinMethod(
  guildId: string,
  userId: string,
  method: string,
): Promise<void> {
  const now = Date.now();
  await db
    .insert(joinMethods)
    .values({ guildId, userId, method, joinedAt: now })
    .onDuplicateKeyUpdate({ set: { method, joinedAt: now } });
}

export async function getJoinMethod(
  guildId: string,
  userId: string,
): Promise<string | undefined> {
  const rows = await db
    .select({ method: joinMethods.method })
    .from(joinMethods)
    .where(and(eq(joinMethods.guildId, guildId), eq(joinMethods.userId, userId)));

  return rows.length ? rows[0].method : undefined;
}

async function nextNumber(guildId: string, name: string): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO counters (guildId, name, value) VALUES (?, ?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)`,
    [guildId, name],
  );
  return Number(result.insertId);
}

export function nextApplicationNumber(guildId: string): Promise<number> {
  return nextNumber(guildId, 'application');
}

export function nextAppealNumber(guildId: string): Promise<number> {
  return nextNumber(guildId, 'appeal');
}

function rowToApp(row: typeof applications.$inferSelect): Application {
  return {
    userId: row.userId,
    username: row.username,
    guildId: row.guildId,
    answers: JSON.parse(row.answers),
    submittedAt: Number(row.submittedAt),
    status: row.status as ApplicationStatus,
    reviewMessageUrl: row.reviewMessageUrl ?? undefined,
    reviewerId: row.reviewerId ?? undefined,
    reason: row.reason ?? undefined,
    questionChannelId: row.questionChannelId ?? undefined,
    number: row.number ?? undefined,
    joinMethod: row.joinMethod ?? undefined,
    removedRoles: row.removedRoles ? JSON.parse(row.removedRoles) : undefined,
  };
}

export async function saveApplication(app: Application): Promise<void> {
  const values = {
    guildId: app.guildId,
    userId: app.userId,
    username: app.username,
    answers: JSON.stringify(app.answers),
    submittedAt: app.submittedAt,
    status: app.status,
    reviewMessageUrl: app.reviewMessageUrl ?? null,
    reviewerId: app.reviewerId ?? null,
    reason: app.reason ?? null,
    questionChannelId: app.questionChannelId ?? null,
    number: app.number ?? null,
    joinMethod: app.joinMethod ?? null,
    removedRoles: app.removedRoles ? JSON.stringify(app.removedRoles) : null,
  };

  await db
    .insert(applications)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        username: values.username,
        answers: values.answers,
        submittedAt: values.submittedAt,
        status: values.status,
        reviewMessageUrl: values.reviewMessageUrl,
        reviewerId: values.reviewerId,
        reason: values.reason,
        questionChannelId: values.questionChannelId,
        number: values.number,
        joinMethod: values.joinMethod,
        removedRoles: values.removedRoles,
      },
    });
}

export async function reserveApplication(app: Application): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({ status: applications.status })
      .from(applications)
      .where(and(eq(applications.guildId, app.guildId), eq(applications.userId, app.userId)))
      .for('update');

    if (rows.length && rows[0].status === 'pending') {
      return false;
    }

    const values = {
      guildId: app.guildId,
      userId: app.userId,
      username: app.username,
      answers: JSON.stringify(app.answers),
      submittedAt: app.submittedAt,
      status: app.status,
      reviewMessageUrl: app.reviewMessageUrl ?? null,
      reviewerId: app.reviewerId ?? null,
      reason: app.reason ?? null,
      questionChannelId: app.questionChannelId ?? null,
      number: app.number ?? null,
      joinMethod: app.joinMethod ?? null,
      removedRoles: app.removedRoles ? JSON.stringify(app.removedRoles) : null,
    };

    await tx
      .insert(applications)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          username: values.username,
          answers: values.answers,
          submittedAt: values.submittedAt,
          status: values.status,
          reviewMessageUrl: values.reviewMessageUrl,
          reviewerId: values.reviewerId,
          reason: values.reason,
          questionChannelId: values.questionChannelId,
          number: values.number,
          joinMethod: values.joinMethod,
          removedRoles: values.removedRoles,
        },
      });

    return true;
  });
}

export async function claimApplicationQuestionChannel(
  guildId: string,
  userId: string,
  newId: string,
  oldId: string | null,
): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE applications SET questionChannelId = ? WHERE guildId = ? AND userId = ? AND questionChannelId <=> ?',
    [newId, guildId, userId, oldId],
  );
  return result.affectedRows === 1;
}

export async function getApplication(
  guildId: string,
  userId: string,
): Promise<Application | undefined> {
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.guildId, guildId), eq(applications.userId, userId)));

  return rows.length ? rowToApp(rows[0]) : undefined;
}

export async function getApplicationByQuestionChannel(
  channelId: string,
): Promise<Application | undefined> {
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.questionChannelId, channelId));

  return rows.length ? rowToApp(rows[0]) : undefined;
}

export async function listPendingApplications(guildId: string): Promise<Application[]> {
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.guildId, guildId), eq(applications.status, 'pending')))
    .orderBy(asc(applications.submittedAt));

  return rows.map(rowToApp);
}

export async function listApplicationsWithQuestionChannel(
  guildId: string,
): Promise<Application[]> {
  const rows = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.guildId, guildId),
        sql`${applications.questionChannelId} IS NOT NULL`,
      ),
    );

  return rows.map(rowToApp);
}

export async function updateApplication(
  guildId: string,
  userId: string,
  patch: Partial<Application>,
): Promise<Application | undefined> {
  const current = await getApplication(guildId, userId);
  if (!current) return undefined;
  const updated = { ...current, ...patch };
  await saveApplication(updated);
  return updated;
}

export async function claimApplication(
  guildId: string,
  userId: string,
  to: ApplicationStatus,
  reviewerId: string,
  reason?: string,
): Promise<boolean> {
  const result = await db
    .update(applications)
    .set({ status: to, reviewerId, reason: reason ?? null })
    .where(
      and(
        eq(applications.guildId, guildId),
        eq(applications.userId, userId),
        eq(applications.status, 'pending'),
      ),
    );

  return result[0].affectedRows === 1;
}

export async function markApplicationLeft(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .update(applications)
    .set({ status: 'left' })
    .where(
      and(
        eq(applications.guildId, guildId),
        eq(applications.userId, userId),
        eq(applications.status, 'pending'),
      ),
    );

  return result[0].affectedRows === 1;
}

function rowToAppeal(row: typeof appeals.$inferSelect): Appeal {
  return {
    userId: row.userId,
    guildId: row.guildId,
    username: row.username,
    text: row.text,
    submittedAt: Number(row.submittedAt),
    status: row.status as AppealStatus,
    reviewMessageUrl: row.reviewMessageUrl ?? undefined,
    reviewerId: row.reviewerId ?? undefined,
    reason: row.reason ?? undefined,
    resolvedAt: row.resolvedAt != null ? Number(row.resolvedAt) : undefined,
    questionChannelId: row.questionChannelId ?? undefined,
    blacklistReason: row.blacklistReason ?? undefined,
    number: row.number ?? undefined,
  };
}

export async function saveAppeal(appeal: Appeal): Promise<void> {
  const values = {
    guildId: appeal.guildId,
    userId: appeal.userId,
    username: appeal.username,
    text: appeal.text,
    submittedAt: appeal.submittedAt,
    status: appeal.status,
    reviewMessageUrl: appeal.reviewMessageUrl ?? null,
    reviewerId: appeal.reviewerId ?? null,
    reason: appeal.reason ?? null,
    resolvedAt: appeal.resolvedAt ?? null,
    questionChannelId: appeal.questionChannelId ?? null,
    blacklistReason: appeal.blacklistReason ?? null,
    number: appeal.number ?? null,
  };

  await db
    .insert(appeals)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        username: values.username,
        text: values.text,
        submittedAt: values.submittedAt,
        status: values.status,
        reviewMessageUrl: values.reviewMessageUrl,
        reviewerId: values.reviewerId,
        reason: values.reason,
        resolvedAt: values.resolvedAt,
        questionChannelId: values.questionChannelId,
        blacklistReason: values.blacklistReason,
        number: values.number,
      },
    });
}

export async function reserveAppeal(appeal: Appeal): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({ status: appeals.status })
      .from(appeals)
      .where(and(eq(appeals.guildId, appeal.guildId), eq(appeals.userId, appeal.userId)))
      .for('update');

    if (rows.length && rows[0].status === 'pending') {
      return false;
    }

    const values = {
      guildId: appeal.guildId,
      userId: appeal.userId,
      username: appeal.username,
      text: appeal.text,
      submittedAt: appeal.submittedAt,
      status: appeal.status,
      reviewMessageUrl: appeal.reviewMessageUrl ?? null,
      reviewerId: appeal.reviewerId ?? null,
      reason: appeal.reason ?? null,
      resolvedAt: appeal.resolvedAt ?? null,
      questionChannelId: appeal.questionChannelId ?? null,
      blacklistReason: appeal.blacklistReason ?? null,
      number: appeal.number ?? null,
    };

    await tx
      .insert(appeals)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          username: values.username,
          text: values.text,
          submittedAt: values.submittedAt,
          status: values.status,
          reviewMessageUrl: values.reviewMessageUrl,
          reviewerId: values.reviewerId,
          reason: values.reason,
          resolvedAt: values.resolvedAt,
          questionChannelId: values.questionChannelId,
          blacklistReason: values.blacklistReason,
          number: values.number,
        },
      });

    return true;
  });
}

export async function claimAppealQuestionChannel(
  guildId: string,
  userId: string,
  newId: string,
  oldId: string | null,
): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE appeals SET questionChannelId = ? WHERE guildId = ? AND userId = ? AND questionChannelId <=> ?',
    [newId, guildId, userId, oldId],
  );
  return result.affectedRows === 1;
}

export async function getAppeal(
  guildId: string,
  userId: string,
): Promise<Appeal | undefined> {
  const rows = await db
    .select()
    .from(appeals)
    .where(and(eq(appeals.guildId, guildId), eq(appeals.userId, userId)));

  return rows.length ? rowToAppeal(rows[0]) : undefined;
}

export async function getAppealByQuestionChannel(
  channelId: string,
): Promise<Appeal | undefined> {
  const rows = await db
    .select()
    .from(appeals)
    .where(eq(appeals.questionChannelId, channelId));

  return rows.length ? rowToAppeal(rows[0]) : undefined;
}

export async function listPendingAppeals(guildId: string): Promise<Appeal[]> {
  const rows = await db
    .select()
    .from(appeals)
    .where(and(eq(appeals.guildId, guildId), eq(appeals.status, 'pending')))
    .orderBy(asc(appeals.submittedAt));

  return rows.map(rowToAppeal);
}

export async function listAppealsWithQuestionChannel(guildId: string): Promise<Appeal[]> {
  const rows = await db
    .select()
    .from(appeals)
    .where(
      and(eq(appeals.guildId, guildId), sql`${appeals.questionChannelId} IS NOT NULL`),
    );

  return rows.map(rowToAppeal);
}

export async function updateAppeal(
  guildId: string,
  userId: string,
  patch: Partial<Appeal>,
): Promise<Appeal | undefined> {
  const current = await getAppeal(guildId, userId);
  if (!current) return undefined;
  const updated = { ...current, ...patch };
  await saveAppeal(updated);
  return updated;
}

export async function claimAppeal(
  guildId: string,
  userId: string,
  to: AppealStatus,
  reviewerId: string,
  reason?: string,
  resolvedAt: number = Date.now(),
): Promise<boolean> {
  const result = await db
    .update(appeals)
    .set({ status: to, reviewerId, reason: reason ?? null, resolvedAt })
    .where(
      and(
        eq(appeals.guildId, guildId),
        eq(appeals.userId, userId),
        eq(appeals.status, 'pending'),
      ),
    );

  return result[0].affectedRows === 1;
}

export async function markAppealLeft(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .update(appeals)
    .set({ status: 'left' })
    .where(
      and(
        eq(appeals.guildId, guildId),
        eq(appeals.userId, userId),
        eq(appeals.status, 'pending'),
      ),
    );

  return result[0].affectedRows === 1;
}

export async function saveHistoryRecord(record: HistoryRecord): Promise<void> {
  await db.insert(userHistory).values({
    guildId: record.guildId,
    userId: record.userId,
    type: record.type,
    timestamp: record.timestamp,
    executorId: record.executorId ?? null,
    reason: record.reason ?? null,
    details: record.details ?? null,
  });
}

export async function getUserHistory(
  guildId: string,
  userId: string,
): Promise<HistoryRecord[]> {
  const rows = await db
    .select()
    .from(userHistory)
    .where(and(eq(userHistory.guildId, guildId), eq(userHistory.userId, userId)))
    .orderBy(desc(userHistory.timestamp));

  if (rows.length > 0) {
    return rows.map((r) => ({
      id: r.id,
      guildId: r.guildId,
      userId: r.userId,
      type: r.type as HistoryEventType,
      timestamp: Number(r.timestamp),
      executorId: r.executorId ?? undefined,
      reason: r.reason ?? undefined,
      details: r.details ?? undefined,
    }));
  }

  const legacy: HistoryRecord[] = [];
  const app = await getApplication(guildId, userId);
  if (app) {
    legacy.push({
      guildId,
      userId,
      type: 'application_submitted',
      timestamp: app.submittedAt,
    });
    if (app.status === 'approved') {
      legacy.push({
        guildId,
        userId,
        type: 'application_approved',
        timestamp: app.submittedAt + 1,
        executorId: app.reviewerId,
      });
    } else if (app.status === 'rejected') {
      legacy.push({
        guildId,
        userId,
        type: 'application_rejected',
        timestamp: app.submittedAt + 1,
        executorId: app.reviewerId,
        reason: app.reason,
      });
    } else if (app.status === 'blacklisted') {
      legacy.push({
        guildId,
        userId,
        type: 'application_blacklisted',
        timestamp: app.submittedAt + 1,
        executorId: app.reviewerId,
        reason: app.reason,
      });
    } else if (app.status === 'expired') {
      legacy.push({
        guildId,
        userId,
        type: 'application_expired',
        timestamp: app.submittedAt + 1,
      });
    } else if (app.status === 'left') {
      legacy.push({
        guildId,
        userId,
        type: 'application_left',
        timestamp: app.submittedAt + 1,
      });
    }
  }

  const appeal = await getAppeal(guildId, userId);
  if (appeal) {
    legacy.push({
      guildId,
      userId,
      type: 'appeal_submitted',
      timestamp: appeal.submittedAt,
    });
    if (appeal.status === 'amnestied') {
      legacy.push({
        guildId,
        userId,
        type: 'appeal_amnestied',
        timestamp: appeal.resolvedAt ?? (appeal.submittedAt + 1),
        executorId: appeal.reviewerId,
        reason: appeal.reason,
      });
    } else if (appeal.status === 'denied') {
      legacy.push({
        guildId,
        userId,
        type: 'appeal_denied',
        timestamp: appeal.resolvedAt ?? (appeal.submittedAt + 1),
        executorId: appeal.reviewerId,
        reason: appeal.reason,
      });
    } else if (appeal.status === 'left') {
      legacy.push({
        guildId,
        userId,
        type: 'appeal_left',
        timestamp: appeal.submittedAt + 1,
      });
    }
  }

  legacy.sort((a, b) => b.timestamp - a.timestamp);
  return legacy;
}
