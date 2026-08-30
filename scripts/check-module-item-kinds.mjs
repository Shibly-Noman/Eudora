#!/usr/bin/env node
/**
 * Fails when either client's `ModuleItemKind` union has drifted from the
 * `ModuleItemKind` enum in the Prisma schema.
 *
 * Both unions are hand-maintained, and both have drifted before with the same
 * result each time: the API starts returning a kind the client has never heard
 * of, TypeScript stays happy because it is checking against the stale union,
 * and the item screen does something wrong at runtime.
 *
 * It happened to mobile with HOMEWORK and LIVE_CLASS, which fell through to
 * AssessmentItemView and rendered as a broken assessment for weeks. The fix
 * then was an exhaustive switch with no default — which is a good fix for a
 * missing *case*, but cannot see a missing *union member*. So it happened
 * again with STORY, and this time the screen returned undefined and crashed.
 *
 * This is the check that catches the class rather than the instance.
 *
 *   node scripts/check-module-item-kinds.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCHEMA = join(ROOT, 'services/api-service/prisma/schema.prisma');
const CONSUMERS = [
  ['client', join(ROOT, 'client/src/features/catalog/catalogApi.ts')],
  ['mobile', join(ROOT, 'mobile/src/core/contracts/index.ts')],
];

/** The enum body, with /// doc comments and // comments stripped. */
function parsePrismaEnum(source) {
  const match = source.match(/enum ModuleItemKind \{([^}]*)\}/);
  if (!match) throw new Error('ModuleItemKind enum not found in schema.prisma');
  return new Set(
    match[1]
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z_]+$/.test(line)),
  );
}

/**
 * The union members, from the declaration up to the terminating semicolon.
 *
 * Comments are stripped first, and that is not incidental: both unions
 * document members inline, and one of those comments contains a semicolon
 * ("a live session; the meeting itself..."), which ended the match four
 * members early and reported three false positives on the first run.
 */
function parseTsUnion(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const match = withoutComments.match(/export type ModuleItemKind =([\s\S]*?);/);
  if (!match) throw new Error('ModuleItemKind union not found');
  const members = [...match[1].matchAll(/["']([A-Z_]+)["']/g)].map((m) => m[1]);
  if (members.length === 0) throw new Error('ModuleItemKind union parsed as empty');
  return new Set(members);
}

const schema = parsePrismaEnum(await readFile(SCHEMA, 'utf8'));
let failed = false;

for (const [name, path] of CONSUMERS) {
  const union = parseTsUnion(await readFile(path, 'utf8'));
  const missing = [...schema].filter((k) => !union.has(k));
  const extra = [...union].filter((k) => !schema.has(k));

  for (const k of missing) {
    console.error(`${name}: missing ${k} — the API can return it and this union cannot describe it`);
    failed = true;
  }
  for (const k of extra) {
    console.error(`${name}: has ${k}, which the schema no longer defines`);
    failed = true;
  }
  if (missing.length === 0 && extra.length === 0) {
    console.log(`${name}: ${union.size} kinds, in sync`);
  }
}

if (failed) {
  console.error(
    '\nAdd the missing member to the union. The exhaustive switch over it will\n' +
      'then fail to compile until the screen handles the new kind, which is the\n' +
      'point — a kind with no case renders nothing at all.',
  );
  process.exitCode = 1;
}
