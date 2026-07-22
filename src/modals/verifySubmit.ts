import { ModalSubmitInteraction, TextChannel, MessageFlags } from 'discord.js';
import { ModalHandler, GuildConfig } from '../types';
import { verifyQuestions } from '../questions';
import {
  getApplication,
  reserveApplication,
  nextApplicationNumber,
  getJoinMethod,
  saveApplication,
  updateApplication,
  saveHistoryRecord,
} from '../storage';
import {
  buildApplicationEmbed,
  buildReviewButtons,
  buildDmEmbed,
  postDecisionMessage,
} from '../ui';
import { blacklistMemberRoles } from '../roles';

const handler: ModalHandler = {
  customId: 'verify:submit',

  async execute(interaction: ModalSubmitInteraction, gc: GuildConfig): Promise<void> {
    const answers: Record<string, string> = {};
    for (const q of verifyQuestions.slice(0, 5)) {
      try {
        answers[q.id] = interaction.fields.getTextInputValue(q.id);
      } catch {
        answers[q.id] = '';
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const age = (answers.age ?? '').trim();
    const ageNumber = Number(age);
    if (!/^\d+$/.test(age) || ageNumber > 99) {
      await interaction.editReply({
        content: '❌ В поле «Сколько вам лет?» укажите реальный возраст числом. Заполните анкету заново.',
      });
      return;
    }
    answers.age = age;

    const guildId = interaction.guildId!;
    const existing = await getApplication(guildId, interaction.user.id);
    if (existing?.status === 'pending') {
      await interaction.editReply({ content: 'Ваша заявка уже на рассмотрении.' });
      return;
    }

    const submitter = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (submitter?.roles.cache.has(gc.roles.blacklist)) {
      await interaction.editReply({
        content: 'Вы находитесь в чёрном списке. Используйте канал апелляции.',
      });
      return;
    }

    if (submitter?.roles.cache.has(gc.roles.verified)) {
      await interaction.editReply({ content: 'Вы уже верифицированы.' });
      return;
    }

    if (ageNumber < 13) {
      const reason = 'Указан возраст менее 13 лет (автовыдача ЧС)';
      const { ok: rolesOk, removed } = submitter
        ? await blacklistMemberRoles(submitter, gc)
        : { ok: true, removed: [] };

      if (existing) {
        await updateApplication(guildId, interaction.user.id, {
          status: 'blacklisted',
          reason,
          reviewerId: interaction.client.user.id,
          removedRoles: removed,
          answers,
        });
      } else {
        await saveApplication({
          userId: interaction.user.id,
          username: interaction.user.tag,
          guildId,
          answers,
          submittedAt: Date.now(),
          status: 'blacklisted',
          reason,
          reviewerId: interaction.client.user.id,
          removedRoles: removed,
        });
      }

      await saveHistoryRecord({
        guildId,
        userId: interaction.user.id,
        type: 'application_blacklisted',
        timestamp: Date.now(),
        executorId: interaction.client.user.id,
        reason,
      });

      await submitter
        ?.send({
          embeds: [
            buildDmEmbed(
              '🚫 Вы добавлены в чёрный список',
              `Причина: \`${reason}\`\n\nВы можете подать апелляцию в ${
                gc.channels.appeal ? `<#${gc.channels.appeal}>` : 'соответствующем канале'
              }.`,
              0x992d22,
            ),
          ],
        })
        .catch(() => null);

      const logChannel = gc.channels.blacklistLog ?? gc.channels.decisions;
      await postDecisionMessage(interaction.client, logChannel, 'application', {
        label: 'ЧС',
        color: 0x992d22,
        reviewerId: interaction.client.user.id,
        targetUserId: interaction.user.id,
        reason: { title: 'Причина ЧС', text: reason },
        title: 'Автовыдача ЧСП',
      });

      const replyMsg = rolesOk
        ? '🚫 Ваша анкета отклонена. Вы занесены в ЧС проекта (минимальный возраст — 13 лет).'
        : '🚫 Ваша анкета отклонена. Вы занесены в ЧС проекта (минимальный возраст — 13 лет).\n⚠️ Не удалось выдать роль ЧС — проверьте иерархию ролей бота.';

      await interaction.editReply({ content: replyMsg });
      return;
    }

    const joinMethod = await getJoinMethod(guildId, interaction.user.id);

    const channel = await interaction.client.channels.fetch(gc.channels.review).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.error('[verifySubmit] review channel unavailable:', gc.channels.review);
      await interaction.editReply({
        content: '❌ Не удалось отправить заявку: канал модерации недоступен. Сообщите администрации.',
      });
      return;
    }

    const number = await nextApplicationNumber(guildId);
    const embed = buildApplicationEmbed(
      interaction.user,
      answers,
      number,
      joinMethod,
      submitter?.joinedTimestamp ?? null,
    );
    const buttons = buildReviewButtons(interaction.user.id);

    const msg = await (channel as TextChannel)
      .send({ embeds: [embed], components: [buttons] })
      .catch((e) => {
        console.error('[verifySubmit] failed to post review message:', e);
        return null;
      });

    if (!msg) {
      await interaction.editReply({
        content: '❌ Не удалось отправить заявку модерации. Попробуйте позже или сообщите администрации.',
      });
      return;
    }

    const now = Date.now();
    let reserved = false;
    try {
      reserved = await reserveApplication({
        userId: interaction.user.id,
        username: interaction.user.tag,
        guildId,
        answers,
        submittedAt: now,
        status: 'pending',
        reviewMessageUrl: msg.url,
        number,
        joinMethod,
      });
    } catch (e) {
      console.error('[verifySubmit] failed to reserve application:', e);
      await msg.delete().catch(() => null);
      await interaction.editReply({
        content: '❌ Ошибка при сохранении заявки. Попробуйте позже или сообщите администрации.',
      });
      return;
    }

    if (!reserved) {
      await msg.delete().catch(() => null);
      await interaction.editReply({ content: 'Ваша заявка уже на рассмотрении.' });
      return;
    }

    await interaction.editReply({
      content: '✅ Анкета отправлена. Ожидайте решения модерации.',
    });
  },
};

export default handler;
