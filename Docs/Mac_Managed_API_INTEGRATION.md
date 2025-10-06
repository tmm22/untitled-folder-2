# macOS App: Managed Provisioning Integration Guide

This guide explains how to hook the macOS Text-to-Speech app into the managed API service that already powers the
web client. Follow the checklist in order—each section references the files you need to touch.

## 1. Prerequisites
- Managed backend deployed (Convex + provisioning/billing endpoints) and reachable over HTTPS.
- `CONVEX_URL`, `CONVEX_ADMIN_KEY`, and optional Stripe vars populated in `web/.env.local` so the web app can issue
  credentials for desktop clients.
- A dedicated account identifier for the macOS client (e.g., generated from the web dashboard) with plan tier/status set
  to allow provisioning.

## 2. High-Level Architecture
```
macOS App ─┬─▶ ManagedProvisioningClient ──▶ /api/account         (hydrate plan status)
           ├─▶ ManagedProvisioningClient ──▶ /api/provisioning/token
           └─▶ Provider Services (OpenAI/ElevenLabs/Google)
                   ▲                │
                   │                └─ inject managed credentials when Keychain has no key
                   └── Playback / ViewModel (unchanged UI flow)
```

Key ideas:
1. The mac app asks the managed backend for plan + token data instead of relying solely on local API keys.
2. Existing provider services (`OpenAIService`, `ElevenLabsService`, `GoogleTTSService`) fall back to managed credentials
   when the Keychain is empty or the user explicitly opts in.
3. A small settings pane lets users paste the managed account ID/base URL, and (optionally) log out / clear tokens.

## 3. New Support Types
Create the following helpers under `Sources/`.

### 3.1 `Sources/Models/ManagedProvisioningModels.swift`
```swift
struct ManagedAccountSnapshot: Codable {
    let userId: String
    let planTier: String
    let billingStatus: String
    let premiumExpiresAt: Date?
    let usage: UsageSnapshot?

    struct UsageSnapshot: Codable {
        let monthTokensUsed: Int
        let monthlyAllowance: Int
        let lastUpdated: Date
    }
}

struct ManagedCredential: Codable {
    let credentialId: String
    let token: String
    let expiresAt: Date
    let providerReference: String?
}
```

### 3.2 `Sources/Services/ManagedProvisioningClient.swift`
```swift
final class ManagedProvisioningClient {
    struct Configuration {
        var baseURL: URL
        var accountId: String
        var planTier: String
        var planStatus: String
    }

    private let configStore = ManagedProvisioningPreferences.shared
    private let session: URLSession

    init(session: URLSession = SecureURLSession.makeEphemeral()) {
        self.session = session
    }

    func currentConfiguration() -> Configuration? {
        return configStore.currentConfiguration
    }

    func updateConfiguration(_ configuration: Configuration?) {
        configStore.currentConfiguration = configuration
    }

    func fetchAccountSnapshot() async throws -> ManagedAccountSnapshot {
        guard let configuration = configStore.currentConfiguration else {
            throw ProvisioningError.missingConfiguration
        }

        var request = URLRequest(url: configuration.baseURL.appendingPathComponent("api/account"))
        request.httpMethod = "GET"
        request.setValue(configuration.accountId, forHTTPHeaderField: "x-account-id")
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw ProvisioningError.invalidResponse
        }
        return try JSONDecoder().decode(ManagedAccountSnapshot.self, from: data)
    }

    func issueCredential(for provider: Voice.ProviderType) async throws -> ManagedCredential {
        guard let configuration = configStore.currentConfiguration else {
            throw ProvisioningError.missingConfiguration
        }

        var request = URLRequest(url: configuration.baseURL.appendingPathComponent("api/provisioning/token"))
        request.httpMethod = "POST"
        request.setValue(configuration.accountId, forHTTPHeaderField: "x-account-id")
        request.setValue(configuration.planTier, forHTTPHeaderField: "x-plan-tier")
        request.setValue(configuration.planStatus, forHTTPHeaderField: "x-plan-status")
        request.httpBody = try JSONEncoder().encode(["provider": provider.rawValue.lowercased()])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw ProvisioningError.invalidResponse
        }
        return try JSONDecoder().decode(ManagedCredential.self, from: data)
    }

    enum ProvisioningError: Error, LocalizedError {
        case missingConfiguration
        case invalidResponse

        var errorDescription: String? {
            switch self {
            case .missingConfiguration: return "Managed provisioning is not configured."
            case .invalidResponse: return "Provisioning service returned an unexpected response."
            }
        }
    }
}
```

