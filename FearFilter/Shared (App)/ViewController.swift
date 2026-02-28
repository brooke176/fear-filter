//
//  ViewController.swift
//  Shared (App)
//
//  Created by Brooke Skinner on 2/19/26.
//

import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "com.brookeskinner.fearfilter.Extension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

#if os(iOS)
        self.webView.scrollView.isScrollEnabled = false
#endif

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let isPro = UserDefaults(suiteName: StoreManager.appGroupID)?.bool(forKey: StoreManager.proKey) ?? false

#if os(iOS)
        Task { @MainActor in
            do {
                _ = try await webView.evaluateJavaScript("show('ios', undefined, false, \(isPro))")
            } catch { /* ignore JS errors */ }
        }
#elseif os(macOS)
        Task { @MainActor in
            do { _ = try await webView.evaluateJavaScript("show('mac')") } catch { }
        }

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else { return }

            DispatchQueue.main.async {
                Task { @MainActor in
                    do {
                        if #available(macOS 13, *) {
                            _ = try await webView.evaluateJavaScript("show('mac', \(state.isEnabled), true, \(isPro))")
                        } else {
                            _ = try await webView.evaluateJavaScript("show('mac', \(state.isEnabled), false, \(isPro))")
                        }
                    } catch { }
                }
            }
        }
#endif
    }

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        // IAP actions — shared between iOS and macOS
        switch action {

        case "buy":
            Task { @MainActor in
                do {
                    let purchased = try await StoreManager.shared.purchase()
                    if purchased {
                        _ = try await self.webView.evaluateJavaScript("onIAPResult(true, null)")
                    } else {
                        _ = try await self.webView.evaluateJavaScript("onIAPResult(false, null)")
                    }
                } catch {
                    let msg = error.localizedDescription.replacingOccurrences(of: "'", with: "\\'")
                    try? await self.webView.evaluateJavaScript("onIAPResult(false, '\(msg)')")
                }
            }

        case "restorePurchases":
            Task { @MainActor in
                do {
                    let restored = try await StoreManager.shared.restorePurchases()
                    _ = try await self.webView.evaluateJavaScript("onIAPResult(\(restored), \(restored ? "null" : "'no_purchases'"))")
                } catch {
                    let msg = error.localizedDescription.replacingOccurrences(of: "'", with: "\\'")
                    try? await self.webView.evaluateJavaScript("onIAPResult(false, '\(msg)')")
                }
            }

#if os(macOS)
        case "open-preferences":
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
                guard error == nil else { return }
                DispatchQueue.main.async { NSApp.terminate(self) }
            }

        case "open-url":
            if let urlString = body["url"] as? String, let url = URL(string: urlString) {
                NSWorkspace.shared.open(url)
            }
#endif

        default:
            break
        }
    }

}
