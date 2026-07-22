import {
  mysqlTable,
  varchar,
  text,
  bigint,
  int,
  primaryKey,
  index,
} from 'drizzle-orm/mysql-core';

export const applications = mysqlTable(
  'applications',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    userId: varchar('userId', { length: 32 }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    answers: text('answers').notNull(),
    submittedAt: bigint('submittedAt', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    reviewMessageUrl: text('reviewMessageUrl'),
    reviewerId: varchar('reviewerId', { length: 32 }),
    reason: text('reason'),
    questionChannelId: varchar('questionChannelId', { length: 32 }),
    number: int('number'),
    joinMethod: text('joinMethod'),
    removedRoles: text('removedRoles'),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const appeals = mysqlTable(
  'appeals',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    userId: varchar('userId', { length: 32 }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    text: text('text').notNull(),
    submittedAt: bigint('submittedAt', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    reviewMessageUrl: text('reviewMessageUrl'),
    reviewerId: varchar('reviewerId', { length: 32 }),
    reason: text('reason'),
    resolvedAt: bigint('resolvedAt', { mode: 'number' }),
    questionChannelId: varchar('questionChannelId', { length: 32 }),
    blacklistReason: text('blacklistReason'),
    number: int('number'),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const counters = mysqlTable(
  'counters',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    value: bigint('value', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.name] })],
);

export const joinMethods = mysqlTable(
  'join_methods',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    userId: varchar('userId', { length: 32 }).notNull(),
    method: text('method').notNull(),
    joinedAt: bigint('joinedAt', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const guildSettings = mysqlTable(
  'guild_settings',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    key: varchar('key', { length: 64 }).notNull(),
    value: text('value').notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.key] })],
);

export const appConfig = mysqlTable('app_config', {
  key: varchar('key', { length: 64 }).primaryKey().notNull(),
  value: text('value').notNull(),
});

export const userHistory = mysqlTable(
  'user_history',
  {
    id: int('id').autoincrement().primaryKey().notNull(),
    guildId: varchar('guildId', { length: 32 }).notNull(),
    userId: varchar('userId', { length: 32 }).notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
    executorId: varchar('executorId', { length: 32 }),
    reason: text('reason'),
    details: text('details'),
  },
  (table) => [
    index('idx_guild_user_time').on(table.guildId, table.userId, table.timestamp),
  ],
);
