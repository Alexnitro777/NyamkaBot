import {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	User,
	GuildMember,
	Client,
	TextChannel,
} from 'discord.js';
import { Application, HistoryRecord, HistoryEventType } from './types';
import { verifyQuestions } from './questions';

export function buildApplicationEmbed(
	user: User,
	answers: Record<string, string>,
	number?: number,
	joinMethod?: string,
	joinedTimestamp?: number | null,
): EmbedBuilder {
	const createdTs = Math.floor(user.createdTimestamp / 1000);

	const embed = new EmbedBuilder()
		.setTitle(number ? `Заявка на верификацию №\`${number}\`` : 'Заявка на верификацию')
		.setThumbnail(user.displayAvatarURL())
		.setColor(0xfee75c)
		.setFooter({ text: `ID: ${user.id}` })
		.setTimestamp();

	embed.addFields(
		{ name: 'Участник', value: `<@${user.id}>`, inline: false },
		{ name: 'Дата создания аккаунта', value: `<t:${createdTs}:R>`, inline: true },
		{
			name: 'Дата захода',
			value: joinedTimestamp ? `<t:${Math.floor(joinedTimestamp / 1000)}:R>` : '—',
			inline: true,
		},
		{
			name: 'Способ вступления',
			value: joinMethod?.trim() || 'Неизвестно',
			inline: true,
		},
	);

	verifyQuestions.slice(0, 5).forEach((q) => {
		const rawValue = (answers[q.id] ?? '').trim() || '—';
		const value =
			rawValue === '—'
				? '—'
				: `\`${rawValue.length > 1000 ? rawValue.slice(0, 1000) + '...' : rawValue}\``;

		embed.addFields({ name: q.label, value, inline: false });
	});
	return embed;
}

export function buildAppealEmbed(
	user: User,
	text: string,
	blacklistReason?: string,
	number?: number,
): EmbedBuilder {
	const createdTs = Math.floor(user.createdTimestamp / 1000);

	const embed = new EmbedBuilder()
		.setTitle(number ? `Апелляция №\`${number}\`` : 'Апелляция')
		.setThumbnail(user.displayAvatarURL())
		.setColor(0xeb459e)
		.setFooter({ text: `ID: ${user.id}` })
		.setTimestamp();

	embed.addFields(
		{ name: 'Участник', value: `<@${user.id}>`, inline: false },
		{ name: 'Дата создания аккаунта', value: `<t:${createdTs}:R>`, inline: false },
	);

	const reason = (blacklistReason ?? '').trim();
	if (reason) {
		const quoted = reason
			.split('\n')
			.map((line) => `> ${line}`)
			.join('\n');
		const value = quoted.length > 1000 ? quoted.slice(0, 1000) + '…' : quoted;
		embed.addFields({ name: 'Причина ЧС', value });
	}

	const rawValue = text.trim() || '—';
	if (rawValue === '—') {
		embed.addFields({ name: 'Текст апелляции', value: '—' });
	} else {
		const truncated = rawValue.length > 1000 ? rawValue.slice(0, 1000) + '...' : rawValue;
		embed.addFields({ name: 'Текст апелляции', value: `\`${truncated}\`` });
	}
	return embed;
}

const PAGE_SIZE = 10;

interface PendingListItem {
	userId: string;
	username: string;
	submittedAt: number;
	reviewMessageUrl?: string;
	number?: number;
	questionChannelId?: string;
}

