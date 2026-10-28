// Capacitor のメイン画面。アプリ内プラグイン(GameCenterPlugin)をここで登録する。
// Main.storyboard の customClass を CAPBridgeViewController → MainViewController に差し替えて使う(codemagic.yaml)。
import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }
}
