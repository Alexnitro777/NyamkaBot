import { promises as fs } from 'fs';
import path from 'path';
import type { EmbedDefinition } from './types';

let cachedEmbeds: Map<string, EmbedDefinition> | null = null;

export async function loadEmbeds(): Promise<Map<string, EmbedDefinition>> {
  if (cachedEmbeds) return cachedEmbeds;
  const map = new Map<string, EmbedDefinition>();
  const dir = __dirname;
  const entries = await fs.readdir(dir);

  for (const entry of entries) {
    if (
      entry === 'types.ts' ||
      entry === 'types.js' ||
      entry === 'registry.ts' ||
      entry === 'registry.js' ||
      entry.endsWith('.d.ts')
    ) {
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.js')) {
      continue;
    }

    const mod = await import(path.join(dir, entry));
    const def: EmbedDefinition = mod.default ?? mod.embed;
    if (!def || !def.name) continue;
    if (map.has(def.name)) {
      throw new Error(`Duplicate embed name: ${def.name}`);
    }
    map.set(def.name, def);
  }

  cachedEmbeds = map;
  return map;
}

export async function getEmbed(name: string): Promise<EmbedDefinition | undefined> {
  const map = await loadEmbeds();
  return map.get(name);
}

export async function getEmbedNames(): Promise<EmbedDefinition[]> {
  const map = await loadEmbeds();
  return Array.from(map.values());
}
