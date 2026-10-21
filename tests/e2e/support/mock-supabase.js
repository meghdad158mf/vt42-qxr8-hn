// داده‌ی ساختگی سوپابیس برای آزمون‌های مرورگر — هیچ درخواستی به سرور واقعی نمی‌ره.
// هر درخواست PostgREST بر اساس اسم جدول یا RPC جواب می‌گیره؛ شمارش‌ها (count=exact)
// از هدر content-range خونده می‌شن، پس access-control-expose-headers لازمه.

const SUPABASE_HOST = '**/komqnapfqrtxxaytpcdt.supabase.co/**';

function buildData(now = Date.now()) {
  const iso = (h) => new Date(now - h * 3600e3).toISOString();
  const texts = [
    'رئیس‌جمهور در جلسه‌ی هیئت دولت بر لزوم پیگیری مصوبات اقتصادی و کنترل تورم در ماه‌های پیش رو تأکید کرد.',
    'نشست تخصصی بررسی نقش حوزه‌های علمیه در تحولات اجتماعی با حضور جمعی از اساتید و طلاب در مشهد برگزار شد.',
    'وزیر امور خارجه ایران در سفر به منطقه با همتای خود دیدار و درباره‌ی تحولات غزه رایزنی کرد.',
    'گزارش‌ها از افزایش قیمت کالاهای اساسی در بازار مشهد حکایت دارد؛ فعالان بازار خواستار نظارت بیشتر شدند.',
    'ادعا: «سهمیه‌ی بنزین از ماه آینده حذف می‌شود» — این ادعا نادرست است.',
  ];
  const names = ['خبرگزاری ایرنا', 'فارس', 'تسنیم', 'مهر', 'ایسنا', 'حوزه‌نیوز', 'خبر فوری', 'دکتر علی محمدی', 'مؤسسه‌ی مطالعات راهبردی'];
  const plats = ['eitaa', 'telegram', 'website'];
  const channels = [];
  for (let i = 1; i <= 24; i++) {
    const p = i === 24 ? 'bale' : plats[i % 3];
    channels.push({
      id: i, platform: p, username: p === 'website' ? `https://site${i}.ir/rss` : `chan${i}`,
      title: names[i % names.length] + (i > 9 ? ' ' + i : ''),
      category_id: (i % 3) + 1, region_id: (i % 2) + 1, avatar_url: null, owner_name: 'مدیر ' + i,
      subscriber_count: 1200 * i, is_khorasan_talabeh: i % 4 === 0,
      show_in_news: i <= 14, show_in_cyberspace: i > 10, show_in_people: i > 6 && i < 16, show_in_orgs: i > 15,
      show_in_hawza: i === 6, show_in_positions: i > 18, positions_tab: 'maraji', show_in_thinktanks: i === 9,
      show_in_laws: i === 12, laws_source: 'majles', active: true, type: 'news_agency',
    });
  }
  const posts = [];
  for (let i = 1; i <= 120; i++) {
    const c = channels[i % channels.length];
    posts.push({
      id: i, channel_id: c.id, platform: c.platform, platform_post_id: String(i),
      title: c.platform === 'website' || c.platform === 'bale' ? 'تیتر خبر شماره‌ی ' + i : null,
      text: texts[i % texts.length] + (i % 2 ? ' ' + texts[(i + 1) % texts.length] : ''),
      link: 'https://example.com/p/' + i, media_storage_path: null, media_source_url: null,
      posted_at: iso(i * 0.7), scraped_at: iso(i * 0.7), views: 1000 + i * 37, forwards: i,
      ai_keywords: ['تورم', 'دولت', 'مشهد'], hawza_relevant: true, section_relevant: true, hidden_at: null,
    });
  }
  // تاریخ امروزِ تهران (مثل خودِ سایت) — با تاریخ UTC، بین ۲۰:۳۰ تا ۲۴ UTC «امروز» روزنامه‌ها خالی می‌شد
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(now));
  return {
    channels, posts,
    categories: [{ id: 1, name: 'خبرگزاری' }, { id: 2, name: 'سیاسی' }, { id: 3, name: 'فرهنگی' }],
    regions: [{ id: 1, name: 'ملی' }, { id: 2, name: 'خراسان رضوی' }],
    news_topics: [{ id: 1, label: 'اقتصاد', keywords: ['تورم'] }, { id: 2, label: 'غزه', keywords: ['غزه'] }],
    magazines: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, title: 'بسته تحلیلی جریان', issue_no: String(i + 1), sort_order: i, cover_path: null, cover_url: null, file_paths: [], published_at: iso(168 * i), created_at: iso(168 * i) })),
    news_ai_insights: [{
      id: 1, computed_at: iso(2), window_hours: 6,
      picks: posts.slice(0, 6).map((p, k) => ({ id: p.id, headline: 'خبر منتخب ' + (k + 1), score: 9 - k, tags: ['تنش سیاسی'], sources: 6 - k, posts: 8, channel_id: p.channel_id, time: p.posted_at, link: p.link })),
      topics: [{ label: 'اقتصاد', weight: 30 }, { label: 'سیاست خارجی', weight: 20 }],
    }],
    newspapers: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, slug: 'np' + i, title: 'روزنامه ' + (i + 1), edition_date: today, cover_url: 'images/analysis-illustration.webp', cover_storage_path: null })),
    app_users: [
      { id: 1, full_name: 'کاربر آزمایشی', phone: '09121234567', eitaa_id: null, title: 'کارشناس', access_level: 'pro', active: true, notes: null, national_id_last4: '2419', is_admin: false, created_at: iso(5) },
      { id: 2, full_name: 'مدیر آزمایشی', phone: '09351112233', eitaa_id: null, title: 'مدیر', access_level: 'plus', active: true, notes: null, national_id_last4: '0899', is_admin: true, created_at: iso(9) },
    ],
    login_events: [{ id: 1, created_at: iso(0.2), success: true, role: 'app_viewer', user_agent: 'Mozilla/5.0 (Linux; Android 13)', ip: '5.120.1.1', user_id: 1, user_name: 'کاربر آزمایشی' }],
    announcements: [], site_settings: [], news_pick_edits: [], profile_groups: [], channel_profile_groups: [],
    dossier_topics: [], dossier_topic_posts: [], newsletter_posts: [], archive_reports: [], school_reports: [],
    hawza_mentions: [], crawl_sites: [], crawl_suggestions: [], feedback: [], notify_subscribers: [],
    admin_audit: [], page_views: [], client_errors: [], capacity_snapshots: [],
  };
}

