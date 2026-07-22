import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { SlashCommand, GuildConfig } from '../types';
import { getUserHistory } from '../storage';
import { buildHistoryView } from '../ui';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('история')
    .setDescription('Показать историю заявок, апелляций и ЧС участника')
    .addUserOption((option) =>
      option
        .setName('цель')
        .setDescription('Кого проверить')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames) as unknown as SlashCommand['data'],

  access: 'staff',

  async execute(interaction: ChatInputCommandInteraction, _gc: GuildConfig): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({
        content: 'Команду нужно запускать на сервере.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const user = interaction.options.getUser('цель', true);
    const history = await getUserHistory(interaction.guildId, user.id);

    const { embed, row } = buildHistoryView(history, user, 0);

    await interaction.reply({
      embeds: [embed],
      components: row ? [row] : [],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
