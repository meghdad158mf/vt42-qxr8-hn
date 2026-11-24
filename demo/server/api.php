<?php
// نسخه‌ی نمایشی سامانه‌ی جریان — بررسی رمز ورود و فرستادن داده‌ی نمایشی.
//   POST api.php?a=login   بدنه: {"code":"..."}  → {"token":"..."} | 401 invalid | 403 expired | 429 قفل موقت
//   GET  api.php?a=data    سربرگ X-Demo-Token     → داده‌ی نمایشی (فقط برای رمز معتبر)
// اعتبار هر رمز: ۱۰ روز از نخستین ورود موفق با همان رمز (روی سرور ثبت می‌شود، پس با مرورگر یا
// دستگاه دیگر از نو شروع نمی‌شود). رمزی که هرگز استفاده نشود ۶۰ روز پس از ساخت نسخه باطل می‌شود.
// گزارش استفاده: private/report.txt (از File Manager هاست دیده می‌شود).
//
// فایل‌های پوشه‌ی private با یک سطر PHP «خروج با ۴۰۴» شروع می‌شوند تا حتی بدون .htaccess مستقیم خوانده نشوند.
// ⚠️ در این فایل هیچ‌جا (حتی در توضیح //) نشانه‌ی پایان PHP یعنی «؟>» لاتین ننویسید — PHP آنجا از کد بیرون می‌آید
// و بقیه‌ی فایل را به‌جای اجرا، به‌صورت متن نشان می‌دهد.

const VALID_DAYS = 10;
const UNUSED_DAYS = 60;
const MAX_FAILS = 5;          // رمز اشتباه از یک اتصال
const FAIL_WINDOW = 900;      // در ۱۵ دقیقه
const GUARD = "<?php http_response_code(404); exit; ?" . ">\n";

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex');

$PRIV = __DIR__ . '/private';

