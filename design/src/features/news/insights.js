// خروجی تحلیل هوش مصنوعی (news_ai_insights، روزی ۴ بار): «اخبار منتخب» و «موضوعات پرتکرار»
import { api } from '../../core/api.js';

export let NEWS_AI_INSIGHTS = null; // {id, computed_at, window_hours, selected_posts:[{id,headline,score,tags,sources,posts,channel_id,time,link}], topics:[{name,weight}]} — آخرین تحلیل هوش مصنوعی تب «در یک نگاه» (روزی ۴ بار از GitHub Actions، نه هر بار بازکردن تب)
export async function loadNewsAiInsights(){
  const r = await api('/news_ai_insights?select=*&order=computed_at.desc&limit=1');
  const rows = r.ok ? await r.json() : [];
  NEWS_AI_INSIGHTS = rows.length ? rows[0] : null;
}

