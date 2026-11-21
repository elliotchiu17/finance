/* Komorebi v11-2 · Public reference gallery, admin-only Firestore editing */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sites=[],ready=false;
const isAdmin=()=>!document.body.classList.contains('guest-mode')&&!!window.KomorebiCloud?.saveReferenceSites;
function render(){
 $('ref-count').textContent=sites.length?`${sites.length} ENTRIES`:'';
 $('ref-add').classList.toggle('hidden',!isAdmin());
 $('ref-status').textContent=ready?'': '參考網站資料讀取中…';
 $('ref-grid').innerHTML=sites.length?sites.map((s,i)=>`<article class="v112-ref-card"><a class="v112-ref-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="前往 ${esc(s.name)}（另開新分頁）"><span class="v112-ref-n">${String(i+1).padStart(2,'0')} / REFERENCE</span><strong>${esc(s.name)}</strong><span class="v112-ref-desc">${esc(s.description)}</span><span class="v112-ref-arrow">前往網站 ↗</span></a>${isAdmin()?`<button class="v112-ref-edit" type="button" data-ref-edit="${esc(s.id)}">編輯</button>`:''}</article>`).join(''):'<p class="v112-ref-empty">目前尚無參考網站。'+(isAdmin()?'點擊右上方「新增網站」開始收藏。':'')+'</p>';
}
function open(s){if(!isAdmin())return;$('ref-form').reset();$('ref-id').value=s?.id||'';$('ref-name').value=s?.name||'';$('ref-url').value=s?.url||'';$('ref-desc').value=s?.description||'';$('ref-remove').classList.toggle('hidden',!s);$('ref-modal-title').textContent=s?'編輯參考網站':'新增參考網站';$('ref-modal').classList.remove('hidden')}
function urlCheck(s){try{const u=new URL(s);return u.protocol==='https:'&&!!u.hostname&&u.username===''&&u.password===''}catch{return false}}
async function persist(next){if(!isAdmin())throw Error('需要管理員權限');await window.KomorebiCloud.saveReferenceSites(next)}
$('ref-add').addEventListener('click',()=>open());$('ref-close').addEventListener('click',()=>$('ref-modal').classList.add('hidden'));$('ref-modal').addEventListener('click',e=>{if(e.target===$('ref-modal'))$('ref-modal').classList.add('hidden')});
$('ref-grid').addEventListener('click',e=>{const btn=e.target.closest('[data-ref-edit]');if(btn){const site=sites.find(x=>x.id===btn.dataset.refEdit);if(site)open(site)}});
$('ref-form').addEventListener('submit',async e=>{e.preventDefault();const id=$('ref-id').value||crypto.randomUUID(),name=$('ref-name').value.trim(),url=$('ref-url').value.trim(),description=$('ref-desc').value.trim();if(!name||!description||!urlCheck(url))return alert('請填入網站名稱、說明及有效的 HTTPS 網址。');const next=[...sites];const existing=next.findIndex(x=>x.id===id),site={id,name,url,description};if(existing>=0)next[existing]=site;else next.push(site);const btn=e.submitter;if(btn)btn.disabled=true;try{await persist(next);$('ref-modal').classList.add('hidden');$('ref-status').textContent='已儲存，等待雲端同步…'}catch(err){alert('儲存失敗：'+err.message)}finally{if(btn)btn.disabled=false}});
$('ref-remove').addEventListener('click',async()=>{const id=$('ref-id').value;if(!id||!isAdmin()||!confirm('確定要刪除這個參考網站？'))return;try{await persist(sites.filter(x=>x.id!==id));$('ref-modal').classList.add('hidden')}catch(err){alert('刪除失敗：'+err.message)}});
window.addEventListener('komorebi-references',e=>{const d=e.detail;if(d.type==='loaded'){sites=Array.isArray(d.sites)?d.sites.filter(s=>s&&urlCheck(s.url)):[];ready=true;render()}else if(d.type==='error'){$('ref-status').textContent='參考網站讀取失敗：'+d.message}});
window.addEventListener('komorebi-cloud',render);
render();
})();
