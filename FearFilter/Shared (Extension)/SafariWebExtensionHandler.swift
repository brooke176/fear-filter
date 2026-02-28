//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Brooke Skinner on 2/19/26.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        // Check IAP status — reads from the App Group shared with the containing app.
        // The popup calls this on load so it can unlock Pro without a license key on Safari.
        let responseBody: [String: Any]
        if let dict = message as? [String: Any], dict["action"] as? String == "checkIAPStatus" {
            let isPro = UserDefaults(suiteName: "group.com.brookeskinner.fearfilter")?
                            .bool(forKey: "isPro") ?? false
            responseBody = ["isPro": isPro]
        } else {
            responseBody = ["echo": message as Any]
        }

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [ SFExtensionMessageKey: responseBody ]
        } else {
            response.userInfo = [ "message": responseBody ]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

}
