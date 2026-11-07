/*
 * V1.7 Firebase web configuration.
 * 把 Firebase Console > 專案設定 > 你的應用程式 > Web app 的 firebaseConfig 複製到這裡。
 * 這是用戶端公開設定（不是服務帳戶私鑰）；存取權限必須由 Firestore Rules 保護。
 */
window.KOMOREBI_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};
/* 僅作為前端提醒；真正限制存取請在 Firestore Rules 指定管理員 Firebase UID。 */
window.KOMOREBI_ADMIN_EMAIL = "";
