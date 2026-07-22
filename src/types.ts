import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  Client,
  Collection,
} from 'discord.js';

export interface GuildConfig {
  guildId: string;
  roles: {
    verified: string;
    blacklist: string;
    blacklistSoft?: string[];
    staff: string[];
    ststaff: string[];
    roleTag?: string;
  };
  channels: {
    review: string;
    appealReview: string;
    welcome?: string;
    decisions?: string;
    appeal?: string;
    tagLog?: string;
    blacklistLog?: string;
  };
  questionCategoryId: string;
}

export interface SlashCommand {
  data: Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  access?: 'owner' | 'ststaff' | 'staff';
  execute: (interaction: ChatInputCommandInteraction, gc: GuildConfig) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, gc: GuildConfig) => Promise<void>;
}

export interface ButtonHandler {
  customId: string | RegExp;
  execute: (interaction: ButtonInteraction, gc: GuildConfig) => Promise<void>;
}

export interface ModalHandler {
  customId: string | RegExp;
  execute: (interaction: ModalSubmitInteraction, gc: GuildConfig) => Promise<void>;
}

export interface BotClient extends Client {
  commands: Collection<string, SlashCommand>;
  buttons: Collection<string, ButtonHandler>;
  modals: Collection<string, ModalHandler>;
}

export type ApplicationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'blacklisted'
  | 'amnestied'
  | 'left'
  | 'expired';

export type AppealStatus = 'pending' | 'amnestied' | 'denied' | 'left';

export interface Application {
  userId: string;
  username: string;
  guildId: string;
  answers: Record<string, string>;
  submittedAt: number;
  status: ApplicationStatus;
  reviewMessageUrl?: string;
  reviewerId?: string;
  reason?: string;
  questionChannelId?: string;
  number?: number;
  joinMethod?: string;
  removedRoles?: string[];
}

export interface Appeal {
  userId: string;
  guildId: string;
  username: string;
  text: string;
  submittedAt: number;
  status: AppealStatus;
  reviewMessageUrl?: string;
  reviewerId?: string;
  reason?: string;
  resolvedAt?: number;
  questionChannelId?: string;
  blacklistReason?: string;
  number?: number;
}

export type HistoryEventType =
  | 'application_submitted'
  | 'application_approved'
  | 'application_rejected'
  | 'application_blacklisted'
  | 'application_expired'
  | 'application_left'
  | 'appeal_submitted'
  | 'appeal_amnestied'
  | 'appeal_denied'
  | 'appeal_left'
  | 'chsp_added'
  | 'chsp_removed';

export interface HistoryRecord {
  id?: number;
  guildId: string;
  userId: string;
  type: HistoryEventType;
  timestamp: number;
  executorId?: string;
  reason?: string;
  details?: string;
}