function out($code, $body) {
  http_response_code($code);
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

function read_private($name) {
  $f = $GLOBALS['PRIV'] . '/' . $name;
  if (!is_file($f)) return null;
  $s = file_get_contents($f);
  if (strpos($s, '<?php') === 0) $s = substr($s, strpos($s, "\n") + 1);
  return $s;
}

// وضعیت (نخستین ورود هر رمز، نشست‌ها، تلاش‌های ناموفق) با قفل فایل
function with_state($fn) {
  $f = $GLOBALS['PRIV'] . '/state.php';
  $h = fopen($f, 'c+');
  if (!$h) out(500, array('error' => 'storage'));
  flock($h, LOCK_EX);
  $raw = stream_get_contents($h);
  if (strpos($raw, '<?php') === 0) $raw = substr($raw, strpos($raw, "\n") + 1);
  $st = json_decode($raw, true);
  if (!is_array($st)) $st = array('codes' => array(), 'sessions' => array(), 'fails' => array());
  $res = $fn($st);
  ftruncate($h, 0);
  rewind($h);
  fwrite($h, GUARD . json_encode($st, JSON_UNESCAPED_UNICODE));
  fflush($h);
  flock($h, LOCK_UN);
  fclose($h);
  return $res;
}

function config() {
  $c = json_decode((string) read_private('codes.php'), true);
  if (!is_array($c) || empty($c['codes'])) out(500, array('error' => 'config'));
  return $c;
}

function norm_code($s) {
  $s = strtr((string) $s, array('۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9',
    '٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4','٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9', '‐'=>'-', '–'=>'-', '—'=>'-'));
  return strtoupper(preg_replace('/\s+/', '', $s));
}

// پایان اعتبار یک رمز (یونیکس)، یا null اگر هنوز استفاده نشده
function expires_at($cfg, $row) {
  if (!empty($row['first'])) return $row['first'] + VALID_DAYS * 86400;
  return null;
}
function is_expired($cfg, $row, $now) {
  if (!empty($row['first'])) return $now > $row['first'] + VALID_DAYS * 86400;
  return $now > $cfg['created'] + UNUSED_DAYS * 86400;
}

function client_ip() { return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '?'; }

function fa_date($ts) {
  $d = new DateTime('@' . $ts);
  $d->setTimezone(new DateTimeZone('Asia/Tehran'));
  return $d->format('Y-m-d H:i');
}

function write_report($cfg, $st, $now) {
  $lines = array('گزارش استفاده از رمزهای نسخه‌ی نمایشی جریان', 'به‌روزرسانی: ' . fa_date($now) . ' (به وقت تهران، تاریخ میلادی)', '');
  foreach ($cfg['codes'] as $c) {
    $row = isset($st['codes'][$c['id']]) ? $st['codes'][$c['id']] : array();
    $l = $c['label'] . ': ';
    if (empty($row['first'])) {
      $l .= is_expired($cfg, $row, $now) ? 'هرگز استفاده نشد — باطل شده' : 'هنوز استفاده نشده';
    } else {
      $left = ($row['first'] + VALID_DAYS * 86400 - $now) / 86400;
      $l .= 'نخستین ورود ' . fa_date($row['first']) . '، آخرین ورود ' . fa_date($row['last']) . '، ' . $row['uses'] . ' بار ورود، '
        . ($left > 0 ? 'اعتبار تا ' . fa_date($row['first'] + VALID_DAYS * 86400) . ' (' . ceil($left) . ' روز مانده)' : 'منقضی شده');
    }
    $lines[] = $l;
  }
  @file_put_contents($GLOBALS['PRIV'] . '/report.txt', implode("\n", $lines) . "\n");
}

$a = isset($_GET['a']) ? $_GET['a'] : '';
$now = time();

if ($a === 'login') {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, array('error' => 'method'));
  $body = json_decode(file_get_contents('php://input'), true);
  $code = norm_code(isset($body['code']) ? $body['code'] : '');
  $cfg = config();
  $ip = client_ip();
  $res = with_state(function (&$st) use ($cfg, $code, $ip, $now) {
    // قفل موقت پس از چند رمز اشتباه
    $fails = isset($st['fails'][$ip]) ? array_values(array_filter($st['fails'][$ip], function ($t) use ($now) { return $t > $now - FAIL_WINDOW; })) : array();
    if (count($fails) >= MAX_FAILS) return array(429, array('error' => 'locked', 'retry_after' => FAIL_WINDOW - ($now - min($fails))));
    $hash = hash('sha256', $cfg['salt'] . $code);
    $hit = null;
    foreach ($cfg['codes'] as $c) if ($code !== '' && hash_equals($c['hash'], $hash)) $hit = $c;
    if (!$hit) {
      $fails[] = $now;
      $st['fails'][$ip] = $fails;
      return array(401, array('error' => 'invalid'));
    }
    unset($st['fails'][$ip]);
    $row = isset($st['codes'][$hit['id']]) ? $st['codes'][$hit['id']] : array('first' => null, 'last' => null, 'uses' => 0);
    if (is_expired($cfg, $row, $now)) return array(403, array('error' => 'expired'));
    if (empty($row['first'])) $row['first'] = $now;
    $row['last'] = $now;
    $row['uses'] = (int) $row['uses'] + 1;
    $st['codes'][$hit['id']] = $row;
    // نشست‌های منقضی پاک می‌شوند
    foreach ($st['sessions'] as $tk => $s) {
      $r = isset($st['codes'][$s['id']]) ? $st['codes'][$s['id']] : array();
      if (is_expired($cfg, $r, $now)) unset($st['sessions'][$tk]);
    }
    $token = bin2hex(random_bytes(24));
    $st['sessions'][$token] = array('id' => $hit['id'], 't' => $now);
    return array(200, array('token' => $token, 'expires_at' => gmdate('c', expires_at($cfg, $row))));
  });
  $st = with_state(function (&$st) { return $st; });
  write_report($cfg, $st, $now);
  out($res[0], $res[1]);
}

if ($a === 'data') {
  $tk = isset($_SERVER['HTTP_X_DEMO_TOKEN']) ? $_SERVER['HTTP_X_DEMO_TOKEN'] : '';
  $cfg = config();
  $ok = with_state(function (&$st) use ($cfg, $tk, $now) {
    if (!preg_match('/^[a-f0-9]{48}$/', $tk) || !isset($st['sessions'][$tk])) return false;
    $id = $st['sessions'][$tk]['id'];
    $row = isset($st['codes'][$id]) ? $st['codes'][$id] : array();
    if (is_expired($cfg, $row, $now)) { unset($st['sessions'][$tk]); return false; }
    return true;
  });
  if (!$ok) out(401, array('error' => 'session'));
  // داده از پیش با gzip فشرده شده (ساخت دمو)؛ مرورگرها همه gzip می‌پذیرند — فقط اگر نپذیرفت باز می‌شود
  $data = read_private('data.php');
  if ($data === null) out(500, array('error' => 'data'));
  $enc = isset($_SERVER['HTTP_ACCEPT_ENCODING']) ? $_SERVER['HTTP_ACCEPT_ENCODING'] : '';
  if (strpos($enc, 'gzip') !== false) {
    if (function_exists('ini_set')) @ini_set('zlib.output_compression', '0');
    header('Content-Encoding: gzip');
  } else {
    $data = gzdecode($data);
  }
  // مرورگر تا ۱۰ دقیقه همین داده را دوباره دانلود نمی‌کند (رفرش و جابه‌جایی سریع‌تر)
  header('Cache-Control: private, max-age=600');
  header('Vary: Accept-Encoding, X-Demo-Token');
  header('Content-Length: ' . strlen($data));
  http_response_code(200);
  echo $data;
  exit;
}

out(404, array('error' => 'not_found'));
