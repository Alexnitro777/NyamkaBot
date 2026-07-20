import type { ActionRowBuilder, ButtonBuilder, ButtonInteraction, EmbedBuilder } from 'discord.js';
import type { GuildConfig } from '../types';

export interface EmbedDefinition {
  name: string;
  description: string;
  build: () => {
    embeds: EmbedBuilder[];
    components?: ActionRowBuilder<ButtonBuilder>[];
  };
  buttons?: Record<string, (interaction: ButtonInteraction, gc: GuildConfig) => Promise<void> | void>;
}
