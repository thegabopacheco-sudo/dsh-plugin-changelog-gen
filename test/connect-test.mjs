// Test end-to-end de changelog-gen con repo git temporal.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
const repo = path.join(tmpDir, 'repo');
mkdirSync(path.join(home, 'changelog-gen'), { recursive: true });
mkdirSync(repo, { recursive: true });
writeFileSync(path.join(home, 'changelog-gen', 'config.json'), JSON.stringify({ allowedPaths: [tmpDir] }), 'utf8');
function git(args) { const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' }); if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`); return result.stdout; }
git(['init', '-b', 'main']);
git(['config', 'user.name', 'test']);
git(['config', 'user.email', 'test@example.com']);
for (const message of ['feat(core): añadir parser', 'fix: corregir bug de login', 'docs: documentar API', 'chore: bump version', 'un commit sin formato']) {
  git(['commit', '--allow-empty', '-m', message]);
}

function makeClient(extraEnv = {}) {
  const entry = process.env.CHANGELOG_SERVER ? path.resolve(process.env.CHANGELOG_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home, ...extraEnv }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'changelog-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
console.log('--- status ---'); console.log(textOf(await client.callTool({ name: 'status', arguments: {} })));
const changelog = textOf(await client.callTool({ name: 'generate', arguments: { path: repo } }));
console.log('--- changelog ---'); console.log(changelog);
console.log('secciones:', changelog.includes('Nuevas funcionalidades') && changelog.includes('Correcciones') && changelog.includes('Documentación'));
console.log('agrupa tipos:', changelog.includes('añadir parser') && changelog.includes('corregir bug de login'));
console.log('otros:', changelog.includes('un commit sin formato'));
console.log('scope:', changelog.includes('**core**'));
const limited = textOf(await client.callTool({ name: 'generate', arguments: { path: repo, limit: 2 } }));
console.log('limit 2:', limited.split('\n').filter((line) => line.startsWith('- ')).length === 2);
const noConfirm = await client.callTool({ name: 'save', arguments: { path: repo } });
console.log('save sin confirm isError:', noConfirm.isError === true);
const saved = await client.callTool({ name: 'save', arguments: { path: repo, confirm: true } });
const savedText = textOf(saved);
console.log('--- save ---'); console.log(savedText);
const file = savedText.replace('Changelog guardado: ', '').split(' (')[0];
console.log('archivo escrito:', existsSync(file) && readFileSync(file, 'utf8').includes('Nuevas funcionalidades'));
const noRepo = await client.callTool({ name: 'generate', arguments: { path: home } });
console.log('no repo isError:', noRepo.isError === true);
await client.close(); try { await transport.close?.(); } catch {}
const { client: roClient, transport: roTransport } = await makeClient({ DSH_CHANGELOG_MODE: 'read-only' });
const roSave = await roClient.callTool({ name: 'save', arguments: { path: repo, confirm: true } });
console.log('read-only save isError:', roSave.isError === true);
await roClient.close(); try { await roTransport.close?.(); } catch {}
console.log('OK');
