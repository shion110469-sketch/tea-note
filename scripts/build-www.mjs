// Android アプリに入れるファイルを www/ にまとめる（Web 版のファイルをそのまま使う）
// - プラグイン（課金・通知など）を www/js/native.js に1つにまとめ、index.html で最初に読み込む
// - Service Worker（sw.js）とニュースの取得用ファイルは入れない
// 使い方：npm run sync（www/ を作って Android のプロジェクトに反映する）
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const FILES = ['index.html', 'style.css', 'manifest.webmanifest', 'privacy.html', 'icons', 'js'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of FILES) cpSync(join(root, f), join(out, f), { recursive: true });

await build({
  entryPoints: [join(root, 'scripts', 'native-entry.js')],
  outfile: join(out, 'js', 'native.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  logLevel: 'warning',
});

const html = join(out, 'index.html');
const src = readFileSync(html, 'utf8');
const tag = '<script src="js/platform.js"></script>';
if (!src.includes(tag)) throw new Error('index.html に platform.js の読み込みが見つかりません');
writeFileSync(html, src.replace(tag, `<script src="js/native.js"></script>\n  ${tag}`));

console.log('www/ を作りました');
