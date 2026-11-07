/* V1.7 Cloud synchronization adapter: 1 personal workspace document per admin. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const event = (type, more={}) => window.dispatchEvent(new CustomEvent('komorebi-cloud',{detail:{type,...more}}));
const config=window.KOMOREBI_FIREBASE_CONFIG||{};
const configured=Boolean(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
let auth, db, user=null, loaded=false, updateTimer=0, latestData=null, busy=Promise.resolve(), generation=0;

async function flush(){
  if(!loaded||!user||!latestData)return;
  const snapshot=structuredClone(latestData), uid=user.uid, rev=generation;
  latestData=null;
  busy=busy.catch(()=>{}).then(async()=>{
    if(!loaded||uid!==user?.uid||rev!==generation)return;
    event('saving');
    try {
      await setDoc(doc(db,'users',uid,'private','workspace'),{schemaVersion:1,data:snapshot,updatedAt:serverTimestamp()});
      if(uid===user?.uid&&rev===generation)event('saved');
    } catch(e){event('error',{message:'雲端寫入失敗：'+e.message+'；請使用本機 JSON 備份。'});}
  });
  await busy;
}
function scheduleSave(data){
  if(!loaded||!user)return;
  latestData=structuredClone(data);
  clearTimeout(updateTimer);
  updateTimer=setTimeout(flush,650);
}
function stopSession(){loaded=false;latestData=null;clearTimeout(updateTimer);generation++;}
async function loadUser(next){
  stopSession();user=next;
  if(!next){event('signedOut');return;}
  const admin=(window.KOMOREBI_ADMIN_EMAIL||'').trim().toLowerCase();
  if(admin&&next.email?.toLowerCase()!==admin){event('unauthorized');await firebaseSignOut(auth);return;}
  const rev=generation;
  try{
    const snap=await getDoc(doc(db,'users',next.uid,'private','workspace'));
    if(rev!==generation||user?.uid!==next.uid)return;
    if(snap.exists()&&snap.data().data){loaded=true;event('cloudLoaded',{user:{uid:next.uid,email:next.email},data:snap.data().data});}
    else event('cloudEmpty',{user:{uid:next.uid,email:next.email}});
  }catch(e){event('error',{message:'讀取 Firestore 失敗：'+e.message});}
}
async function initializeCloud(data){
  if(!user||loaded)throw Error('請先登入，且僅能初始化空白雲端');
  const uid=user.uid, ref=doc(db,'users',uid,'private','workspace');
  try{
    const existing=await getDoc(ref);
    if(existing.exists())throw Error('雲端已有資料，為避免覆蓋已停止首次匯入。請重新登入讀取雲端。');
    await setDoc(ref,{schemaVersion:1,data:structuredClone(data),updatedAt:serverTimestamp()});
    loaded=true;event('cloudLoaded',{user:{uid,email:user.email},data});event('saved');
  }catch(e){event('error',{message:e.message});}
}
window.KomorebiCloud={configured,signIn:async()=>{
  if(!configured)return event('error',{message:'請先填寫 firebase-config.js'});
  try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){event('error',{message:'登入失敗：'+e.message});}
},signOut:async()=>{try{await flush();stopSession();await firebaseSignOut(auth)}catch(e){event('error',{message:'登出失敗：'+e.message})}},scheduleSave,initializeCloud};
if(configured){
  try{
    const app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);
    event('configured');onAuthStateChanged(auth,loadUser,e=>event('error',{message:e.message}));
  }catch(e){event('error',{message:'Firebase 初始化失敗：'+e.message});}
}