// کد ملی‌های آزمایشی (رقم کنترل درست): بیننده و مدیر
export const TEST_NID = { viewer: '0013542419', admin: '0499370899' };
export const TEST_ADMIN_PASSWORD = 'adminpw';

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const RPC = {
  monitored_source_counts: () => ({ channels: 24, newspapers: 38, crawl: 31 }),
  hidden_post_ids: () => [],
  storage_usage: () => [],
  channel_last_post: () => [],
  login_lock_status: () => [],
  sms_status: () => ({ key_set: true, body_id: '312456', recent: [] }),
  log_page_view: () => null,
  log_client_error: () => null,
};

function json(route, status, body, extraHeaders = {}) {
  return route.fulfill({
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-expose-headers': 'content-range',
      ...extraHeaders,
    },
    body: body === undefined ? '' : JSON.stringify(body),
  });
}

/**
 * سوپابیس و Edge Functionها رو برای یه context مرورگر شبیه‌سازی می‌کنه.
 * options.settings: ردیف‌های site_settings (مثلاً ورود اضطراری)
 * options.data: جدول‌هایی که جای داده‌ی پیش‌فرض می‌شینن، مثل { login_events: [...] }
 * options.patch(data): تغییر کوچیک روی داده‌ی پیش‌فرض (مثلاً متن انگلیسی برای یه پست)
 */
export async function mockSupabase(context, options = {}) {
  const data = Object.assign(buildData(), options.data || {});
  if (options.patch) options.patch(data);
  const settings = options.settings || [];

  await context.route('**/functions/v1/**', (route) => json(route, 200, {}));

  await context.route(SUPABASE_HOST, (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return json(route, 200);
    const url = new URL(req.url());
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) { /* بدنه‌ی غیر JSON */ }
    // لینک امن فایل‌های خصوصی (نمایشگر سند): امضا → آدرس ساختگی، و خودِ فایل = یه عکس ۱×۱
    const sign = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)/);
    if (sign && req.method() === 'POST') {
      return json(route, 200, (body.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/${sign[1]}/${p}?token=t` })));
    }
    if (sign) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 });
    const m = url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (!m) return json(route, 200, []);
    const [, isRpc, name] = m;

    if (isRpc) {
      if (name === 'otp_request') {
        if (body.p_nid === TEST_NID.admin && !body.p_method) return json(route, 200, { choose: true, sms: true });
        if (body.p_nid === TEST_NID.viewer || body.p_nid === TEST_NID.admin) {
          return json(route, 200, { otp_id: 'otp-1', phone_hint: '•••••••4567', expires_in: 120, resend_in: 60 });
        }
        return json(route, 404, { error: 'not_found' });
      }
      if (name === 'login_otp') {
        if (body.p_code === '12345') return json(route, 200, { token: 'x.eyJ9.x', role: 'app_viewer', name: 'کاربر آزمایشی' });
        return json(route, 401, { error: 'invalid_code', left: 2 });
      }
      if (name === 'login_admin') {
        if (body.p_password === TEST_ADMIN_PASSWORD) return json(route, 200, { token: 'x.eyJ9.x', role: 'app_admin', name: 'مدیر آزمایشی' });
        return json(route, 401, { error: 'invalid' });
      }
      const fn = RPC[name];
      return json(route, 200, fn ? fn(body) : null);
    }

    if (name === 'site_settings') return json(route, 200, settings);
    let rows = data[name] || [];
    if (name === 'posts') {
      const pl = url.searchParams.get('platform');
      const ch = url.searchParams.get('channel_id');
      if (pl && pl.startsWith('eq.')) rows = rows.filter((p) => p.platform === pl.slice(3));
      if (ch && ch.startsWith('in.')) {
        const ids = ch.slice(4, -1).split(',').map(Number);
        rows = rows.filter((p) => ids.includes(p.channel_id));
      }
    }
    const total = url.search.includes('scraped_at=gte') ? 312 : Math.max(rows.length, 50);
    return json(route, 200, rows, { 'content-range': `0-${rows.length}/${total}` });
  });
}
