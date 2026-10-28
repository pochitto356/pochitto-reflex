// ぽちっと反射神経 — Game Center(全国ランキング)をJSから使うためのアプリ内プラグイン
// JS側: window.Capacitor.Plugins.GameCenter（www/native.js の gcSignIn / gcSubmit / gcRank / gcShow）
// Codemagic のビルドで ios/App/App にコピーし、MainViewController で登録する。
import Foundation
import UIKit
import Capacitor
import GameKit

@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadMyRank", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise)
    ]

    private var handlerSet = false
    private var signInVC: UIViewController?
    private var waiting: [CAPPluginCall] = []

    private func finishWaiting() {
        let ok = GKLocalPlayer.local.isAuthenticated
        let calls = waiting
        waiting = []
        for c in calls { c.resolve(["authenticated": ok]) }
    }

    private func present(_ vc: UIViewController) {
        DispatchQueue.main.async {
            guard let root = self.bridge?.viewController else { return }
            var top = root
            while let p = top.presentedViewController { top = p }
            top.present(vc, animated: true)
        }
    }

    // present=false: サインイン画面は出さずに状態だけ返す(起動時)
    // present=true : 未サインインならサインイン画面を出す(ランキングを押したとき)
    @objc func signIn(_ call: CAPPluginCall) {
        let wantPresent = call.getBool("present") ?? false
        if GKLocalPlayer.local.isAuthenticated { call.resolve(["authenticated": true]); return }
        if handlerSet {
            if wantPresent, let vc = signInVC {
                // サインイン画面を閉じたあとに結果が handler に届く
                waiting.append(call)
                present(vc)
            } else {
                call.resolve(["authenticated": false])
            }
            return
        }
        handlerSet = true
        waiting.append(call)
        DispatchQueue.main.async {
            GKLocalPlayer.local.authenticateHandler = { [weak self] vc, error in
                guard let self = self else { return }
                if let vc = vc {
                    self.signInVC = vc
                    if wantPresent && !self.waiting.isEmpty { self.present(vc); return }
                    self.finishWaiting()
                    return
                }
                self.signInVC = nil
                self.finishWaiting()
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId"), let score = call.getInt("score") else { call.reject("missing args"); return }
        guard GKLocalPlayer.local.isAuthenticated else { call.reject("not authenticated"); return }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    // 自分の順位と参加人数(定期リセットのランキングは「今回」の分)
    @objc func loadMyRank(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId") else { call.reject("missing id"); return }
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve([:]); return }
        GKLeaderboard.loadLeaderboards(IDs: [id]) { boards, error in
            guard let board = boards?.first else { call.resolve([:]); return }
            board.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: 1, length: 1)) { local, _, total, _ in
                if let local = local {
                    call.resolve(["rank": local.rank, "total": total, "score": local.score])
                } else {
                    call.resolve(["total": total])
                }
            }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let id = call.getString("leaderboardId") ?? ""
        DispatchQueue.main.async {
            let vc: GKGameCenterViewController
            if id.isEmpty {
                vc = GKGameCenterViewController(state: .leaderboards)
            } else {
                vc = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            }
            vc.gameCenterDelegate = self
            self.present(vc)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
