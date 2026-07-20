import { ModalSubmitInteraction, TextChannel, MessageFlags } from 'discord.js';
import { ModalHandler, GuildConfig } from '../types';
import { verifyQuestions } from '../questions';
import { getApplication, reserveApplication, nextApplicationNumber, getJoinMethod } from '../storage';
import { buildApplicationEmbed, buildReviewButtons } from '../ui';

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
    if (!/^\d+$/.test(age) || ageNumber < 13 || ageNumber > 99) {
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
    if (submitter?.roles.cache.has(gc.roles.blacklist) || (gc.roles.blacklistSoft?.some((id) => submitter?.roles.cache.has(id)) ?? false)) {
      await interaction.editReply({
        content: 'Вы находитесь в чёрном списке. Используйте канал апелляции.',
      });
      return;
    }

    if (submitter?.roles.cache.has(gc.roles.verified)) {
      await interaction.editReply({ content: 'Вы уже верифицированы.' });
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

    const reserved = await reserveApplication({
      userId: interaction.user.id,
      username: interaction.user.tag,
      guildId,
      answers,
      submittedAt: Date.now(),
      status: 'pending',
      reviewMessageUrl: msg.url,
      number,
      joinMethod,
    });

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
