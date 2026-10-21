// «مشاهده‌ی گزارش» آخرین اجرای هر کار (run-job {action:logs}) در #job-log-modal
import { authToken } from '../../core/session.js';
import { bindModal } from '../../ui/modal.js';
import { escHtml, safeUrl } from '../../core/text.js';
import { showToast } from '../../ui/toast.js';
import { SUPABASE_URL } from '../../core/config.js';
import { SYS_STATUS_JOBS } from './jobs.js';

// ---- گزارش اجرای کارهای خودکار (۵.۲۵.۰، run-job با {action:'logs'}) ----
export let JOB_LOG_TEXT = '';
export const JOB_LOG_ERR_RX = /##\[error\]|traceback|error|exception|failed|\[!\]|❌/i;
export let JOB_LOG_SEQ = 0; // جواب دیرِ گزارش قبلی روی گزارش تازه ننشینه
export async function openJobLog(job){
  const seq = ++JOB_LOG_SEQ;
  const j = SYS_STATUS_JOBS.find(x=>x.job === job);
  document.getElementById('job-log-title').textContent = 'گزارش آخرین اجرا: ' + (j ? j.name : job);
  document.getElementById('job-log-meta').textContent = 'در حال دریافت از گیت‌هاب…';
  document.getElementById('job-log-body').innerHTML = '';
  const ghLink = document.getElementById('job-log-gh');
  ghLink.hidden = true; ghLink.removeAttribute('href');
  document.getElementById('job-log-copy').disabled = true;
  JOB_LOG_TEXT = '';
  document.getElementById('job-log-modal').classList.add('active');
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/run-job', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + authToken },
      body: JSON.stringify({ action:'logs', job }),
    });
    if(!r.ok) throw new Error('run-job logs ' + r.status);
    const d = await r.json();
    if(seq !== JOB_LOG_SEQ) return;
    if(d.error && !d.lines) throw new Error(d.error);
    const meta = document.getElementById('job-log-meta');
    if(!d.run){ meta.textContent = d.running ? 'اولین اجرا هنوز در جریان است؛ گزارش بعد از پایان آن آماده می‌شود.' : 'هنوز اجرایی ثبت نشده است.'; return; }
    const res = d.run.conclusion === 'success' ? 'موفق' : d.run.conclusion === 'failure' ? 'ناموفق' : d.run.conclusion === 'cancelled' ? 'لغو شده' : (d.run.conclusion || 'نامشخص');
    const when = new Date(d.run.created_at).toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
    meta.innerHTML = `اجرای ${escHtml(when)} — نتیجه: <b class="${d.run.conclusion === 'success' ? 'ok' : 'bad'}">${escHtml(res)}</b>${d.running ? '؛ یک اجرای تازه‌تر هم در جریان است.' : ''}${d.truncated ? '<br>فقط ۶۰ خط آخر نمایش داده می‌شود.' : ''}`;
    const gh = document.getElementById('job-log-gh');
    const url = safeUrl(d.run.html_url);
    if(url){ gh.href = url; gh.hidden = false; }
    const lines = d.lines || [];
    if(!lines.length){ document.getElementById('job-log-body').innerHTML = '<div class="job-log-line">گزارشی برای این اجرا در دسترس نیست.</div>'; return; }
    const fmtT = t => t ? new Date(t).toLocaleTimeString('en-GB', { timeZone:'Asia/Tehran', hour12:false }) : '';
    JOB_LOG_TEXT = lines.map(l=>(l.t ? fmtT(l.t) + '  ' : '') + l.text).join('\n');
    document.getElementById('job-log-body').innerHTML = lines.map(l=>{
      const err = JOB_LOG_ERR_RX.test(l.text);
      return `<div class="job-log-line ${err ? 'err' : ''} ${l.text.startsWith('▶') ? 'step' : ''}"><span class="job-log-t">${escHtml(fmtT(l.t))}</span><span>${escHtml(l.text.replace('##[error]', '✖ '))}</span></div>`;
    }).join('');
    document.getElementById('job-log-copy').disabled = false;
    const body = document.getElementById('job-log-body');
    body.scrollTop = body.scrollHeight;
  }catch(e){
    if(seq !== JOB_LOG_SEQ) return;
    console.error(e);
    document.getElementById('job-log-meta').textContent = 'دریافت گزارش ناموفق بود. اگر تازه منتشر شده، چند دقیقه بعد دوباره امتحان کنید (تابع run-job باید دوباره نصب شود).';
  }
}
export function closeJobLog(){ document.getElementById('job-log-modal').classList.remove('active'); }
export async function copyJobLog(){
  try{ await navigator.clipboard.writeText(JOB_LOG_TEXT); showToast('متن گزارش کپی شد؛ می‌توانید آن را برای پشتیبانی بفرستید.'); }
  catch(e){ showToast('کپی ممکن نشد؛ متن را دستی انتخاب و کپی کنید.'); }
}
export function setupJobLog(){
  bindModal('job-log-modal', closeJobLog);
  document.addEventListener('click', e=>{
    const b = e.target.closest('.sys-log-btn');
    if(b) openJobLog(b.dataset.log);
  });
}

