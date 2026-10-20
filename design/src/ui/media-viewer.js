// نمایش بزرگ عکس/فیلم پست‌ها (#media-viewer)
import { bindModal } from './modal.js';
import { safeUrl } from '../core/text.js';
import { ICONS } from './icons.js';

export function wireMediaViewerClicks(root){
  root.querySelectorAll('[data-viewer-kind]').forEach(node=>{
    node.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMediaViewer(node.dataset.viewerKind, node.dataset.viewerSrc, node.dataset.viewerLink || null);
    });
  });
}
export function openMediaViewer(kind, url, linkUrl){
  const body = document.getElementById('media-viewer-body');
  // ۵.۲۲.۱: آدرس از data-* (رمزگشایی‌شده) می‌آد و برای وب‌سایت‌ها از خودِ فید RSS — دوباره escape + فقط http(s)
  const src = safeUrl(url);
  body.innerHTML = kind==='video'
    ? `<video src="${src}" controls autoplay playsinline></video>`
    : `<img src="${src}" alt="">`;
  const linkEl = document.getElementById('media-viewer-link');
  if(linkUrl && /^https?:\/\//i.test(String(linkUrl).trim())){
    linkEl.href = linkUrl;
    linkEl.innerHTML = `${ICONS.external}مشاهده در مبدأ`;
    linkEl.style.display = 'flex';
  } else {
    linkEl.style.display = 'none';
  }
  document.getElementById('media-viewer').classList.add('active');
}
export function closeMediaViewer(){
  document.getElementById('media-viewer').classList.remove('active');
  document.getElementById('media-viewer-body').innerHTML = '';
}

export function setupMediaViewer(){
  bindModal('media-viewer', closeMediaViewer);
}
