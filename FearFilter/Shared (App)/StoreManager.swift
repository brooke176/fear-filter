//
//  StoreManager.swift
//  Shared (App)
//
//  Handles StoreKit 2 in-app purchases for Fear Filter Pro.
//  Pro status is written to an App Group so the Safari extension can read it.
//

import StoreKit
import Foundation
import Combine

@MainActor
class StoreManager: ObservableObject {

    static let shared = StoreManager()

    // ── IDs ───────────────────────────────────────────────────────────────────
    // Create this product in App Store Connect → your app → In-App Purchases.
    // Type: Non-Consumable. Product ID must match exactly.
    static let productID  = "com.brookeskinner.fearfilter.pro"

    // Must match the App Group you add under Signing & Capabilities
    // for BOTH the App target and the Extension target.
    static let appGroupID = "group.com.brookeskinner.fearfilter"
    static let proKey     = "isPro"

    // ── Published state ───────────────────────────────────────────────────────
    @Published private(set) var isPro:     Bool = false
    @Published private(set) var isLoading: Bool = false

    // ── Init ──────────────────────────────────────────────────────────────────
    private init() {
        // Restore cached value so the UI is correct before the async check finishes
        isPro = UserDefaults(suiteName: Self.appGroupID)?.bool(forKey: Self.proKey) ?? false

        Task { await listenForTransactionUpdates() }
        Task { await refreshEntitlements() }
    }

    // ── Transaction listener (handles renewals, revocations, other-device purchases) ──
    private func listenForTransactionUpdates() async {
        for await result in Transaction.updates {
            await process(verificationResult: result)
        }
    }

    // ── Check current entitlements ────────────────────────────────────────────
    func refreshEntitlements() async {
        for await result in Transaction.currentEntitlements {
            if case .verified(let tx) = result,
               tx.productID == Self.productID,
               tx.revocationDate == nil {
                setProStatus(true)
                return
            }
        }
    }

    // ── Purchase ──────────────────────────────────────────────────────────────
    /// Returns true if the purchase succeeded, false if cancelled/pending.
    /// Throws on hard errors (network, billing, etc.).
    func purchase() async throws -> Bool {
        isLoading = true
        defer { isLoading = false }

        let products = try await Product.products(for: [Self.productID])
        guard let product = products.first else {
            throw StoreError.productNotFound
        }

        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            guard case .verified(let tx) = verification else {
                throw StoreError.failedVerification
            }
            setProStatus(true)
            await tx.finish()
            return true
        case .userCancelled:
            return false
        case .pending:
            return false
        @unknown default:
            return false
        }
    }

    // ── Restore ───────────────────────────────────────────────────────────────
    /// Syncs with the App Store and refreshes entitlements.
    /// Returns true if the user already owns Pro.
    func restorePurchases() async throws -> Bool {
        isLoading = true
        defer { isLoading = false }

        try await AppStore.sync()
        await refreshEntitlements()
        return isPro
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private func process(verificationResult: VerificationResult<Transaction>) async {
        guard case .verified(let tx) = verificationResult else { return }
        if tx.productID == Self.productID {
            setProStatus(tx.revocationDate == nil)
        }
        await tx.finish()
    }

    /// Writes to both the in-memory @Published var and the App Group UserDefaults
    /// so the Safari extension can read the value via SafariWebExtensionHandler.
    private func setProStatus(_ value: Bool) {
        isPro = value
        UserDefaults(suiteName: Self.appGroupID)?.set(value, forKey: Self.proKey)
    }

    // ── Errors ────────────────────────────────────────────────────────────────
    enum StoreError: LocalizedError {
        case productNotFound
        case failedVerification

        var errorDescription: String? {
            switch self {
            case .productNotFound:   return "Fear Filter Pro is not available right now. Try again later."
            case .failedVerification: return "Purchase verification failed. Please try restoring purchases."
            }
        }
    }
}

