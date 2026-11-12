#!/usr/bin/env node
// dsh-plugin-changelog-gen — genera CHANGELOG desde commits git.
// Tools: status, generate, save.

import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'changelog-gen', 'config.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'changelog-gen');
const READ_ONLY = String(process.env.DSH_CHANGELOG_MODE || '').toLowerCase() === 'read-only';
const TYPES = [
  { key: 'feat', title: 'Nuevas funcionalidades' },
  { key: 'fix', title: 'Correcciones' },
  { key: 'perf', title: 'Rendimiento' },
  { key: 'refactor', title: 'Refactor' },
  { key: 'docs', title: 'Documentación' },
  { key: 'test', title: 'Tests' },
  { key: 'build', title: 'Build' },
  { key: 'ci', title: 'CI' },
  { key: 'style', title: 'Estilo' },
  { key: 'chore', title: 'Tareas' },
  { key: 'revert', title: 'Reverts' },
];
const log = (m) => process.stderr.write(`[changelog] ${m}\n`);

function loadConfig() { try { if (existsSync(CONFIG_FILE)) return { allowedPaths: [], ...(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}) }; } catch { /* defaults */ } return { allowedPaths: [] }; }
function allowedRoots() { const configured = loadConfig().allowedPaths; return (Array.isArray(configured) && configured.length ? configured : [process.env.USERPROFILE || process.env.HOME || os.homedir()]).map((item) => path.resolve(item)); }
function isAllowed(target) { const resolved = path.resolve(target); return allowedRoots().some((root) => resolved === root || resolved.startsWith(root + path.sep)); }
function git(root, args) { const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }); if (result.error || result.status !== 0) return null; return result.stdout || ''; }

function collectCommits(rootInner, from, limit) {
  const root = path.resolve(rootInner);
  if (!existsSync(root)) throw new Error(`la ruta no existe: ${root}`);
  if (!isAllowed(root)) throw new Error(`ruta no permitida: ${root} (revisa allowedPaths)`);
  const range = from ? `${from}..HEAD` : 'HEAD';
  const output = git(root, ['log', range, '--pretty=format:%h%x1f%s', '-n', String(limit)]);
  if (output === null) throw new Error('no es un repositorio git o git no está disponible');
  return output.split('\n').filter(Boolean).map((line) => { const [hash, subject] = line.split('\x1f'); return { hash, subject }; });
}
function buildChangelog(commits) {
  const known = new Set(TYPES.map((type) => type.key));
  const grouped = new Map();
  const other = [];
  for (const commit of commits) {
    const match = commit.subject.match(/^([a-zA-Z]+)(\([^)]+\))?!?:\s*(.+)$/);
    const type = match ? match[1].toLowerCase() : null;
    const scope = match?.[2] || '';
    const text = match ? match[3] : commit.subject;
    const line = `- ${scope ? `**${scope.slice(1, -1)}**: ` : ''}${text} (${commit.hash})`;
    if (type && known.has(type)) { if (!grouped.has(type)) grouped.set(type, []); grouped.get(type).push(line); }
    else other.push(line);
  }
  const lines = ['# Changelog', ''];
  for (const type of TYPES) {
    const items = grouped.get(type.key);
    if (!items?.length) continue;
    lines.push(`## ${type.title}`, '', ...items, '');
  }
  if (other.length) lines.push('## Otros', '', ...other, '');
  return lines.join('\n');
}
function uniquePath(target) {
  if (!existsSync(target)) return target;
  const parsed = path.parse(target);
  for (let index = 1; index < 1000; index++) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error('no se pudo generar nombre único');
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }

function buildInstructions() {
  return [
    'Changelog Gen: genera CHANGELOG Markdown desde commits git.',
    '',
    'Herramientas: status, generate, save.',
    '',
    'Reglas:',
    '- generate es solo lectura; save escribe y requiere confirm:true.',
    '- Agrupa commits convencionales por tipo; los que no matchean van a "Otros".',
    '- Reporta el rango real usado; no inventes commits.',
    '- Respeta allowedPaths.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-changelog-gen', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool(
    'status',
    { title: 'Estado', description: 'Rutas permitidas y modo.', inputSchema: z.object({}) },
    async () => textResult([`Rutas permitidas: ${allowedRoots().join(', ')}`, `Modo: ${READ_ONLY ? 'read-only' : 'normal'}`].join('\n')),
  );
  server.registerTool(
    'generate',
    { title: 'Generar changelog', description: 'Devuelve el CHANGELOG Markdown sin escribir.', inputSchema: z.object({ path: z.string().min(2), from: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }) },
    async (args) => {
      const commits = collectCommits(args.path, args.from, args.limit ?? 50);
      if (commits.length === 0) return textResult('Sin commits en el rango indicado.');
      return textResult(buildChangelog(commits));
    },
  );
  server.registerTool(
    'save',
    { title: 'Guardar changelog', description: 'Escribe el changelog a un .md. Requiere confirm:true.', inputSchema: z.object({ path: z.string().min(2), from: z.string().optional(), limit: z.number().int().min(1).max(500).optional(), output: z.string().optional(), confirm: z.boolean().optional() }) },
    async (args) => {
      if (READ_ONLY) throw new Error('modo read-only: save deshabilitado');
      if (args.confirm !== true) throw new Error('save requiere confirm:true y pedido explícito');
      const commits = collectCommits(args.path, args.from, args.limit ?? 50);
      if (commits.length === 0) return textResult('Sin commits en el rango indicado.');
      const target = args.output ? path.resolve(args.output) : path.join(CACHE_DIR, `CHANGELOG-${new Date().toISOString().slice(0, 10)}.md`);
      mkdirSync(path.dirname(target), { recursive: true });
      const file = uniquePath(target);
      writeFileSync(file, buildChangelog(commits), 'utf8');
      return textResult(`Changelog guardado: ${file} (${commits.length} commits)`);
    },
  );
  return server;
}

try { if (!READ_ONLY) mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log(`modo: ${READ_ONLY ? 'read-only' : 'normal'}`);
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
