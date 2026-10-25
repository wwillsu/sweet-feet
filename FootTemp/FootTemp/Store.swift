import Foundation
import Observation

/// Polls the Convex backend once per second, fetching only what the visible tab shows.
/// The Daily tracker falls back to the bundled SavedData, so it works without the backend.
@MainActor
@Observable
final class Store {
    enum Tab: Hashable { case tracker, live }

    /// Set at build time from Config.xcconfig (scripts/configure.sh writes this Mac's Wi-Fi address).
    static let defaultURL: String = {
        let value = (Bundle.main.object(forInfoDictionaryKey: "ConvexURL") as? String) ?? ""
        return value.hasPrefix("http") ? value : "http://127.0.0.1:3210"
    }()
    private static let urlKey = "serverURL"

    private(set) var serverURL = UserDefaults.standard.string(forKey: Store.urlKey) ?? Store.defaultURL
    var tab: Tab = .tracker {
        didSet { if tab != oldValue { refreshNow() } }
    }
    var selectedProfile: String? {
        didSet { if selectedProfile != oldValue { refreshNow() } }
    }

    /// One entry per profile: bundled ones always, plus anything Convex has.
    struct Profile: Identifiable {
        let id: String
        let updatedAt: Double?  // nil = bundled only
        let worstTier: Tier
    }

    private(set) var remoteProfiles: [ProfileSummary]?
    private var remotePatient: PatientData?
    private(set) var live: [LiveSample]?
    private(set) var lastError: String?
    private(set) var lastSuccess: Date?

    private var loop: Task<Void, Never>?

    init() {
        #if DEBUG
        // Screenshot hooks for simulator checks: SIMCTL_CHILD_FT_TAB=live, SIMCTL_CHILD_FT_PROFILE=S1_hotspot
        let env = ProcessInfo.processInfo.environment
        if env["FT_TAB"] == "live" { tab = .live }
        selectedProfile = env["FT_PROFILE"]
        #endif
    }

    var profiles: [Profile] {
        var byId: [String: Profile] = [:]
        for p in SavedData.shared.patients {
            byId[p.patientId] = Profile(id: p.patientId, updatedAt: nil, worstTier: SavedData.shared.worstTier(p.patientId))
        }
        for p in remoteProfiles ?? [] {
            byId[p.patientId] = Profile(id: p.patientId, updatedAt: p.updatedAt, worstTier: p.worstTier)
        }
        return byId.values.sorted { $0.id < $1.id }
    }

    /// The profile on screen: the user's pick, else "me", else the first one.
    var currentProfile: String? {
        let list = profiles
        if let id = selectedProfile, list.contains(where: { $0.id == id }) { return id }
        return list.first(where: { $0.id == "me" })?.id ?? list.first?.id
    }

    /// Convex wins when it has this profile; otherwise (offline, or never pushed) the bundled data.
    var patient: PatientData? {
        guard let id = currentProfile else { return nil }
        if let remote = remotePatient, remote.info.patientId == id { return remote }
        return SavedData.shared.patient(id)
    }

    var isUsingDefaultURL: Bool { serverURL == Store.defaultURL }

    func start() {
        loop?.cancel()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(CONFIG.liveDemo.intervalS))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    func refreshNow() {
        Task { await refresh() }
    }

    /// Returns an error message, or nil if the address was accepted.
    func setServerURL(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: value), let scheme = url.scheme, ["http", "https"].contains(scheme), url.host != nil else {
            return "Enter a full address, e.g. http://192.168.1.20:3210"
        }
        serverURL = value
        if value == Store.defaultURL {
            UserDefaults.standard.removeObject(forKey: Store.urlKey)
        } else {
            UserDefaults.standard.set(value, forKey: Store.urlKey)
        }
        remoteProfiles = nil
        remotePatient = nil
        live = nil
        lastError = nil
        lastSuccess = nil
        start()
        return nil
    }

    private func refresh() async {
        guard let url = URL(string: serverURL) else {
            lastError = "Invalid server address."
            return
        }
        let api = ConvexAPI(baseURL: url)
        do {
            switch tab {
            case .tracker:
                remoteProfiles = try await api.query("dashboard:overview") ?? []
                if let id = currentProfile {
                    let data: PatientData? = try await api.query("dashboard:patient", ["patientId": id])
                    if id == currentProfile { remotePatient = data }  // ignore a reply for a profile we've left
                }
            case .live:
                live = try await api.query("dashboard:live", ["seconds": CONFIG.liveDemo.historyS]) ?? []
            }
            lastError = nil
            lastSuccess = .now
        } catch is CancellationError {
            return
        } catch {
            lastError = error.localizedDescription
        }
    }
}