export function buildPendingListView(
	items: PendingListItem[],
	requestedPage: number,
	opts: { title: string; color: number; namespace: string },
): { embed: EmbedBuilder; row?: ActionRowBuilder<ButtonBuilder> } {
	const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
	const page = Math.min(Math.max(0, requestedPage), pages - 1);
	const start = page * PAGE_SIZE;
	const slice = items.slice(start, start + PAGE_SIZE);

	const lines = slice.map((item, i) => {
		const idx = start + i;
		const ts = Math.floor(item.submittedAt / 1000);
		const link = item.reviewMessageUrl ? ` — [перейти](${item.reviewMessageUrl})` : '';
		const num = item.number ? `№\`${item.number}\`` : `\`${idx + 1}.\``;
		const question = item.questionChannelId
			? ` • <#${item.questionChannelId}>`
			: '';
		return `**${num}** <@${item.userId}> (${item.username}) — <t:${ts}:R>${link}${question}`;
	});

	const embed = new EmbedBuilder()
		.setTitle(`${opts.title} — ${items.length}`)
		.setColor(opts.color)
		.setDescription(lines.join('\n').slice(0, 4096))
		.setFooter({ text: `Страница ${page + 1}/${pages}` });

	let row: ActionRowBuilder<ButtonBuilder> | undefined;
	if (pages > 1) {
		row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`${opts.namespace}:page:${page - 1}`)
				.setLabel('◀ Назад')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page <= 0),
			new ButtonBuilder()
				.setCustomId(`${opts.namespace}:pageinfo`)
				.setLabel(`${page + 1} / ${pages}`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(true),
			new ButtonBuilder()
				.setCustomId(`${opts.namespace}:page:${page + 1}`)
				.setLabel('Вперёд ▶')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page >= pages - 1),
		);
	}

	return { embed, row };
}

export function buildReviewButtons(
	userId: string,
	questionChannelUrl?: string,
): ActionRowBuilder<ButtonBuilder> {
	const questionButton = questionChannelUrl
		? new ButtonBuilder()
				.setLabel('Перейти к вопросу')
				.setStyle(ButtonStyle.Link)
				.setURL(questionChannelUrl)
				.setEmoji('❓')
		: new ButtonBuilder()
				.setCustomId(`review:question:${userId}`)
				.setLabel('Задать вопрос')
				.setStyle(ButtonStyle.Primary)
				.setEmoji('❓');

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`review:approve:${userId}`)
			.setLabel('Принять')
			.setStyle(ButtonStyle.Success)
			.setEmoji('✅'),
		new ButtonBuilder()
			.setCustomId(`review:reject:${userId}`)
			.setLabel('Отклонить')
			.setStyle(ButtonStyle.Danger)
			.setEmoji('❌'),
		questionButton,
		new ButtonBuilder()
			.setCustomId(`review:blacklist:${userId}`)
			.setLabel('ЧС')
			.setStyle(ButtonStyle.Secondary)
			.setEmoji('🚫'),
	);
}

export function buildAppealReviewButtons(
	userId: string,
	questionChannelUrl?: string,
): ActionRowBuilder<ButtonBuilder> {
	const questionButton = questionChannelUrl
		? new ButtonBuilder()
				.setLabel('Перейти к вопросу')
				.setStyle(ButtonStyle.Link)
				.setURL(questionChannelUrl)
				.setEmoji('❓')
		: new ButtonBuilder()
				.setCustomId(`appeal:question:${userId}`)
				.setLabel('Задать вопрос')
				.setStyle(ButtonStyle.Primary)
				.setEmoji('❓');

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`appeal:amnesty:${userId}`)
			.setLabel('Принять амнистию')
			.setStyle(ButtonStyle.Success)
			.setEmoji('✅'),
		new ButtonBuilder()
			.setCustomId(`appeal:deny:${userId}`)
			.setLabel('Отказать в амнистии')
			.setStyle(ButtonStyle.Danger)
			.setEmoji('❌'),
		questionButton,
	);
}

export function buildResolvedEmbed(
	original: EmbedBuilder,
	label: string,
	color: number,
	reviewerId: string,
	reason?: { title: string; text: string },
): EmbedBuilder {
	const embed = EmbedBuilder.from(original.data).setColor(color).addFields({
		name: label,
		value: `<@${reviewerId}>`,
		inline: Boolean(reason),
	});
	if (reason) {
		const text = reason.text.trim();
		const value = text ? `\`${text.length > 1000 ? text.slice(0, 1000) + '...' : text}\`` : '—';
		embed.addFields({ name: reason.title, value, inline: true });
	}
	return embed;
}

