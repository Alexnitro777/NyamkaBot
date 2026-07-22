import { ButtonInteraction, MessageFlags } from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import { hasButtonAccess } from '../permissions';
import { getUserHistory } from '../storage';
import { buildHistoryView } from '../ui';

const handler: ButtonHandler = {
  customId: /^history:page:\d+:-?\d+$/,

  async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
    if (!hasButtonAccess(interaction, gc, 'staff')) {
      await interaction.reply({ content: 'Недостаточно прав.', flags: MessageFlags.Ephemeral });
      return;
    }

    const [, , userId, pageRaw] = interaction.customId.split(':');
    const guildId = interaction.guildId!;

    const history = await getUserHistory(guildId, userId);
    const targetUser = await interaction.client.users.fetch(userId).catch(() => ({ id: userId }));

    const { embed, row } = buildHistoryView(history, targetUser, Number(pageRaw));

    await interaction.update({ embeds: [embed], components: row ? [row] : [] });
  },
};

export default handler;
