import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  ActionRowBuilder,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import { appealQuestions } from '../questions';
import { getAppeal } from '../storage';

const DENY_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const handler: ButtonHandler = {
  customId: 'appeal:start',

  async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
    const member = interaction.member as GuildMember | null;
    if (!member) {
      await interaction.reply({
        content: 'Апелляция доступна только участникам в чёрном списке.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const hasBlacklist = member.roles.cache.has(gc.roles.blacklist);
    const hasSoftBlacklist = gc.roles.blacklistSoft?.some((id) => member.roles.cache.has(id)) ?? false;
    if (!hasBlacklist && !hasSoftBlacklist) {
      await interaction.reply({
        content: 'Апелляция доступна только участникам в чёрном списке.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = await getAppeal(interaction.guildId!, interaction.user.id);
    if (existing?.status === 'pending') {
      await interaction.reply({ content: 'Ваша апелляция уже на рассмотрении.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (existing?.status === 'denied' && existing.resolvedAt) {
      const availableAt = existing.resolvedAt + DENY_COOLDOWN_MS;
      if (Date.now() < availableAt) {
        const ts = Math.floor(availableAt / 1000);
        await interaction.reply({
          content:
            `⛔ Вашу прошлую апелляцию отклонили. Новую можно подать <t:${ts}:R> (<t:${ts}:f>).`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    const modal = new ModalBuilder().setCustomId('appeal:submit').setTitle('Апелляция на разблокировку');
    const rows = appealQuestions.slice(0, 5).map((q) => {
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
