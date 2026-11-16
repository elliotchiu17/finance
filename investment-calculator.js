/* v11: client-only Taiwan equity/ETF calculator. No storage or external requests. */
(()=>{'use strict';
const $=id=>document.getElementById(id);if(!$('view-calculator'))return;
const number=id=>Number($(id).value);const money=n=>Number.isFinite(n)?'NT$ '+Math.round(n).toLocaleString('zh-TW'):'—';
const price=n=>Number.isFinite(n)?n.toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
const percent=n=>Number.isFinite(n)?n.toFixed(2)+'%':'—';
let mode='sell';
function fee(amount,orders,setting='auto'){
 if(setting==='fixed')return Math.round(number('calc-fixedfee')*orders);
 const rate=number('calc-feerate')/100,min=number('calc-feemin');
 return orders*Math.max(min,Math.floor(amount/orders*rate));
}
function taxRate(){return {etf:.001,stock:.003,bond:0,custom:number('calc-custom-tax')/100}[$('calc-type').value]}
const row=(label,value)=>`<div class="v11-result-row"><span>${label}</span><strong>${value}</strong></div>`;
function compute(){
 const shares=number('calc-shares'),orders=number('calc-orders'),sellOrders=number('calc-sellorders');
 const rate=taxRate();let cost=0,buyFee=0;
 if($('calc-basis').value==='direct'){cost=number('calc-direct')}
 else{const gross=number('calc-buyprice')*shares;buyFee=fee(gross,orders,$('calc-feemode').value);cost=gross+buyFee;}
 const bad=[shares,orders,sellOrders,cost,rate,number('calc-feerate'),number('calc-feemin')].some(x=>!Number.isFinite(x)||x<0)||shares<1||!Number.isInteger(shares)||!Number.isInteger(orders)||orders<1||!Number.isInteger(sellOrders)||sellOrders<1;
 if(bad||($('calc-basis').value==='auto'&&number('calc-buyprice')<=0))throw Error('請填寫合理的單價、股數、成交筆數與費率。');
 // Simulation convention: commission floor to whole NT$, tax floor to whole NT$, adjustable rates.
 function sellAt(unit,qty,transactions){const gross=unit*qty,sFee=fee(gross,transactions),tax=Math.floor(gross*rate);return {gross,sFee,tax,net:gross-sFee-tax}}
 if(mode==='sell'){
  const goal=$('calc-target').value;let unit=number('calc-price');
  const target=goal==='profit'?number('calc-profit'):goal==='return'?cost*number('calc-return')/100:0;
  if(goal!=='price'){
   if(cost+target<0)throw Error('目標實收金額不可低於 0。');
   let lo=0,hi=Math.max(1,(cost+target)/shares*1.2+2);
   for(let tries=0;tries<50&&sellAt(hi,shares,sellOrders).net<cost+target;tries++)hi*=2;
   for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(sellAt(mid,shares,sellOrders).net>=cost+target)hi=mid;else lo=mid}
   unit=Math.ceil(hi*10000)/10000;
  }
  if(!(unit>0)||!Number.isFinite(unit))throw Error('請填寫大於 0 的賣出單價。');
  const res=sellAt(unit,shares,sellOrders),profit=res.net-cost;
  $('calc-output').innerHTML=`<div class="v11-result-label">${goal==='price'?'預估淨損益':'達成目標的理論賣出價'}</div><div class="v11-result-big ${goal==='price'?(profit>=0?'up':'down'):''}">${goal==='price'?money(profit):price(unit)+' 元／股'}</div><div class="v11-result-sub">淨報酬率 ${percent(profit/cost*100)} · ${shares.toLocaleString()} 股</div>${row('原始投入總成本',money(cost))}${row('預計賣出單價',price(unit)+' 元')}${row('賣出總額（未扣費）',money(res.gross))}${row('賣出手續費',money(res.sFee))}${row('證券交易稅',money(res.tax))}${row('賣出實收',money(res.net))}${row('淨損益',money(profit))}<p class="v11-result-hint">${goal==='price'?'可切換為目標報酬率或淨損益，反推所需賣價。':'目標價未依證券升降單位進位，實際掛單需自行調整。'} </p>`;
 }else{
  const addShares=number('calc-addshares'),addPrice=number('calc-addprice'),addOrders=number('calc-addorders');if(!Number.isInteger(addShares)||addShares<1||!(addPrice>0)||!Number.isInteger(addOrders)||addOrders<1)throw Error('請輸入有效加碼單價、股數及成交筆數。');
  const addGross=addPrice*addShares,addFee=fee(addGross,addOrders),all=cost+addGross+addFee,qty=shares+addShares,avg=all/qty;
  let lo=0,hi=Math.max(avg*1.2,1);for(let i=0;i<50;i++)if(sellAt(hi,qty,1).net<all)hi*=2;
  for(let i=0;i<65;i++){const mid=(lo+hi)/2;if(sellAt(mid,qty,1).net>=all)hi=mid;else lo=mid}
  const breakeven=Math.ceil(hi*10000)/10000;
  $('calc-output').innerHTML=`<div class="v11-result-label">加碼後損益兩平賣價</div><div class="v11-result-big">${price(breakeven)} <small>元／股</small></div><div class="v11-result-sub">含預估賣出手續費與證交稅 · 假設一次全部賣出</div>${row('原有持倉成本',money(cost))}${row('本次加碼金額',money(addGross))}${row('加碼買入手續費',money(addFee))}${row('加碼後總投入',money(all))}${row('加碼後總股數',qty.toLocaleString()+' 股')}${row('含買入費用平均成本',price(avg)+' 元／股')}${row('全部賣出損益兩平價',price(breakeven)+' 元／股')}<p class="v11-result-hint">「平均持有成本」與「真正賣出後不賠錢的價位」不同，因為賣出也有費用。</p>`;
 }
}
function refresh(){for(const [id,show] of [['calc-direct-wrap',$('calc-basis').value==='direct'],['calc-buyprice-wrap',$('calc-basis').value==='auto'],['calc-orders-wrap',$('calc-basis').value==='auto'],['calc-basis-wrap',true],['calc-fixedfee-wrap',$('calc-feemode').value==='fixed'&&$('calc-basis').value==='auto'],['calc-custom-tax-wrap',$('calc-type').value==='custom'],['calc-price-wrap',mode==='sell'&&$('calc-target').value==='price'],['calc-profit-wrap',mode==='sell'&&$('calc-target').value==='profit'],['calc-return-wrap',mode==='sell'&&$('calc-target').value==='return']])$(id).classList.toggle('hidden',!show);
 $('calc-sell-fields').classList.toggle('hidden',mode!=='sell');$('calc-add-fields').classList.toggle('hidden',mode!=='add');
 try{compute()}catch(e){$('calc-output').innerHTML=`<p class="v11-calc-error">${e.message}</p>`}
}
document.querySelectorAll('[data-calc-mode]').forEach(btn=>btn.addEventListener('click',()=>{mode=btn.dataset.calcMode;document.querySelectorAll('[data-calc-mode]').forEach(x=>x.classList.toggle('active',x===btn));refresh()}));
$('view-calculator').addEventListener('input',refresh);$('view-calculator').addEventListener('change',refresh);refresh();
})();