export function buildDmEmbed(title: string, description: string, color: number): EmbedBuilder {
	return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

export function buildWelcomeEmbed(member: GuildMember): EmbedBuilder {
	const { guild, user } = member;

	return new EmbedBuilder()
		.setTitle('🎉  Добро пожаловать!')
		.setDescription(
			`Добро пожаловать, <@${user.id}>, на **${guild.name}**! Мы рады, что вы присоединились к нам для общения.`,
		)
		.setThumbnail(user.displayAvatarURL())
		.setColor(0x57f287)
		.setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
		.setTimestamp();
}

export type ReviewAction = 'approve' | 'reject' | 'question' | 'blacklist';

export type DecisionKind = 'application' | 'appeal';

export function buildProcessedButtonRow(kind: DecisionKind): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`decision:processed:${kind}`)
			.setLabel(kind === 'appeal' ? 'Апелляция обработана' : 'Анкета обработана')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}

export function buildLeftServerButtonRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId('decision:left')
			.setLabel('Покинул сервер')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}

export function buildAutoClosedButtonRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId('decision:expired')
			.setLabel('Закрыто автоматически')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}

export function buildDecisionLinkRow(
	kind: DecisionKind,
	reviewMessageUrl?: string,
): ActionRowBuilder<ButtonBuilder> | undefined {
	if (!reviewMessageUrl) return undefined;
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setLabel(kind === 'appeal' ? 'Открыть апелляцию' : 'Открыть анкету')
			.setStyle(ButtonStyle.Link)
			.setURL(reviewMessageUrl),
	);
}

export function buildDecisionEmbed(
	kind: DecisionKind,
	label: string,
	color: number,
	reviewerId: string,
	targetUserId: string,
	number?: number,
	reason?: { title: string; text: string },
	titleOverride?: string,
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle(
			titleOverride
				? number
					? `${titleOverride} №\`${number}\``
					: titleOverride
				: kind === 'appeal'
					? number
						? `Решение по апелляции №\`${number}\``
						: 'Решение по апелляции'
					: number
						? `Решение по заявке №\`${number}\``
						: 'Решение по заявке',
		)
		.setColor(color)
		.addFields({ name: 'Участник', value: `<@${targetUserId}>`, inline: true });

	if (reason) {
		embed.addFields({
			name: reason.title,
			value: reason.text ? `\`${reason.text}\`` : '—',
			inline: true,
		});
	} else {
		embed.addFields({ name: 'Решение', value: label, inline: true });
	}

	embed
		.addFields({ name: 'Модератор', value: `<@${reviewerId}>`, inline: false })
		.setFooter({ text: `ID: ${targetUserId}` })
		.setTimestamp();

	return embed;
}

export async function postDecisionMessage(
	client: Client,
	channelId: string | undefined,
	kind: DecisionKind,
	opts: {
		label: string;
		color: number;
		reviewerId: string;
		targetUserId: string;
		reviewMessageUrl?: string;
		reason?: { title: string; text: string };
		number?: number;
		title?: string;
	},
): Promise<void> {
	if (!channelId) return;
	try {
		const channel = await client.channels.fetch(channelId).catch(() => null);
		if (!channel || !channel.isTextBased()) {
			console.error('[decision] decisions channel unavailable:', channelId);
			return;
		}
		const embed = buildDecisionEmbed(
			kind,
			opts.label,
			opts.color,
			opts.reviewerId,
			opts.targetUserId,
			opts.number,
			opts.reason,
			opts.title,
		);
		const linkRow = buildDecisionLinkRow(kind, opts.reviewMessageUrl);
		await (channel as TextChannel).send({
			embeds: [embed],
			components: linkRow ? [linkRow] : [],
		});
	} catch (e) {
		console.error('[decision] failed to post decision message', e);
	}
}