### 3.3 `Sources/Utilities/ManagedProvisioningPreferences.swift`
```swift
final class ManagedProvisioningPreferences {
    static let shared = ManagedProvisioningPreferences()

    private enum Keys {
        static let baseURL = "managedProvisioning.baseURL"
        static let accountId = "managedProvisioning.accountId"
        static let planTier = "managedProvisioning.planTier"
        static let planStatus = "managedProvisioning.planStatus"
    }

    var currentConfiguration: ManagedProvisioningClient.Configuration? {
        get {
            guard let baseURLString = UserDefaults.standard.string(forKey: Keys.baseURL),
                  let baseURL = URL(string: baseURLString),
                  let accountId = UserDefaults.standard.string(forKey: Keys.accountId),
                  let planTier = UserDefaults.standard.string(forKey: Keys.planTier),
                  let planStatus = UserDefaults.standard.string(forKey: Keys.planStatus) else {
                return nil
            }
            return .init(baseURL: baseURL, accountId: accountId, planTier: planTier, planStatus: planStatus)
        }
        set {
            if let newValue {
                UserDefaults.standard.set(newValue.baseURL.absoluteString, forKey: Keys.baseURL)
                UserDefaults.standard.set(newValue.accountId, forKey: Keys.accountId)
                UserDefaults.standard.set(newValue.planTier, forKey: Keys.planTier)
                UserDefaults.standard.set(newValue.planStatus, forKey: Keys.planStatus)
            } else {
                UserDefaults.standard.removeObject(forKey: Keys.baseURL)
                UserDefaults.standard.removeObject(forKey: Keys.accountId)
                UserDefaults.standard.removeObject(forKey: Keys.planTier)
                UserDefaults.standard.removeObject(forKey: Keys.planStatus)
            }
        }
    }
}
```

## 4. Provider Updates

Modify each service (`OpenAIService`, `ElevenLabsService`, `GoogleTTSService`) to:

1. Accept a `ManagedProvisioningClient` dependency (default to shared instance).
2. Before throwing `invalidAPIKey`, attempt to:
   - Request a managed credential (`issueCredential(for:)`).
   - Cache the returned token in memory while `expiresAt` is in the future.
   - Use `Authorization: Bearer <token>` when making API calls.
3. When a manual API key is saved (via settings), prefer the Keychain value over managed credentials.

Pseudocode diff inside `synthesizeSpeech`:
```swift
if apiKey == nil {
    if let managedToken = try await provisioningClient.obtainToken(for: .openAI) {
        activeManagedToken = managedToken
    } else {
        throw TTSError.invalidAPIKey
    }
}

let authToken = apiKey ?? activeManagedToken?.token
request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
```

Remember to clear `activeManagedToken` when the request fails with 401 so the client re-issues a token next time.

## 5. View Model Wiring

In `TTSViewModel`:
1. Hold a reference to `ManagedProvisioningClient` and expose a `@Published var managedAccount: ManagedAccountSnapshot?`.
2. During app launch (e.g., `onAppear` in root view), call `fetchAccountSnapshot()` to populate plan info.
3. Surface plan summary + usage meters in the settings window (similar to the web `PremiumDashboard`).
4. Offer a toggle/button to “Use managed credentials when available”. When enabled, the view model tells each provider to prefer managed tokens (`provider.useManagedCredentials = true`).

## 6. Settings UI

Add a new section in `SettingsView.swift` allowing users to:
- Enter the provisioning base URL and account ID.
- See their current plan tier/status.
- Refresh usage or sign out (clear preferences + managed tokens).

Example SwiftUI snippet:
```swift
Section("Managed Provisioning") {
    TextField("Base URL", text: $settings.baseURL)
    TextField("Account ID", text: $settings.accountId)
    Picker("Plan Tier", selection: $settings.planTier) { ... }
    Picker("Plan Status", selection: $settings.planStatus) { ... }

    Button("Refresh Account") { Task { await viewModel.refreshManagedAccount() } }
    Button("Sign Out", role: .destructive) { viewModel.clearManagedProvisioning() }
}
```

## 7. Error Handling & Offline Behavior
- If the provisioning service is unreachable, display an inline warning (“Managed provisioning is unavailable; falling back to local keys”).
- Cache the last successful managed token so short outages do not block synthesis.
- Continue supporting manual API keys in Keychain; users can mix-and-match per provider.

## 8. Testing Checklist
- [ ] With Keychain empty and managed credentials set, synthesize speech for all providers.
- [ ] Invalidate the managed token on the server; confirm the mac app re-issues a fresh token automatically.
- [ ] Toggle managed provisioning off; verify the UI requires manual keys again.
- [ ] Offline mode: disconnect network, ensure existing managed token is used until it expires.

## 9. Deployment Notes
- Ensure the macOS bundle includes updated privacy strings if new network domains are contacted.
- If distributing outside the App Store, audit that managed credentials never persist to disk (use Keychain + memory only).
- The backend should enforce TLS and rate limiting per account ID to protect the shared pool of tokens.

---

With these building blocks in place, the mac app mirrors the managed experience of the web client: desktop users without
personal API keys can subscribe, fetch managed credentials, and synthesize speech seamlessly.
