import {
	ButtonInteraction,
	EmbedBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	PermissionFlagsBits,
	MessageFlags,
	TextChannel,
} from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import {
	getApplication,
	claimApplication,
	updateApplication,
	claimApplicationQuestionChannel,
	saveHistoryRecord,
} from '../storage';
import {
	buildResolvedEmbed,
	buildDmEmbed,
	buildWelcomeEmbed,
	postDecisionMessage,
	buildProcessedButtonRow,
	buildReviewButtons,
} from '../ui';
import { hasButtonAccess, getGuild } from '../permissions';

const handler: ButtonHandler = {
	customId: /^review:(approve|confirm_approve|reject|question|blacklist):\d+$|^review:cancel$/,

	async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
		if (!hasButtonAccess(interaction, gc, 'staff')) {
			await interaction.reply({ content: 'Недостаточно прав.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (interaction.customId === 'review:cancel') {
			await interaction.deferUpdate();
			await interaction.deleteReply();
			return;
		}

		const guild = getGuild(interaction);
		if (!guild) {
			await interaction.reply({
				content: 'Действие доступно только на сервере.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const [, action, userId] = interaction.customId.split(':');
		const guildId = guild.id;
		const app = await getApplication(guildId, userId);
		if (!app) {
			await interaction.reply({ content: 'Заявка не найдена.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (app.status !== 'pending') {
			await interaction.reply({
				content: `Заявка уже обработана (${app.status}).`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (action === 'approve') {
			const embed = new EmbedBuilder()
				.setTitle('Подтверждение действия')
				.setDescription(`Вы действительно хотите принять анкету пользователя <@${userId}>?`)
				.setColor(0x5865f2);

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`review:confirm_approve:${userId}`)
					.setLabel('Подтвердить')
					.setStyle(ButtonStyle.Success)
					.setEmoji('✅'),
				new ButtonBuilder()
					.setCustomId('review:cancel')
					.setLabel('Отмена')
					.setStyle(ButtonStyle.Danger),
			);

			await interaction.reply({
				embeds: [embed],
				components: [row],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (action === 'reject' || action === 'blacklist') {
			const modal = new ModalBuilder()
				.setCustomId(`review:reason:${action}:${userId}`)
				.setTitle(action === 'reject' ? 'Причина отказа' : 'Причина ЧС');
			const input = new TextInputBuilder()
				.setCustomId('reason')
				.setLabel('Укажите причину')
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true)
				.setMaxLength(1000);
			modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
			await interaction.showModal(modal);
			return;
		}

		if (action === 'question') {
			await interaction.deferUpdate();

			if (app.questionChannelId) {
				const existing = await guild.channels.fetch(app.questionChannelId).catch(() => null);
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
					...[...new Set([...gc.roles.staff, ...gc.roles.ststaff])].map((roleId) => ({
						id: roleId,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory,
						],
					})),
				],
			});

			const claimed = await claimApplicationQuestionChannel(guildId, userId, channel.id, app.questionChannelId ?? null);
			if (!claimed) {
				await channel.delete('Дублирующий канал-вопрос').catch(() => null);
				const fresh = await getApplication(guildId, userId);
				await interaction.followUp({
					content: fresh?.questionChannelId
						? `Канал с вопросом уже существует: <#${fresh.questionChannelId}>.`
						: 'Канал с вопросом уже создаётся.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle('Уточнение по заявке')
				.setDescription(
					`<@${userId}>, у модерации появился вопрос по вашей анкете.\n` +
						'Ответьте здесь. Кнопки ниже — для модерации.',
				)
				.setColor(0x5865f2);

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setLabel('Открыть анкету')
					.setStyle(ButtonStyle.Link)
					.setURL(app.reviewMessageUrl ?? interaction.message.url),
				new ButtonBuilder()
					.setCustomId(`question:close:${channel.id}`)
					.setLabel('Закрыть канал')
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
				components: [buildReviewButtons(userId, channel.url)],
			});
			return;
		}

		if (action === 'confirm_approve') {
			await interaction.deferUpdate();

			const member = await guild.members.fetch(userId).catch(() => null);
			if (!member) {
				await interaction.followUp({
					content: 'Пользователь покинул сервер.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const claimed = await claimApplication(guildId, userId, 'approved', interaction.user.id);
			if (!claimed) {
				const fresh = await getApplication(guildId, userId);
				await interaction.followUp({
					content: `Заявка уже обработана (${fresh?.status ?? 'не найдена'}).`,
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			try {
				await member.roles.add(gc.roles.verified);
			} catch (e) {
				console.error('[review] roles.add failed', e);
				await updateApplication(guildId, userId, { status: 'pending', reviewerId: undefined });
				await interaction.followUp({
					content:
						'❌ Не удалось выдать роль — проверьте, что роль бота выше выдаваемой. Статус заявки возвращён в ожидание.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			await saveHistoryRecord({
				guildId,
				userId,
				type: 'application_approved',
				timestamp: Date.now(),
				executorId: interaction.user.id,
				reviewMessageUrl: app?.reviewMessageUrl ?? interaction.message.url,
			});

			const dmOk = await member
				.send({
					embeds: [buildDmEmbed('✅ Заявка одобрена', 'Добро пожаловать на сервер!', 0x57f287)],
				})
				.then(() => true)
				.catch(() => false);

			const reviewUrl = app.reviewMessageUrl ?? interaction.message.url;
			if (reviewUrl) {
				const parsed = reviewUrl.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
				if (parsed) {
					const [, , channelId, messageId] = parsed;
					const reviewChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
					if (reviewChannel?.isTextBased()) {
						const msg = await (reviewChannel as TextChannel).messages.fetch(messageId).catch(() => null);
						if (msg && msg.embeds[0]) {
							const resolved = buildResolvedEmbed(
								EmbedBuilder.from(msg.embeds[0]),
								'Принято',
								0x57f287,
								interaction.user.id,
							);
							await msg
								.edit({ embeds: [resolved], components: [buildProcessedButtonRow('application')] })
								.catch(() => null);
						}
					}
				}
			}

			await postDecisionMessage(interaction.client, gc.channels.decisions, 'application', {
				label: 'Принято',
				color: 0x57f287,
				reviewerId: interaction.user.id,
				targetUserId: userId,
				reviewMessageUrl: app.reviewMessageUrl ?? interaction.message.url,
				number: app.number,
			});

			if (app.questionChannelId) {
				const questionChannel = await guild.channels.fetch(app.questionChannelId).catch(() => null);
				await questionChannel?.delete().catch((e) => {
					console.error('[review] failed to delete question channel', e);
					return null;
				});
				await updateApplication(guildId, userId, { questionChannelId: undefined });
			}

			if (gc.channels.welcome) {
				try {
					const welcomeChannel = await guild.channels.fetch(gc.channels.welcome);
					if (welcomeChannel?.isTextBased()) {
						const pingMessage = await welcomeChannel.send({
							content: `<@${userId}>`,
							allowedMentions: { users: [userId] },
						});
						await pingMessage.delete().catch(() => null);
						await welcomeChannel.send({
							embeds: [buildWelcomeEmbed(member)],
						});
					}
				} catch (e) {
					console.error('[review] welcome message failed', e);
				}
			}

			const replyContent = dmOk
				? '✅ Анкета принята.'
				: '⚠️ Роль выдана, но отправить ЛС не удалось (закрыты личные сообщения).';

			await interaction.editReply({
				content: replyContent,
				embeds: [],
				components: [],
			});
		}
	},
};

export default handler;

