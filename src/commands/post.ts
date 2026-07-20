import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextBasedChannel,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { SlashCommand, GuildConfig } from '../types';
import { getEmbed, getEmbedNames } from '../embeds/registry';

export default {
  data: new SlashCommandBuilder()
    .setName('запостить')
    .setDescription('Опубликовать готовый embed по имени')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('название')
        .setDescription('Какой embed отправить')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName('канал')
        .setDescription('Канал назначения (по умолчанию — текущий)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as unknown as SlashCommand['data'],

  access: 'ststaff',

  autocomplete: async (interaction: AutocompleteInteraction, _gc: GuildConfig) => {
    const focused = interaction.options.getFocused().toLowerCase();
    const embeds = await getEmbedNames();
    const choices = embeds
      .filter((e) => e.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((e) => ({ name: `${e.name} — ${e.description}`.slice(0, 100), value: e.name }));
    await interaction.respond(choices);
  },

  execute: async (interaction: ChatInputCommandInteraction, _gc: GuildConfig) => {
    const name = interaction.options.getString('название', true);
    const def = await getEmbed(name);
    if (!def) {
      await interaction.reply({
        content: `❌ Embed «${name}» не найден.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const target = (interaction.options.getChannel('канал') ?? interaction.channel) as
      | TextBasedChannel
      | null;

    if (!target || !target.isTextBased() || !('send' in target)) {
      await interaction.reply({
        content: '❌ Не получилось отправить: выбери текстовый канал.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const { embeds: embedList, components } = def.build();
      await target.send({ embeds: embedList, components: components ?? [] });
      await interaction.reply({
        content: `✅ Embed «${name}» отправлен в <#${target.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error('Ошибка при отправке embed-а:', err);
      await interaction.reply({
        content: `❌ Ошибка при отправке: ${err instanceof Error ? err.message : String(err)}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
} satisfies SlashCommand;
