import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from './db';
import { Application, ApplicationStatus, Appeal, AppealStatus } from './types';

const db: Pool = pool;

async function addColumnIfMissing(table: string, definition: string): Promise<void> {
  try {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

let initialized = false;

export async function initStorage(): Promise<void> {
  if (initialized) return;

  await db.query(`
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

  await db.query(`
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS counters (
      guildId VARCHAR(32) NOT NULL,
      name VARCHAR(64) NOT NULL,
      value BIGINT NOT NULL,
      PRIMARY KEY (guildId, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS join_methods (
      guildId VARCHAR(32) NOT NULL,
      userId VARCHAR(32) NOT NULL,
      method TEXT NOT NULL,
      joinedAt BIGINT NOT NULL,
      PRIMARY KEY (guildId, userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guildId VARCHAR(32) NOT NULL,
      \`key\` VARCHAR(64) NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (guildId, \`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      \`key\` VARCHAR(64) NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (\`key\`)
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
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT `key`, value FROM guild_settings WHERE guildId = ?',
    [guildId],
  );
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key as string] = row.value as string;
  }
  return out;
}

export async function getAppConfigValue(key: string): Promise<string | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT value FROM app_config WHERE `key` = ?',
    [key],
  );
  return rows.length ? (rows[0].value as string) : undefined;
}

export async function setAppConfigValue(key: string, value: string): Promise<void> {
  await db.execute(
    'INSERT INTO app_config (`key`, value) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [key, value],
  );
}

export async function saveJoinMethod(
  guildId: string,
  userId: string,
  method: string,
): Promise<void> {
  await db.execute(
    `INSERT INTO join_methods (guildId, userId, method, joinedAt) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE method = VALUES(method), joinedAt = VALUES(joinedAt)`,
    [guildId, userId, method, Date.now()],
  );
}

export async function getJoinMethod(
  guildId: string,
  userId: string,
): Promise<string | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT method FROM join_methods WHERE guildId = ? AND userId = ?',
    [guildId, userId],
  );
  return rows.length ? (rows[0].method as string) : undefined;
}

async function nextNumber(guildId: string, name: string): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
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

interface AppRow extends RowDataPacket {
  userId: string;
  username: string;
  guildId: string;
  answers: string;
  submittedAt: number;
  status: ApplicationStatus;
  reviewMessageUrl: string | null;
  reviewerId: string | null;
  reason: string | null;
  questionChannelId: string | null;
  number: number | null;
  joinMethod: string | null;
  removedRoles: string | null;
}

function rowToApp(row: AppRow): Application {
  return {
    userId: row.userId,
    username: row.username,
    guildId: row.guildId,
    answers: JSON.parse(row.answers),
    submittedAt: Number(row.submittedAt),
    status: row.status,
    reviewMessageUrl: row.reviewMessageUrl ?? undefined,
    reviewerId: row.reviewerId ?? undefined,
    reason: row.reason ?? undefined,
    questionChannelId: row.questionChannelId ?? undefined,
    number: row.number ?? undefined,
    joinMethod: row.joinMethod ?? undefined,
    removedRoles: row.removedRoles ? JSON.parse(row.removedRoles) : undefined,
  };
}

function appParams(app: Application): any[] {
  return [
    app.guildId,
    app.userId,
    app.username,
    JSON.stringify(app.answers),
    app.submittedAt,
    app.status,
    app.reviewMessageUrl ?? null,
    app.reviewerId ?? null,
    app.reason ?? null,
    app.questionChannelId ?? null,
    app.number ?? null,
    app.joinMethod ?? null,
    app.removedRoles ? JSON.stringify(app.removedRoles) : null,
  ];
}

const APP_COLUMNS =
  'guildId, userId, username, answers, submittedAt, status, reviewMessageUrl, reviewerId, reason, questionChannelId, number, joinMethod, removedRoles';
const APP_PLACEHOLDERS = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
const APP_UPDATE_ASSIGNMENTS = `
  username = VALUES(username),
  answers = VALUES(answers),
  submittedAt = VALUES(submittedAt),
  status = VALUES(status),
  reviewMessageUrl = VALUES(reviewMessageUrl),
  reviewerId = VALUES(reviewerId),
  reason = VALUES(reason),
  questionChannelId = VALUES(questionChannelId),
  number = VALUES(number),
  joinMethod = VALUES(joinMethod),
  removedRoles = VALUES(removedRoles)
`;

const APP_UPDATE_SET = `
  username = ?,
  answers = ?,
  submittedAt = ?,
  status = ?,
  reviewMessageUrl = ?,
  reviewerId = ?,
  reason = ?,
  questionChannelId = ?,
  number = ?,
  joinMethod = ?,
  removedRoles = ?
`;

export async function saveApplication(app: Application): Promise<void> {
  await db.execute(
    `INSERT INTO applications (${APP_COLUMNS}) VALUES (${APP_PLACEHOLDERS})
     ON DUPLICATE KEY UPDATE ${APP_UPDATE_ASSIGNMENTS}`,
    appParams(app),
  );
}

export async function reserveApplication(app: Application): Promise<boolean> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT status FROM applications WHERE guildId = ? AND userId = ? FOR UPDATE',
      [app.guildId, app.userId],
    );
    if (rows.length && rows[0].status === 'pending') {
      await conn.rollback();
      return false;
    }
    if (rows.length) {
      await conn.execute(
        `UPDATE applications SET ${APP_UPDATE_SET} WHERE guildId = ? AND userId = ?`,
        [...appUpdateParams(app), app.guildId, app.userId],
      );
    } else {
      await conn.execute(
        `INSERT INTO applications (${APP_COLUMNS}) VALUES (${APP_PLACEHOLDERS})`,
        appParams(app),
      );
    }
    await conn.commit();
    return true;
  } catch (err) {
    await safeRollback(conn);
    throw err;
  } finally {
    conn.release();
  }
}

function appUpdateParams(app: Application): any[] {
  return [
    app.username,
    JSON.stringify(app.answers),
    app.submittedAt,
    app.status,
    app.reviewMessageUrl ?? null,
    app.reviewerId ?? null,
    app.reason ?? null,
    app.questionChannelId ?? null,
    app.number ?? null,
    app.joinMethod ?? null,
    app.removedRoles ? JSON.stringify(app.removedRoles) : null,
  ];
}

async function safeRollback(conn: PoolConnection): Promise<void> {
  try {
    await conn.rollback();
  } catch {
  }
}

export async function claimApplicationQuestionChannel(
  guildId: string,
  userId: string,
  newId: string,
  oldId: string | null,
): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE applications SET questionChannelId = ? WHERE guildId = ? AND userId = ? AND questionChannelId <=> ?',
    [newId, guildId, userId, oldId],
  );
  return result.affectedRows === 1;
}

export async function getApplication(
  guildId: string,
  userId: string,
): Promise<Application | undefined> {
  const [rows] = await db.execute<AppRow[]>(
    'SELECT * FROM applications WHERE guildId = ? AND userId = ?',
    [guildId, userId],
  );
  return rows.length ? rowToApp(rows[0]) : undefined;
}

export async function getApplicationByQuestionChannel(
  channelId: string,
): Promise<Application | undefined> {
  const [rows] = await db.execute<AppRow[]>(
    'SELECT * FROM applications WHERE questionChannelId = ?',
    [channelId],
  );
  return rows.length ? rowToApp(rows[0]) : undefined;
}

export async function listPendingApplications(guildId: string): Promise<Application[]> {
  const [rows] = await db.execute<AppRow[]>(
    "SELECT * FROM applications WHERE guildId = ? AND status = 'pending' ORDER BY submittedAt ASC",
    [guildId],
  );
  return rows.map(rowToApp);
}

export async function listApplicationsWithQuestionChannel(
  guildId: string,
): Promise<Application[]> {
  const [rows] = await db.execute<AppRow[]>(
    'SELECT * FROM applications WHERE guildId = ? AND questionChannelId IS NOT NULL',
    [guildId],
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
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE applications SET status = ?, reviewerId = ?, reason = ?
     WHERE guildId = ? AND userId = ? AND status = 'pending'`,
    [to, reviewerId, reason ?? null, guildId, userId],
  );
  return result.affectedRows === 1;
}

export async function markApplicationLeft(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    "UPDATE applications SET status = 'left' WHERE guildId = ? AND userId = ? AND status = 'pending'",
    [guildId, userId],
  );
  return result.affectedRows === 1;
}

interface AppealRow extends RowDataPacket {
  userId: string;
  guildId: string;
  username: string;
  text: string;
  submittedAt: number;
  status: AppealStatus;
  reviewMessageUrl: string | null;
  reviewerId: string | null;
  reason: string | null;
  resolvedAt: number | null;
  questionChannelId: string | null;
  blacklistReason: string | null;
  number: number | null;
}

function rowToAppeal(row: AppealRow): Appeal {
  return {
    userId: row.userId,
    guildId: row.guildId,
    username: row.username,
    text: row.text,
    submittedAt: Number(row.submittedAt),
    status: row.status,
    reviewMessageUrl: row.reviewMessageUrl ?? undefined,
    reviewerId: row.reviewerId ?? undefined,
    reason: row.reason ?? undefined,
    resolvedAt: row.resolvedAt != null ? Number(row.resolvedAt) : undefined,
    questionChannelId: row.questionChannelId ?? undefined,
    blacklistReason: row.blacklistReason ?? undefined,
    number: row.number ?? undefined,
  };
}

function appealUpdateParams(appeal: Appeal): any[] {
  return [
    appeal.username,
    appeal.text,
    appeal.submittedAt,
    appeal.status,
    appeal.reviewMessageUrl ?? null,
    appeal.reviewerId ?? null,
    appeal.reason ?? null,
    appeal.resolvedAt ?? null,
    appeal.questionChannelId ?? null,
    appeal.blacklistReason ?? null,
    appeal.number ?? null,
  ];
}

function appealParams(appeal: Appeal): any[] {
  return [appeal.guildId, appeal.userId, ...appealUpdateParams(appeal)];
}

const APPEAL_COLUMNS =
  'guildId, userId, username, text, submittedAt, status, reviewMessageUrl, reviewerId, reason, resolvedAt, questionChannelId, blacklistReason, number';
const APPEAL_PLACEHOLDERS = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
const APPEAL_UPDATE_ASSIGNMENTS = `
  username = VALUES(username),
  text = VALUES(text),
  submittedAt = VALUES(submittedAt),
  status = VALUES(status),
  reviewMessageUrl = VALUES(reviewMessageUrl),
  reviewerId = VALUES(reviewerId),
  reason = VALUES(reason),
  resolvedAt = VALUES(resolvedAt),
  questionChannelId = VALUES(questionChannelId),
  blacklistReason = VALUES(blacklistReason),
  number = VALUES(number)
`;

const APPEAL_UPDATE_SET = `
  username = ?,
  text = ?,
  submittedAt = ?,
  status = ?,
  reviewMessageUrl = ?,
  reviewerId = ?,
  reason = ?,
  resolvedAt = ?,
  questionChannelId = ?,
  blacklistReason = ?,
  number = ?
`;

export async function saveAppeal(appeal: Appeal): Promise<void> {
  await db.execute(
    `INSERT INTO appeals (${APPEAL_COLUMNS}) VALUES (${APPEAL_PLACEHOLDERS})
     ON DUPLICATE KEY UPDATE ${APPEAL_UPDATE_ASSIGNMENTS}`,
    appealParams(appeal),
  );
}

export async function reserveAppeal(appeal: Appeal): Promise<boolean> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT status FROM appeals WHERE guildId = ? AND userId = ? FOR UPDATE',
      [appeal.guildId, appeal.userId],
    );
    if (rows.length && rows[0].status === 'pending') {
      await conn.rollback();
      return false;
    }
    if (rows.length) {
      await conn.execute(
        `UPDATE appeals SET ${APPEAL_UPDATE_SET} WHERE guildId = ? AND userId = ?`,
        [...appealUpdateParams(appeal), appeal.guildId, appeal.userId],
      );
    } else {
      await conn.execute(
        `INSERT INTO appeals (${APPEAL_COLUMNS}) VALUES (${APPEAL_PLACEHOLDERS})`,
        appealParams(appeal),
      );
    }
    await conn.commit();
    return true;
  } catch (err) {
    await safeRollback(conn);
    throw err;
  } finally {
    conn.release();
  }
}

export async function claimAppealQuestionChannel(
  guildId: string,
  userId: string,
  newId: string,
  oldId: string | null,
): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE appeals SET questionChannelId = ? WHERE guildId = ? AND userId = ? AND questionChannelId <=> ?',
    [newId, guildId, userId, oldId],
  );
  return result.affectedRows === 1;
}

