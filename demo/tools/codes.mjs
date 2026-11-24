// ساخت رمزهای ورود نسخه‌ی نمایشی:  npm run demo:codes  (یا با --count=5)
// • فقط «هش» رمزها در demo/.local/codes.json (بیرون از گیت) و در خروجی ساخت (private/codes.php) می‌ماند.
// • خود رمزها فقط یک بار در فایل متنی روی دسکتاپ نوشته می‌شوند — هیچ‌جای دیگری ذخیره نمی‌شوند.
// • اگر codes.json از قبل باشد، کاری نمی‌کند (رمزهای داده‌شده باطل نشوند) مگر با --new.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL = resolve(HERE, '../.local');
const FILE = resolve(LOCAL, 'codes.json');
const args = process.argv.slice(2);
const count = Number((args.find((a) => a.startsWith('--count=')) || '--count=5').split('=')[1]);

if (existsSync(FILE) && !args.includes('--new')) {
  console.log('رمزها از قبل ساخته شده‌اند (demo/.local/codes.json). برای ساخت رمزهای تازه: --new');
  process.exit(0);
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون 0/O و 1/I/L مشابه
const part = (n) => Array.from({ length: n }, () => ALPHA[randomInt(ALPHA.length)]).join('');
const salt = randomBytes(16).toString('hex');
const created = Math.floor(Date.now() / 1000);
const plain = [];
const codes = [];
for (let i = 1; i <= count; i++) {
  const code = `JR-${part(4)}-${part(4)}`;
  plain.push(code);
  codes.push({ id: 'c' + i, label: 'رمز ' + i, hash: createHash('sha256').update(salt + code).digest('hex') });
}
mkdirSync(LOCAL, { recursive: true });
writeFileSync(FILE, JSON.stringify({ salt, created, codes }, null, 1));

const fmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', dateStyle: 'long' });
const until = fmt.format(new Date((created + 60 * 86400) * 1000));
const txt = [
  'رمزهای ورود نسخه‌ی نمایشی سامانه‌ی جریان',
  'ساخته‌شده: ' + fmt.format(new Date(created * 1000)),
  '',
  ...plain.map((c, i) => `رمز ${i + 1}:  ${c}`),
  '',
  '• هر رمز از نخستین ورود موفق، ۱۰ روز اعتبار دارد (روی سرور ثبت می‌شود؛ با مرورگر یا دستگاه دیگر از نو شروع نمی‌شود).',
  '• رمزی که هرگز استفاده نشود، تا ' + until + ' معتبر است و پس از آن باطل می‌شود.',
  '• هر رمز را به یک نفر یا یک مجموعه بدهید تا در گزارش (private/report.txt روی هاست) معلوم باشد کدام رمز کِی استفاده شده.',
  '• این فایل را جایی امن نگه دارید و در گیت‌هاب یا گروه‌های عمومی قرار ندهید.',
  '',
].join('\r\n');
const out = resolve(homedir(), 'Desktop', 'رمزهای نسخه نمایشی جریان.txt');
writeFileSync(out, '﻿' + txt);
console.log(`${count} رمز ساخته شد. فهرست رمزها: ${out}`);
