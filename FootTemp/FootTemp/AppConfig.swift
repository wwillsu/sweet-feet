import Foundation

/// Thresholds from config.json, a copy of ../foot-ulcer-ews/config.json (the single source of truth).
/// Run scripts/configure.sh to re-sync it.
struct AppConfig: Decodable {
    struct Clinical: Decodable {
        let warningC: Double
        let alertC: Double
        let alertConsecutiveDays: Int

        enum CodingKeys: String, CodingKey {
            case warningC = "warning_c", alertC = "alert_c", alertConsecutiveDays = "alert_consecutive_days"
        }
    }

    struct LiveDemo: Decodable {
        let intervalS: Double
        let alertConsecutiveSamples: Int
        let historyS: Double

        enum CodingKeys: String, CodingKey {
            case intervalS = "interval_s", alertConsecutiveSamples = "alert_consecutive_samples", historyS = "history_s"
        }
    }

    let clinical: Clinical
    let sites: [String]
    let siteLabels: [String: String]
    let liveDemo: LiveDemo

    enum CodingKeys: String, CodingKey {
        case clinical, sites, siteLabels = "site_labels", liveDemo = "live_demo"
    }

    static let shared: AppConfig = {
        guard let url = Bundle.main.url(forResource: "config", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let config = try? JSONDecoder().decode(AppConfig.self, from: data)
        else { fatalError("config.json is missing from the app bundle or malformed") }
        return config
    }()
}

let CONFIG = AppConfig.shared