export async function getAppeal(
  guildId: string,
  userId: string,
): Promise<Appeal | undefined> {
  const [rows] = await db.execute<AppealRow[]>(
    'SELECT * FROM appeals WHERE guildId = ? AND userId = ?',
    [guildId, userId],
  );
  return rows.length ? rowToAppeal(rows[0]) : undefined;
}

export async function getAppealByQuestionChannel(
  channelId: string,
): Promise<Appeal | undefined> {
  const [rows] = await db.execute<AppealRow[]>(
    'SELECT * FROM appeals WHERE questionChannelId = ?',
    [channelId],
  );
  return rows.length ? rowToAppeal(rows[0]) : undefined;
}

export async function listPendingAppeals(guildId: string): Promise<Appeal[]> {
  const [rows] = await db.execute<AppealRow[]>(
    "SELECT * FROM appeals WHERE guildId = ? AND status = 'pending' ORDER BY submittedAt ASC",
    [guildId],
  );
  return rows.map(rowToAppeal);
}

export async function listAppealsWithQuestionChannel(guildId: string): Promise<Appeal[]> {
  const [rows] = await db.execute<AppealRow[]>(
    'SELECT * FROM appeals WHERE guildId = ? AND questionChannelId IS NOT NULL',
    [guildId],
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
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE appeals SET status = ?, reviewerId = ?, reason = ?, resolvedAt = ?
     WHERE guildId = ? AND userId = ? AND status = 'pending'`,
    [to, reviewerId, reason ?? null, resolvedAt, guildId, userId],
  );
  return result.affectedRows === 1;
}

export async function markAppealLeft(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    "UPDATE appeals SET status = 'left' WHERE guildId = ? AND userId = ? AND status = 'pending'",
    [guildId, userId],
  );
  return result.affectedRows === 1;
}