const HISTORY_TITLE_MAP: Record<HistoryEventType, string> = {
	application_submitted: '📝 **Подача заявки на верификацию**',
	application_approved: '🟢 **Верификация одобрена**',
	application_rejected: '🔴 **Анкета отклонена**',
	application_blacklisted: '🚫 **Анкета отклонена (выдан ЧС)**',
	application_expired: '⏱️ **Срок ожидания анкеты истёк**',
	application_left: '🚪 **Участник покинул сервер (верификация)**',
	appeal_submitted: '📜 **Подача апелляции**',
	appeal_amnestied: '🕊️ **Апелляция принята (Амнистия)**',
	appeal_denied: '❌ **В апелляции отказано**',
	appeal_left: '🚪 **Участник покинул сервер (апелляция)**',
	chsp_added: '⛔ **Занесение в ЧС (ЧСП)**',
	chsp_removed: '🔓 **Снятие с ЧС (ЧСП)**',
};

const HISTORY_PAGE_SIZE = 5;

export function buildHistoryView(
	items: HistoryRecord[],
	targetUser: { id: string; username?: string; tag?: string },
	requestedPage: number,
): { embed: EmbedBuilder; row?: ActionRowBuilder<ButtonBuilder> } {
	const pages = Math.max(1, Math.ceil(items.length / HISTORY_PAGE_SIZE));
	const page = Math.min(Math.max(0, requestedPage), pages - 1);
	const start = page * HISTORY_PAGE_SIZE;
	const slice = items.slice(start, start + HISTORY_PAGE_SIZE);

	const displayName = targetUser.tag ?? targetUser.username ?? targetUser.id;

	const embed = new EmbedBuilder()
		.setTitle(`📜 История действий — ${displayName}`)
		.setColor(0x5865f2)
		.setFooter({ text: `ID: ${targetUser.id} • Страница ${page + 1}/${pages}` })
		.setTimestamp();

	if (items.length === 0) {
		embed.setDescription(`У участника <@${targetUser.id}> нет сохранённых действий.`);
		return { embed };
	}

	embed.setDescription(`Участник: <@${targetUser.id}>\nВсего записей: **${items.length}** (сверху самые новые)\n\u200b`);

	slice.forEach((item, idx) => {
		const itemNum = items.length - (start + idx);
		const ts = Math.floor(item.timestamp / 1000);
		const title = HISTORY_TITLE_MAP[item.type] ?? `📌 **${item.type}**`;

		let fieldBody = `<t:${ts}:f> (<t:${ts}:R>)`;
		if (item.reviewMessageUrl) {
			const label = item.type.startsWith('appeal') ? 'Перейти к апелляции' : 'Перейти к анкете';
			fieldBody += ` • [${label}](${item.reviewMessageUrl})`;
		}
		if (item.executorId) {
			fieldBody += `\n👤 **Модератор:** <@${item.executorId}>`;
		}
		if (item.reason) {
			const truncated = item.reason.length > 300 ? item.reason.slice(0, 300) + '...' : item.reason;
			fieldBody += `\n💬 **Причина:** \`${truncated}\``;
		}
		if (item.details) {
			fieldBody += `\nℹ️ ${item.details}`;
		}

		embed.addFields({
			name: `#${itemNum} — ${title}`,
			value: fieldBody,
			inline: false,
		});
	});

	let row: ActionRowBuilder<ButtonBuilder> | undefined;
	if (pages > 1) {
		row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`history:page:${targetUser.id}:${page - 1}`)
				.setLabel('◀ Назад')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page <= 0),
			new ButtonBuilder()
				.setCustomId(`history:pageinfo:${targetUser.id}`)
				.setLabel(`${page + 1} / ${pages}`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(true),
			new ButtonBuilder()
				.setCustomId(`history:page:${targetUser.id}:${page + 1}`)
				.setLabel('Вперёд ▶')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page >= pages - 1),
		);
	}

	return { embed, row };
}
