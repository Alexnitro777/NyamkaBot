import { Client, GuildMember, PartialGuildMember } from 'discord.js';
import { getApplication } from './storage';
import { getGuildConfig } from './guildConfig';

async function enforceBlacklistOnJoin(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  if (member.user.bot) return;

  const full = member.partial ? await member.fetch().catch(() => null) : member;
  if (!full) return;

  const gc = await getGuildConfig(full.guild.id);
  if (!gc) return;

  const app = await getApplication(full.guild.id, full.id);
  if (!app || app.status !== 'blacklisted') return;

  if (full.roles.cache.has(gc.roles.blacklist)) return;

  try {
    await full.roles.add(gc.roles.blacklist, 'Возврат в ЧС при перезаходе');
    console.log(`[blacklistEnforce] возвращена роль ЧС ${full.user.tag} (${full.id})`);
  } catch (e) {
    console.error(`[blacklistEnforce] не удалось вернуть роль ЧС для ${full.id}:`, e);
  }
}

export function registerBlacklistEnforcement(client: Client): void {
  client.on('guildMemberAdd', (member) => {
    void enforceBlacklistOnJoin(member).catch((e) =>
      console.error('[blacklistEnforce] handler failed', e),
    );
  });
}
