/* Investment Research Hub V1.8 — separate PUBLIC ETF catalog and PRIVATE user workspace.
   No automatic migration. Firestore rules must be published BEFORE public migration. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
const emit=(type,more={})=>window.dispatchEvent(new CustomEvent('komorebi-cloud',{detail:{type,...more}}));
const config=window.KOMOREBI_FIREBASE_CONFIG||{};
const configured=Boolean(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
let auth,db,user=null,privateReady=false,published=false,publicReady=false,privateBusy=Promise.resolve(),publicBusy=Promise.resolve(),timer=0,pending=null,version=0;
const clone=v=>JSON.parse(JSON.stringify(v));
const privatePath=uid=>doc(db,'users',uid,'private','workspace');
const publicPath=()=>doc(db,'publicCatalog','etfs');
const dividendPath=id=>doc(db,'dividendEvents',id);
const categoryPath=()=>doc(db,'calendarMeta','categories');
const calendarEmit=(type,extra={})=>window.dispatchEvent(new CustomEvent('komorebi-calendar-cloud',{detail:{type,...extra}}));
const checkCalendarEdit=()=>{if(!user||!privateReady)throw Error('必須先以管理員 Google 帳號登入並完成私人資料載入')};
async function saveDividendEvent(event){checkCalendarEdit();const id=event.id;if(!/^[A-Za-z0-9-]{8,80}$/.test(id))throw Error('不合法的事件識別碼');await setDoc(dividendPath(id),{...event,updatedAt:serverTimestamp()})}
async function deleteDividendEvent(id){checkCalendarEdit();await deleteDoc(dividendPath(id))}
async function saveCalendarCategories(groups){checkCalendarEdit();if(!Array.isArray(groups)||groups.length>80)throw Error('分類清單異常');await setDoc(categoryPath(),{groups,updatedAt:serverTimestamp()})}

const PUBLIC_KEYS=['custom','edits','groups','bankOverrides','hiddenCodes','etfOrder','placements'];
const sanitizeEntry=e=>{const x={...e};delete x.memo;delete x.privateMemo;delete x.notes;return x};
function publicPart(s){return {custom:(s.custom||[]).map(sanitizeEntry),edits:Object.fromEntries(Object.entries(s.edits||{}).map(([k,v])=>[k,sanitizeEntry(v||{})])),groups:s.groups||[],bankOverrides:s.bankOverrides||{},hiddenCodes:s.hiddenCodes||[],etfOrder:s.etfOrder||[],placements:s.placements||{}}}
function privatePart(s){const memos={...s.memos};for(const [code,e] of Object.entries(s.edits||{}))if(typeof e.memo==='string')memos[code]=e.memo;for(const e of s.custom||[])if(typeof e.memo==='string')memos[e.code]=e.memo;return {watch:s.watch||[],watchGroups:s.watchGroups||[],note:s.note||'',clips:s.clips||[],holdings:s.holdings||[],memos}}
function notifyStatus(){emit('publicStatus',{published,publicReady})}
async function flush(){if(!user||!privateReady||!pending)return;const value=pending;pending=null;const id=user.uid,gen=version;
 privateBusy=privateBusy.catch(()=>{}).then(async()=>{if(id!==user?.uid||gen!==version)return;emit('saving');try{await setDoc(privatePath(id),{schemaVersion:published?2:1,data:published?privatePart(value):clone(value),updatedAt:serverTimestamp()});if(gen===version)emit('privateSaved')}catch(e){emit('error',{message:'私人資料儲存失敗：'+e.message});emit('saveFailure',{area:'private'});}});
 if(published){publicBusy=publicBusy.catch(()=>{}).then(async()=>{if(id!==user?.uid||gen!==version)return;try{await setDoc(publicPath(),{schemaVersion:2,data:publicPart(value),updatedAt:serverTimestamp()});if(gen===version)emit('publicSaved')}catch(e){emit('error',{message:'公開 ETF 資料儲存失敗：'+e.message});emit('saveFailure',{area:'public'});}})}
 await Promise.allSettled([privateBusy,publicBusy]);}
function scheduleSave(data){if(!user||!privateReady)return;pending=clone(data);clearTimeout(timer);timer=setTimeout(flush,750)}
function reset(){clearTimeout(timer);pending=null;privateReady=false;version++}
async function loadUser(next){reset();user=next;if(!next){emit('signedOut');return}const admin=(window.KOMOREBI_ADMIN_EMAIL||'').trim().toLowerCase();if(admin&&next.email?.toLowerCase()!==admin){emit('unauthorized');await firebaseSignOut(auth);return}const gen=version;
 try{const snap=await getDoc(privatePath(next.uid));if(gen!==version||user?.uid!==next.uid)return;
 if(snap.exists()&&snap.data().data){privateReady=true;emit('cloudLoaded',{user:{uid:next.uid,email:next.email},data:snap.data().data})}
 else emit('cloudEmpty',{user:{uid:next.uid,email:next.email}})
 }catch(e){emit('error',{message:'讀取私人資料失敗：'+e.message})}}
async function initializeCloud(data){if(!user||privateReady)throw Error('需先登入且雲端未初始化');const id=user.uid;try{const ref=privatePath(id),current=await getDoc(ref);if(current.exists())throw Error('已有私人雲端文件，已取消覆蓋');await setDoc(ref,{schemaVersion:2,data:privatePart(data),updatedAt:serverTimestamp()});privateReady=true;emit('cloudLoaded',{user:{uid:id,email:user.email},data:privatePart(data)});emit('privateSaved')}catch(e){emit('error',{message:'首次匯入失敗：'+e.message})}}
async function publishPublic(data){if(!user||!privateReady)throw Error('請先使用管理員登入且載入私人資料');if(!publicReady)throw Error('公開資料讀取尚未完成');if(published)throw Error('公開目錄已存在，為避免覆蓋已取消再次移轉');const payload=publicPart(data);if(!confirm('即將建立所有訪客可閱讀的公開 ETF 目錄。只包含商品資料、分類、銀行及排序；不包含持倉、收藏或 ETF 私人備忘錄。請先匯出備份，確認繼續？'))return;
 try{const ref=publicPath();if((await getDoc(ref)).exists())throw Error('公開目錄已存在，停止初始化');await setDoc(ref,{schemaVersion:2,data:payload,updatedAt:serverTimestamp()});published=true;notifyStatus();emit('publicPublished')}catch(e){emit('error',{message:'發布公開名錄失敗：'+e.message})}}
window.KomorebiCloud={configured,signIn:async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){emit('error',{message:'Google 登入失敗：'+e.message})}},signOut:async()=>{await flush();reset();await firebaseSignOut(auth)},scheduleSave,initializeCloud,publishPublic,saveDividendEvent,deleteDividendEvent,saveCalendarCategories};
if(configured){try{const app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);
 emit('configured');onSnapshot(publicPath(),snap=>{publicReady=true;published=snap.exists();emit('publicLoaded',{published,data:snap.exists()?(snap.data().data||{}):null});notifyStatus()},err=>{publicReady=false;emit('error',{message:'無法讀取公開 ETF 目錄，請先部署 V1.8 Firestore 規則：'+err.message})});
 onSnapshot(collection(db,'dividendEvents'),snapshot=>calendarEmit('events',{data:snapshot.docs.map(d=>({...d.data(),id:d.id}))}),err=>calendarEmit('error',{message:err.message}));
 onSnapshot(categoryPath(),snapshot=>{if(snapshot.exists()&&Array.isArray(snapshot.data().groups))calendarEmit('categories',{data:snapshot.data().groups})},err=>calendarEmit('error',{message:'分類：'+err.message}));
 onAuthStateChanged(auth,loadUser,e=>emit('error',{message:e.message}));
 }catch(e){emit('error',{message:'Firebase 初始化失敗：'+e.message})}}
