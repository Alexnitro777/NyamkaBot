import {
	ButtonInteraction,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	PermissionFlagsBits,
	MessageFlags,
} from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import {
	getAppeal,
	claimAppeal,
	updateAppeal,
	claimAppealQuestionChannel,
	getApplication,
	updateApplication,
	saveHistoryRecord,
} from '../storage';
import {
	buildResolvedEmbed,
	buildDmEmbed,
	postDecisionMessage,
	buildProcessedButtonRow,
	buildAppealReviewButtons,
} from '../ui';
import { hasButtonAccess, getGuild } from '../permissions';
import { restoreMemberRoles } from '../roles';

const DENY_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const handler: ButtonHandler = {
	customId: /^appeal:(amnesty|deny|question):\d+$/,

	async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
		if (!hasButtonAccess(interaction, gc, 'ststaff')) {
			await interaction.reply({ content: 'Недостаточно прав.', flags: MessageFlags.Ephemeral });
			return;
		}

		const [, action, userId] = interaction.customId.split(':');
		const guildId = interaction.guildId!;

		const appeal = await getAppeal(guildId, userId);
		if (!appeal) {
			await interaction.reply({ content: 'Апелляция не найдена.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (appeal.status !== 'pending') {
			await interaction.reply({
				content: `Апелляция уже обработана (${appeal.status}).`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (action === 'question') {
			const guild = getGuild(interaction);
			if (!guild) {
				await interaction.reply({
					content: 'Действие доступно только на сервере.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			await interaction.deferUpdate();

			if (appeal.questionChannelId) {
				const existing = await guild.channels.fetch(appeal.questionChannelId).catch(() => null);
				if (existing) {
					await interaction.followUp({
						content: `Канал с вопросом уже существует: <#${existing.id}>.`,
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
			}

			const member = await guild.members.fetch(userId).catch(() => null);
			if (!member) {
				await interaction.followUp({
					content: 'Пользователь покинул сервер.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const channel = await guild.channels.create({
				name: `вопрос-${member.user.username}`.slice(0, 90),
				type: ChannelType.GuildText,
				parent: gc.questionCategoryId,
				permissionOverwrites: [
					{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
					{
						id: userId,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory,
						],
					},
					...gc.roles.ststaff.map((roleId) => ({
						id: roleId,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory,
						],
					})),
				],
			});

			const claimed = await claimAppealQuestionChannel(guildId, userId, channel.id, appeal.questionChannelId ?? null);
			if (!claimed) {
				await channel.delete('Дублирующий канал-вопрос').catch(() => null);
				const fresh = await getAppeal(guildId, userId);
				await interaction.followUp({
					content: fresh?.questionChannelId
						? `Канал с вопросом уже существует: <#${fresh.questionChannelId}>.`
						: 'Канал с вопросом уже создаётся.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle('Уточнение по апелляции')
				.setDescription(
					`<@${userId}>, у модерации появился вопрос по вашей апелляции.\n` +
						'Ответьте здесь. Кнопки ниже — для модерации.',
				)
				.setColor(0x5865f2);

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setLabel('Перейти к апелляции')
					.setStyle(ButtonStyle.Link)
					.setURL(appeal.reviewMessageUrl ?? interaction.message.url),
				new ButtonBuilder()
					.setCustomId(`question:close:${channel.id}`)
					.setLabel('Закрыть вопрос')
					.setStyle(ButtonStyle.Danger)
					.setEmoji('🗑️'),
			);

			const mentionUserIds = [...new Set([userId, interaction.user.id])];
			const pingMsg = await channel.send({
				content: mentionUserIds.map((id) => `<@${id}>`).join(' '),
				allowedMentions: { users: mentionUserIds },
			});
			await channel.send({ embeds: [embed], components: [row] });
			await pingMsg.delete().catch(() => null);

			await interaction.editReply({
				components: [buildAppealReviewButtons(userId, channel.url)],
			});
			return;
		}

		await interaction.deferUpdate();

		const newStatus = action === 'amnesty' ? 'amnestied' : 'denied';
		const claimed = await claimAppeal(guildId, userId, newStatus, interaction.user.id);
		if (!claimed) {
			const fresh = await getAppeal(guildId, userId);
			await interaction.followUp({
				content: `Апелляция уже обработана (${fresh?.status ?? 'не найдена'}).`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await saveHistoryRecord({
			guildId,
			userId,
			type: action === 'amnesty' ? 'appeal_amnestied' : 'appeal_denied',
			timestamp: Date.now(),
			executorId: interaction.user.id,
			reviewMessageUrl: appeal?.reviewMessageUrl ?? interaction.message.url,
		});

		const guild = getGuild(interaction);
		const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;

		let warning: string | undefined;
		if (action === 'amnesty') {
			const removed = await member?.roles
				.remove(gc.roles.blacklist)
				.then(() => true)
				.catch((e) => {
					console.error('[appealReview] roles.remove failed', e);
					return false;
				});
			if (member && !removed) {
				warning = '⚠️ Не удалось снять роль ЧС — проверьте иерархию ролей бота.';
			}
			const application = await getApplication(guildId, userId);
			if (member && application?.removedRoles?.length) {
				const restored = await restoreMemberRoles(member, gc, application.removedRoles);
				if (!restored) {
					warning = warning
						? `${warning}\n⚠️ Не удалось вернуть часть ролей.`
						: '⚠️ Не удалось вернуть часть ролей — проверьте иерархию ролей бота.';
				}
			}
			if (application) {
				await updateApplication(guildId, userId, { status: 'amnestied', removedRoles: [] });
			}
			await member
				?.send({
					embeds: [
						buildDmEmbed(
							'✅ Амнистия принята',
							'С вас снят чёрный список.',
							0x57f287,
						),
					],
				})
				.catch(() => null);
		} else {
			const ts = Math.floor((Date.now() + DENY_COOLDOWN_MS) / 1000);
			await member
				?.send({
					embeds: [
						buildDmEmbed(
							'❌ В амнистии отказано',
							`Ваша апелляция отклонена. ЧС сохраняется.\n\nВы сможете подать новую апелляцию <t:${ts}:R> (<t:${ts}:f>).`,
							0xed4245,
						),
					],
				})
				.catch(() => null);
		}

		const resolved = buildResolvedEmbed(
			EmbedBuilder.from(interaction.message.embeds[0]),
			action === 'amnesty' ? 'Амнистия принята' : 'В амнистии отказано',
			action === 'amnesty' ? 0x57f287 : 0xed4245,
			interaction.user.id,
		);
		await interaction.editReply({
			embeds: [resolved],
			components: [buildProcessedButtonRow('appeal')],
		});

		await postDecisionMessage(interaction.client, gc.channels.decisions, 'appeal', {
			label: action === 'amnesty' ? 'Амнистия принята' : 'В амнистии отказано',
			color: action === 'amnesty' ? 0x57f287 : 0xed4245,
			reviewerId: interaction.user.id,
			targetUserId: userId,
			reviewMessageUrl: appeal.reviewMessageUrl ?? interaction.message.url,
			number: appeal.number,
		});

		if (appeal.questionChannelId && guild) {
			const questionChannel = await guild.channels.fetch(appeal.questionChannelId).catch(() => null);
			await questionChannel?.delete().catch((e) => {
				console.error('[appealReview] failed to delete question channel', e);
				return null;
			});
			await updateAppeal(guildId, userId, { questionChannelId: undefined });
		}

		if (warning) {
			await interaction.followUp({ content: warning, flags: MessageFlags.Ephemeral });
		}
	},
};

export default handler;
