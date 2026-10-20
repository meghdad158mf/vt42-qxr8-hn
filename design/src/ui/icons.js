// آیکون‌های SVG خطی رابط (کارت‌ها، دکمه‌ها) و آیکون تب‌ها (data-ic روی دکمه‌ی تب)

export const ICONS = {
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10l6-3.2v10.4l-6-3.2"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15.5l-5.5-5-6.5 6.5-2.5-2.5-3 3"/></svg>',
  person: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="34" r="17"/><path d="M16 96c0-24 15-40 34-40s34 16 34 40"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9"/><path d="M9 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6.5c-1.8-1.3-4.3-2-7-2v13.5c2.7 0 5.2.7 7 2 1.8-1.3 4.3-2 7-2V4.5c-2.7 0-5.2.7-7 2z"/><path d="M12 6.5v13.5"/></svg>',
  graduation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11.5v4.5c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2.5" y="13" width="5" height="7" rx="2"/><rect x="16.5" y="13" width="5" height="7" rx="2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4M9 22h6"/></svg>',
  interview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 20l1-4.9A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/></svg>',
  newspaper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h13v13a3 3 0 0 0 3 3H7a3 3 0 0 1-3-3V4z"/><path d="M17 8h3v9a3 3 0 0 1-3 3"/><path d="M7.5 8h6M7.5 11h6M7.5 14h4"/></svg>',
  userLine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M2.5 19c0-3.3 2.8-5.6 6.5-5.6s6.5 2.3 6.5 5.6"/><path d="M16 8.2a3 3 0 1 1 1.2 5.7"/><path d="M18 13.6c2.6.6 3.5 2.6 3.5 4.7"/></svg>'
};
// ---- تب‌بارها (همه‌ی بخش‌ها): آیکون، خط هلویی لغزان، سایه‌ی لبه‌ی گوشی، رفتن
// تب فعال به دید و یادآوری آخرین تب. آیکون از data-ic.
export const TAB_ICONS = {
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  claims: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  study: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
  website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z"/>',
  newspapers: '<path d="M4 5h13v14H6a2 2 0 01-2-2V5z"/><path d="M17 9h3v8a2 2 0 01-2 2M8 9h5M8 13h5"/>',
  dossier: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>',
  newsletter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  feed: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><rect x="7" y="6" width="10" height="6" rx="1"/><path d="M7 15.5h10M7 18h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/>',
  orgs: '<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
  figures: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  archive: '<path d="M3 20h18M5 20V5h3v15M9 20V8h3v12"/><path d="M13.6 8.6l2.9-.8 3.4 11.6-2.9.8z"/>',
  hawza: '<path d="M4 21V11a8 8 0 0116 0v10M4 21h16M12 3v2M9 21v-5a3 3 0 016 0v5"/>',
  about: '<path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M8.5 9h2v2c0 1.3-.7 2.1-2 2.4M13.5 9h2v2c0 1.3-.7 2.1-2 2.4"/>',
  notify: '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
  feedback: '<path d="M21 11.5a8.4 8.4 0 01-1.2 4.4L21 20l-4.3-1.1a8.5 8.5 0 114.3-7.4z"/>',
  // ۵.۲۸.۰: تب‌های عرصه‌های تازه
  leader: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  maraji: '<path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v13c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-13c-3.8 0-6.3.5-8 2z"/><path d="M12 6.5v13"/>',
  imams: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8"/>',
  thinktank: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  trends: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8M7.5 12l2-2.2 1.8 1.6 2.2-2.6"/>',
  mood: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
};

