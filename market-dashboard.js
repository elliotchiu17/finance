/* V1.10: quote cards; does not fabricate or scrape licensed prices. */
(()=>{'use strict';
const markets=[
 {id:'TAIEX',market:'台灣',name:'台灣加權指數',zone:'Asia/Taipei',start:540,end:810},
 {id:'TX',market:'台灣期貨',name:'台指期（日／夜盤）',zone:'Asia/Taipei',start:525,end:810,nightStart:900,nightEnd:300},
 {id:'SPX',market:'美國',name:'S&P 500',zone:'America/New_York',start:570,end:960},
 {id:'IXIC',market:'美國',name:'NASDAQ',zone:'America/New_York',start:570,end:960},
 {id:'DJI',market:'美國',name:'道瓊工業指數',zone:'America/New_York',start:570,end:960},
 {id:'SOX',market:'美國',name:'費城半導體',zone:'America/New_York',start:570,end:960},
 {id:'N225',market:'日本',name:'日經 225',zone:'Asia/Tokyo',start:540,end:930},
 {id:'KS11',market:'韓國',name:'KOSPI',zone:'Asia/Seoul',start:540,end:930},
 {id:'STOXX50E',market:'歐洲',name:'EURO STOXX 50',zone:'Europe/Berlin',start:540,end:1050},
];
const $=id=>document.getElementById(id);
function localParts(z){let parts=new Intl.DateTimeFormat('en-US',{timeZone:z,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return Object.fromEntries(parts.map(p=>[p.type,p.value]))}
function session(m){const p=localParts(m.zone),min=Number(p.hour)*60+Number(p.minute),weekday=p.weekday;if(weekday==='Sat'||weekday==='Sun')return '休市／待確認';if(m.id==='TX'){if(min>=m.nightStart||min<m.nightEnd)return '夜盤時段*';if(min>=m.start&&min<=m.end)return '日盤時段*';return '非交易時段'}return min>=m.start&&min<=m.end?'盤中時段*':'盤後／盤前'}
function n(v){return Number(v).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2})}
function render(data){const quotes=data?.items||{};const cards=markets.map(m=>{const q=quotes[m.id],has=q&&Number.isFinite(Number(q.price))&&Number(q.price)>0;const current=has?Number(q.price):null,open=has&&Number(q.open)>0?Number(q.open):null;const change=open===null?null:current-open;const percent=change===null?null:100*change/open;const dir=change>0?'up':change<0?'down':'';const mark=change===null?'—':(change>0?'+':'')+n(change),pct=percent===null?'—':(percent>0?'+':'')+percent.toFixed(2)+'%';let asOf=has?(q.asOf||q.fetchedAt||data.updatedAt):null;let parsed=asOf?Date.parse(asOf):NaN;let stale=has&&(!Number.isFinite(parsed)||Date.now()-parsed>45*60*1000);let when=Number.isFinite(parsed)?new Date(parsed).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'資料時間未提供'
 return `<div class="index-card"><div class="market">${m.market}</div><div class="name">${m.name}</div><div class="value">${has?n(current):'—'}</div><div class="market-chips"><span class="market-chip">${session(m)}</span><span class="market-chip ${dir}">${change===null?'開盤差 —':mark}</span><span class="market-chip ${dir}">${pct}</span></div><div class="market-update">${has?'來源：'+(q.source||'資料提供者')+' · '+when:'尚無已授權行情來源'}${stale?' · 資料可能已過時':''}</div></div>`}).join('');$('indices').innerHTML=cards;const count=markets.filter(m=>quotes[m.id]?.price).length;$('market-updated').textContent=count?`已接入 ${count}/9 項 · 價格及開盤比較依資料來源更新`:'行情供應商尚未設定 · 九宮格已就緒'}
let latest={items:{}};async function getQuotes(){if(document.hidden)return;try{const response=await fetch('market-quotes.json?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const obj=await response.json();if(obj&&typeof obj.items==='object')latest=obj;render(latest)}catch(e){render(latest);$('market-updated').textContent='市場資料讀取失敗（檢查 market-quotes.json）'}}
function schedule(){if(!document.hidden)getQuotes()}
render(latest);getQuotes();setInterval(schedule,15*60*1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)getQuotes()});window.addEventListener('focus',getQuotes);
})();
