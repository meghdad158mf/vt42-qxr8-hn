// دریافت آخرین عکس فوری داده‌ی واقعی (ورک‌فلوی «Demo snapshot») و باز کردن رمزش:
//   npm run demo:fetch   [-- --run=<شناسه‌ی اجرا>]
// → demo/build/real/ (data.json + media/r + sb). کلید خصوصی: demo/.local/snapshot-private.pem
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = resolve(DEMO, '.local/snapshot-private.pem');
const TMP = resolve(DEMO, '.local/snapshot-dl');
const REAL = resolve(DEMO, 'build/real');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts }).toString().trim();

if (!existsSync(KEY)) { console.error('کلید خصوصی پیدا نشد: demo/.local/snapshot-private.pem'); process.exit(1); }
let run = (process.argv.find((a) => a.startsWith('--run=')) || '').slice(6);
if (!run) {
  const list = JSON.parse(sh('gh', ['run', 'list', '--workflow', 'demo-snapshot.yml', '--status', 'success', '--limit', '1', '--json', 'databaseId,createdAt']));
  if (!list.length) { console.error('هنوز اجرای موفقی از «Demo snapshot» نیست.'); process.exit(1); }
  run = String(list[0].databaseId);
  console.log('اجرای', run, 'از', list[0].createdAt);
}
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
sh('gh', ['run', 'download', run, '-n', 'demo-snapshot', '-D', TMP]);
sh('openssl', ['pkeyutl', '-decrypt', '-inkey', KEY, '-pkeyopt', 'rsa_padding_mode:oaep', '-in', resolve(TMP, 'key.enc'), '-out', resolve(TMP, 'key.txt')]);
sh('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-in', resolve(TMP, 'snapshot.tgz.enc'), '-out', resolve(TMP, 'snapshot.tgz'), '-pass', 'file:' + resolve(TMP, 'key.txt')]);
rmSync(REAL, { recursive: true, force: true });
mkdirSync(REAL, { recursive: true });
// tar گنو «C:» را نشانی رایانه‌ی دیگر می‌فهمد → از داخل پوشه و با مسیر نسبی
sh('tar', ['xzf', '../../.local/snapshot-dl/snapshot.tgz'], { cwd: REAL });
rmSync(TMP, { recursive: true, force: true });
console.log('داده‌ی واقعی آماده است: demo/build/real');
