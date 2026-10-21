// ورودی بخش مدیریت (مرحله‌ی ۸ب): app.js این فایل رو فقط برای مدیر و با import() پویا بار می‌کنه، پس همه‌ی
// admin/ یه بسته‌ی جدای ساخت می‌شه که بیننده‌ها هرگز دانلودش نمی‌کنن. listenerهای صفحه‌های مدیریت همین‌جا
// (به ترتیب قبلی‌شون در app.js) راه می‌افتن؛ app.js فقط از راه admin() (core/admin-hooks.js) و تابع‌های export
// همین فایل به مدیریت دسترسی داره.
import { setupDeleteChannel } from './settings/delete-channel.js';
import { setupSysStorage } from './status/storage.js';
import { setupSysAlerts } from './status/alerts.js';
import { setupJobLog } from './status/job-log.js';
import { setupSysLogins } from './status/logins.js';
import { setupSysSummary } from './status/summary.js';
import { renderSystemStatus, setupSystemStatus } from './status/status.js';
import { renderSiteSettingsAdmin, setupSiteSettingsAdmin } from './site-settings.js';
import { renderAnnAdmin, setupAnnounceAdmin } from './announce.js';
import { openUsersSection, renderUsersSection, setupUsersAdmin } from './users.js';
import { UPLOADS_TAB, setUploadsTab, setupUploads } from './uploads.js';
import { renderChanList, setupChannelsAdmin } from './settings/channels.js';
import { refreshCatOptions, refreshRegionOptions, renderCatGrid, renderRegionGrid, renderTopicGrid, setupTaxonomyAdmin } from './settings/taxonomy.js';
import { loadCrawlSites, loadCrawlSuggestions, setupCrawlAdmin } from './settings/crawl.js';
import { renderProfileGroupAdmin, setupProfileGroupsAdmin } from './settings/profile-groups.js';
import { renderDossierTopicAdminList, setupDossierAdmin } from './settings/dossier-admin.js';
import { renderSmsPanel, setupSecurityAdmin } from './settings/security.js';
import { renderBackupPanel, setupBackup } from './settings/backup.js';
import { populateExportFilters, setupExport } from './export.js';
import { ACT_TAB, ACT_TAB_INFO, setActTab, setupActivity } from './activity.js';
import { ADMIN_ALERT_TIMER, ackAdminAlerts, refreshAdminAlerts } from './alerts-badge.js';
import { currentRole } from '../core/session.js';

setupDeleteChannel();
setupSysStorage();
setupSysAlerts();
setupJobLog();
setupSysLogins();
setupSysSummary();
setupSystemStatus();
setupSiteSettingsAdmin();
setupAnnounceAdmin();
setupUsersAdmin();
setupUploads();
setupChannelsAdmin();
setupTaxonomyAdmin();
setupCrawlAdmin();
setupProfileGroupsAdmin();
setupDossierAdmin();
setupSecurityAdmin();
setupExport();
setupBackup();
setupActivity();

export { openUsersSection };

// switchSection: هر بار که یکی از بخش‌های مدیریت باز می‌شه
export function enterSection(key){
  if(key === 'users') renderUsersSection();
  if(key === 'status'){ renderSystemStatus(); ackAdminAlerts(); }
  if(key === 'uploads') setUploadsTab(UPLOADS_TAB);
  if(key === 'announce') renderAnnAdmin();
  if(key === 'activity') setActTab(ACT_TAB);
  if(key === 'settings'){ renderBackupPanel(); renderSiteSettingsAdmin(); renderSmsPanel(); loadCrawlSites(); if(currentRole === 'app_admin') loadCrawlSuggestions(); }
}
// loadAll: بعد از رسیدن داده‌ها، فهرست‌های «تنظیمات بخش‌ها» و فیلترهای «خروجی محتوا»
export function renderAfterLoad(){
  populateExportFilters();
  refreshCatOptions();
  renderCatGrid();
  refreshRegionOptions();
  renderRegionGrid();
  renderTopicGrid();
  renderProfileGroupAdmin();
  renderDossierTopicAdminList();
  renderChanList();
}
// تب فعلی بخش‌های مدیریتِ تب‌دار (برای آدرس #بخش/تب و «برگشت») و اعمال تب ذخیره‌شده
export function navTab(s){
  if(s === 'uploads') return UPLOADS_TAB;
  if(s === 'activity') return ACT_TAB;
  return null;
}
export function applyNav(st){
  if(st.s === 'uploads' && st.t && ['magazines','archive','schools'].includes(st.t) && st.t !== UPLOADS_TAB) setUploadsTab(st.t);
  if(st.s === 'activity' && st.t && ACT_TAB_INFO[st.t] && st.t !== ACT_TAB) setActTab(st.t);
}
// نشانگرهای هشدار منوی «مدیریت»: ۲ ثانیه بعد از ورود و بعد هر ۱۵ دقیقه؛ خروج متوقفش می‌کنه
export function startAlerts(){ setTimeout(refreshAdminAlerts, 2000); }
export function stopAlerts(){ clearTimeout(ADMIN_ALERT_TIMER); }
