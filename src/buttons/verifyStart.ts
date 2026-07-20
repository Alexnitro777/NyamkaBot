import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  ActionRowBuilder,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import { verifyQuestions } from '../questions';
import { getApplication } from '../storage';

const handler: ButtonHandler = {
  customId: 'verify:start',

  async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
    const member = interaction.member as GuildMember | null;
    if (member && (member.roles.cache.has(gc.roles.blacklist) || (gc.roles.blacklistSoft?.some((id) => member.roles.cache.has(id)) ?? false))) {
      await interaction.reply({
        content: 'Вы находитесь в чёрном списке. Используйте канал апелляции.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = await getApplication(interaction.guildId!, interaction.user.id);
    if (existing?.status === 'pending') {
      await interaction.reply({ content: 'Ваша заявка уже на рассмотрении.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (member?.roles.cache.has(gc.roles.verified)) {
      await interaction.reply({ content: 'Вы уже верифицированы.', flags: MessageFlags.Ephemeral });
      return;
    }

    const modal = new ModalBuilder().setCustomId('verify:submit').setTitle('Анкета верификации');

    const rows = verifyQuestions.slice(0, 5).map((q) => {
      const input = new TextInputBuilder()
        .setCustomId(q.id)
        .setLabel(q.label)
        .setStyle(q.style)
        .setRequired(q.required);
      if (q.minLength) input.setMinLength(q.minLength);
      if (q.maxLength) input.setMaxLength(q.maxLength);
      if (q.placeholder) input.setPlaceholder(q.placeholder);
      return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    });

    modal.addComponents(...rows);
    await interaction.showModal(modal);
  },
};

export default handler;
