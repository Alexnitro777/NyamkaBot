import { ModalSubmitInteraction, TextChannel, MessageFlags } from 'discord.js';
import { ModalHandler, GuildConfig } from '../types';
import { appealQuestions } from '../questions';
import { getApplication, getAppeal, reserveAppeal, nextAppealNumber, saveHistoryRecord } from '../storage';
import { buildAppealEmbed, buildAppealReviewButtons } from '../ui';

const DENY_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const handler: ModalHandler = {
	customId: 'appeal:submit',

	async execute(interaction: ModalSubmitInteraction, gc: GuildConfig): Promise<void> {
		const text = appealQuestions
			.slice(0, 5)
			.map((q) => {
				try {
					return interaction.fields.getTextInputValue(q.id);
				} catch {
					return '';
				}
			})
			.map((value) => value.trim())
			.filter((value) => value.length > 0)
			.join('\n\n');

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const guildId = interaction.guildId!;
		const member = await interaction.guild?.members
			.fetch(interaction.user.id)
			.catch(() => null);
		if (!member) {
			await interaction.editReply({
				content: 'Апелляция доступна только участникам в чёрном списке.',
			});
			return;
		}
		const hasBlacklist = member.roles.cache.has(gc.roles.blacklist);
		const hasSoftBlacklist = gc.roles.blacklistSoft?.some((id) => member.roles.cache.has(id)) ?? false;
		if (!hasBlacklist && !hasSoftBlacklist) {
			await interaction.editReply({
				content: 'Апелляция доступна только участникам в чёрном списке.',
			});
			return;
		}

		const existingAppeal = await getAppeal(guildId, interaction.user.id);
		if (existingAppeal?.status === 'pending') {
			await interaction.editReply({ content: 'Ваша апелляция уже на рассмотрении.' });
			return;
		}
		if (
			existingAppeal?.status === 'denied' &&
			existingAppeal.resolvedAt &&
			Date.now() < existingAppeal.resolvedAt + DENY_COOLDOWN_MS
		) {
			const ts = Math.floor((existingAppeal.resolvedAt + DENY_COOLDOWN_MS) / 1000);
			await interaction.editReply({
				content: `⛔ Вашу прошлую апелляцию отклонили. Новую можно подать <t:${ts}:R> (<t:${ts}:f>).`,
			});
			return;
		}

		const application = await getApplication(guildId, interaction.user.id);
		const blacklistReason =
			application?.status === 'blacklisted' ? application.reason : undefined;

		const channel = await interaction.client.channels
			.fetch(gc.channels.appealReview)
			.catch(() => null);
		if (!channel || !channel.isTextBased()) {
			console.error('[appealSubmit] appeal review channel unavailable:', gc.channels.appealReview);
			await interaction.editReply({
				content: '❌ Не удалось отправить апелляцию: канал модерации недоступен. Сообщите администрации.',
			});
			return;
		}

		const number = await nextAppealNumber(guildId);
		const embed = buildAppealEmbed(interaction.user, text, blacklistReason, number);

		const row = buildAppealReviewButtons(interaction.user.id);

		const msg = await (channel as TextChannel)
			.send({ embeds: [embed], components: [row] })
			.catch((e) => {
				console.error('[appealSubmit] failed to post appeal message:', e);
				return null;
			});

		if (!msg) {
			await interaction.editReply({
				content: '❌ Не удалось отправить апелляцию модерации. Попробуйте позже или сообщите администрации.',
			});
			return;
		}

		const now = Date.now();
		const reserved = await reserveAppeal({
			userId: interaction.user.id,
			guildId,
			username: interaction.user.tag,
			text,
			submittedAt: now,
			status: 'pending',
			reviewMessageUrl: msg.url,
			blacklistReason,
			number,
		});

		if (!reserved) {
			await msg.delete().catch(() => null);
			await interaction.editReply({ content: 'Ваша апелляция уже на рассмотрении.' });
			return;
		}

		await saveHistoryRecord({
			guildId,
			userId: interaction.user.id,
			type: 'appeal_submitted',
			timestamp: now,
		});

		await interaction.editReply({
			content: '✅ Апелляция отправлена. Ожидайте решения модерации.',
		});
	},
};

export default handler;
