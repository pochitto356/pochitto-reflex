/* ぽちっと反射神経 — ネイティブ機能の橋渡し (広告 / 課金 / 振動 / シェア / レビュー)
 * ぽちっと漢字の native.js をベースにしている(ATTの要求方法は 2026-09-23 の差し戻し対応済みのもの)
 *
 * ブラウザで開いたときは全部ダミー動作になるので、index.html はどちらでも同じコードで動く。
 *
 * ★公開前に差し替える値 → AD_IDS (AdMobの管理画面で発行)
 *   差し替えるまではGoogle公式のテスト広告IDを使う(実収益ゼロ・審査には出さないこと)
 */
(function () {
  'use strict';

  // ---- 広告ユニットID -------------------------------------------------
  // 本番ID(AdMob 2026-10-01 発行)。テストしたいときだけ IS_TESTING を true にする。
  var IS_TESTING = false;
  var AD_IDS = {
    banner: 'ca-app-pub-7792368657314009/1614947458',        // PR_banner
    interstitial: 'ca-app-pub-7792368657314009/2333047039'   // PR_interstitial
  };
  var PRODUCT_ID = 'pochittoreflex_remove_ads'; // 非消耗型 ¥300 広告削除

  var C = window.Capacitor;
  var isApp = !!(C && C.isNativePlatform && C.isNativePlatform());
  var AdMob = null, Haptics = null, Share = null, InAppReview = null;
  var premium = false;
  var bannerShown = false;
  var interstitialReady = false;
  var log = function () { try { console.log.apply(console, ['[native]'].concat([].slice.call(arguments))); } catch (e) {} };

  try { premium = localStorage.getItem('pr_premium') === '1'; } catch (e) {}

  // ---- ブラウザ用のダミー ---------------------------------------------
  // index.html 側の modal() を使う。まだ定義前でも動くよう遅延参照する。
  function pseudo(title, body, ok, cancel, okLabel) {
    if (typeof window.modal === 'function') window.modal(title, body, ok, cancel, okLabel);
    else if (ok) ok();
  }

  // ---- 初期化 ---------------------------------------------------------
  function init() {
    if (!isApp) { log('browser mode'); return Promise.resolve(); }
    AdMob = C.Plugins.AdMob;
    Haptics = C.Plugins.Haptics || null;
    Share = C.Plugins.Share || null;
    InAppReview = C.Plugins.InAppReview || null;
    // 順番が重要: ATTの許可ダイアログ → AdMob初期化 → 課金初期化
    return requestATT().then(initAds).then(initIAP).catch(function (e) { log('init error', e); });
  }

  /* ---- ATT(トラッキングの許可) --------------------------------------
   * @capacitor-community/admob 7系では initialize() の
   * requestTrackingAuthorization オプションが廃止されている。
   * AdMob.requestTrackingAuthorization() を自分で呼ばないとダイアログは出ない。
   * (1.0(4) がガイドライン2.1で差し戻された原因。2026-09-23)
   *
   * さらに iOS はアプリがアクティブになる前に要求すると、ダイアログを出さずに
   * 黙って拒否する。画面が表示されてから少し待って呼ぶこと。          */
  function whenActive() {
    return new Promise(function (resolve) {
      var done = false;
      var fire = function () {
        if (done) return; done = true;
        document.removeEventListener('visibilitychange', onVis);
        setTimeout(resolve, 800); // スプラッシュが消えてアクティブになるのを待つ
      };
      var onVis = function () { if (document.visibilityState === 'visible') fire(); };
      if (document.visibilityState === 'visible') { fire(); return; }
      document.addEventListener('visibilitychange', onVis);
      setTimeout(fire, 5000); // 保険
    });
  }

  function attStatus() {
    if (!AdMob || !AdMob.trackingAuthorizationStatus) return Promise.resolve(null);
    return AdMob.trackingAuthorizationStatus().catch(function () { return null; });
  }

  function requestATT() {
    if (!AdMob || !AdMob.requestTrackingAuthorization) return Promise.resolve();
    return whenActive()
      .then(attStatus)
      .then(function (r) {
        var st = r && r.status;
        log('ATT status', st);
        if (st && st !== 'notDetermined') return; // 回答済みなら出さない
        return AdMob.requestTrackingAuthorization();
      })
      .then(attStatus)
      .then(function (r) {
        // 要求が届かず未回答のままなら、もう一度だけ出し直す
        if (r && r.status === 'notDetermined') {
          return new Promise(function (res) { setTimeout(res, 2000); })
            .then(function () { return AdMob.requestTrackingAuthorization(); })
            .then(attStatus);
        }
        return r;
      })
      .then(function (r) { log('ATT result', r && r.status); })
      .catch(function (e) { log('ATT error', e); });
  }

  function initAds() {
    if (!AdMob) return Promise.resolve();
    return AdMob.initialize({
      initializeForTesting: IS_TESTING
    }).then(function () {
      log('admob ready');
      if (!premium) prepareInterstitial();
    });
  }

  function prepareInterstitial() {
    if (!AdMob || premium) return;
    AdMob.prepareInterstitial({ adId: AD_IDS.interstitial, isTesting: IS_TESTING })
      .then(function () { interstitialReady = true; })
      .catch(function (e) { interstitialReady = false; log('interstitial prepare failed', e); });
  }

  // ---- 課金 -----------------------------------------------------------
  // GRID HUNTER が審査で却下された原因(商品が取れていない状態で購入シートを出した)を避けるため、
  // 必ず deviceready を待ってから初期化し、購入時に商品が無ければ取り直す。
  var storeReady = false;
  function initIAP() {
    if (!isApp) return Promise.resolve();
    return new Promise(function (resolve) {
      var started = false;
      var start = function () {
        if (started) return; started = true;
        try {
          var CP = window.CdvPurchase;
          if (!CP) { log('CdvPurchase not found'); return resolve(); }
          var store = CP.store;
          store.register([{
            id: PRODUCT_ID,
            type: CP.ProductType.NON_CONSUMABLE,
            platform: CP.Platform.APPLE_APPSTORE
          }]);
          // ★アプリ本体のレシートも approved として流れてくるので、
          //   購入商品(PRODUCT_ID)を含むものだけを扱う(2026-10-04 支払い前に購入済みになる不具合の修正)
          store.when()
            .approved(function (t) { if (hasProduct(t)) t.verify(); })
            .verified(function (r) { r.finish(); syncOwnership(); })
            .finished(function (t) { if (hasProduct(t)) setPremium(true); })
            .receiptUpdated(function () { syncOwnership(); });
          store.error(function (e) { log('store error', e && e.message); });
          store.initialize([CP.Platform.APPLE_APPSTORE]).then(function () {
            storeReady = true; syncOwnership(); resolve();
          });
        } catch (e) { log('iap init error', e); resolve(); }
      };
      document.addEventListener('deviceready', start, { once: true });
      setTimeout(start, 2500); // 保険(deviceready が来ないケース)
    });
  }

  function hasProduct(t) {
    try { return !!(t && t.products && t.products.some(function (x) { return x.id === PRODUCT_ID; })); }
    catch (e) { return false; }
  }

  function syncOwnership() {
    try {
      var CP = window.CdvPurchase;
      if (!CP) return;
      if (CP.store.owned(PRODUCT_ID)) setPremium(true);
    } catch (e) {}
  }

  function setPremium(v) {
    if (premium === v) return;
    premium = v;
    try { localStorage.setItem('pr_premium', v ? '1' : '0'); } catch (e) {}
    if (v) { banner(false); }
    if (typeof window.onPremiumChanged === 'function') window.onPremiumChanged(v);
  }

  function buyPremium() {
    if (!isApp) { pseudo('アプリ版で購入できます', '広告削除 ¥300(買い切り)。ブラウザ版では購入できません。'); return; }
    try {
      var CP = window.CdvPurchase, store = CP.store;
      var p = store.get(PRODUCT_ID, CP.Platform.APPLE_APPSTORE);
      if (!p || !p.getOffer()) {
        // 商品が取れていない → 取り直してから注文(取れなければ購入シートを出さない)
        store.update().then(function () {
          var q = store.get(PRODUCT_ID, CP.Platform.APPLE_APPSTORE);
          if (q && q.getOffer()) q.getOffer().order();
          else pseudo('しばらくしてからお試しください', '商品情報を取得できませんでした。通信環境をご確認ください。');
        });
        return;
      }
      p.getOffer().order();
    } catch (e) { log('buy error', e); }
  }

  function restore() {
    if (!isApp) { pseudo('アプリ版で復元できます', 'ブラウザ版では購入の復元はできません。'); return; }
    try {
      window.CdvPurchase.store.restorePurchases().then(function () {
        syncOwnership();
        pseudo('購入の復元', premium ? '広告削除を復元しました。' : '復元できる購入はありませんでした。');
      });
    } catch (e) { log('restore error', e); }
  }

  // ---- 広告の表示 -----------------------------------------------------
  function banner(show) {
    if (!isApp || !AdMob) return;
    if (premium || !show) {
      if (bannerShown) { AdMob.hideBanner().catch(function () {}); bannerShown = false; }
      return;
    }
    if (bannerShown) return;
    bannerShown = true;
    AdMob.showBanner({
      adId: AD_IDS.banner,
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: 0,
      isTesting: IS_TESTING
    }).catch(function (e) { bannerShown = false; log('banner failed', e); });
  }

  // 結果画面から次へ進むときだけ表示。測定中は絶対に呼ばない(測定と体験を守るため)
  function interstitial(then) {
    then = then || function () {};
    if (!isApp || !AdMob || premium || !interstitialReady) { then(); return; }
    interstitialReady = false;
    AdMob.showInterstitial()
      .then(function () { prepareInterstitial(); then(); })
      .catch(function (e) { log('interstitial failed', e); prepareInterstitial(); then(); });
  }

  // ---- 振動 -----------------------------------------------------------
  // kind: 'light' | 'heavy' | 'success'。ブラウザでは navigator.vibrate(Androidのみ効く)
  function haptic(kind) {
    try {
      if (Haptics) {
        if (kind === 'success') Haptics.notification({ type: 'SUCCESS' }).catch(function () {});
        else Haptics.impact({ style: kind === 'heavy' ? 'HEAVY' : 'LIGHT' }).catch(function () {});
      } else if (navigator.vibrate) {
        navigator.vibrate(kind === 'heavy' ? 40 : 12);
      }
    } catch (e) {}
  }

  // ---- シェア ---------------------------------------------------------
  // ★App Storeで公開されたら APP_STORE_ID を入れると、シェア文にダウンロードURLが付く
  var APP_STORE_ID = '6818035906';
  function share(text) {
    var url = APP_STORE_ID ? 'https://apps.apple.com/jp/app/id' + APP_STORE_ID : '';
    var full = url ? text + '\n' + url : text;
    if (Share) {
      Share.share({ text: text, url: url || undefined, dialogTitle: '結果をシェア' }).catch(function () {});
      return;
    }
    if (navigator.share) { navigator.share({ text: full }).catch(function () {}); return; }
    try {
      navigator.clipboard.writeText(full).then(function () {
        pseudo('コピーしました', 'SNSに貼り付けてシェアしてください。\n\n' + full);
      }, function () { pseudo('シェア', full); });
    } catch (e) { pseudo('シェア', full); }
  }

  // ---- レビュー依頼 ---------------------------------------------------
  // SKStoreReviewController。実際に出すかどうか・回数(年3回まで)はiOSが決める
  var reviewAsked = false;
  function requestReview() {
    if (!InAppReview || reviewAsked) return;
    reviewAsked = true;
    setTimeout(function () { InAppReview.requestReview().catch(function () {}); }, 1200);
  }

  window.Native = {
    isApp: isApp,
    init: init,
    banner: banner,
    interstitial: interstitial,
    haptic: haptic,
    share: share,
    requestReview: requestReview,
    buyPremium: buyPremium,
    restore: restore,
    isPremium: function () { return premium; }
  };
})();
