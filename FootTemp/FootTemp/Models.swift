import Foundation

/// Mirrors the tables in ../foot-ulcer-ews/convex/schema.ts, as returned by convex/dashboard.ts
/// and as bundled in dashboard.json (which has no Convex `_id`s, so ids are derived from the keys).

enum Tier: String, Codable, Comparable {
    case noData = "no_data", normal, warning, alert

    var rank: Int {
        switch self {
        case .noData: 0
        case .normal: 1
        case .warning: 2
        case .alert: 3
        }
    }

    var isFlagged: Bool { self == .warning || self == .alert }

    static func < (a: Tier, b: Tier) -> Bool { a.rank < b.rank }
}

enum SensorState: String, Codable {
    case ok, degraded, fault
}

/// Fields the foot map needs: a nightly row or one live reading.
protocol SiteReading {
    var site: String { get }
    var leftC: Double? { get }
    var rightC: Double? { get }
    var deltaC: Double? { get }
    var tier: Tier { get }
    var reason: String { get }
    var restStart: String? { get }
    var restEnd: String? { get }
}

/// One row per (patient, day, site). The day window is [date-1 12:00, date 12:00).
struct DailyRow: Codable, Identifiable, SiteReading {
    let patientId: String
    let date: String
    let site: String
    let leftC: Double?
    let rightC: Double?
    let deltaC: Double?  // left - right
    let tier: Tier
    let reason: String
    let restStart: String?
    let restEnd: String?
    let message: String

    var id: String { "\(patientId)|\(date)|\(site)" }
}

struct SensorRow: Codable, Identifiable {
    let patientId: String
    let foot: String  // "L" or "R"
    let site: String
    let faultFraction: Double
    let nRange: Double
    let nJump: Double
    let nStuck: Double
    let status: SensorState
    let lastFault: String?
    let asOf: String

    var id: String { "\(patientId)|\(foot)|\(site)" }
}

struct LiveSite: Codable, Identifiable, SiteReading {
    let site: String
    let leftC: Double?
    let rightC: Double?
    let deltaC: Double?
    let tier: Tier
    let reason: String

    var id: String { site }
    var restStart: String? { nil }
    var restEnd: String? { nil }
}

struct LiveSample: Codable, Identifiable {
    let id: String
    let t: Double  // ms since epoch
    let sites: [LiveSite]

    var date: Date { Date(timeIntervalSince1970: t / 1000) }

    enum CodingKeys: String, CodingKey { case id = "_id", t, sites }
}

struct ProfileSummary: Codable, Identifiable {
    let patientId: String
    let description: String
    let updatedAt: Double
    let latestDate: String?
    let nDays: Double
    let worstTier: Tier
    let alertSites: [String]
    let maxAbsDelta: Double?
    let maxSite: String?
    let sensorIssues: Double
    let sensorFaults: Double

    var id: String { patientId }
}

struct PatientData: Codable {
    struct Info: Codable {
        let patientId: String
        let description: String
        let updatedAt: Double?  // nil = bundled data, not pushed to Convex
    }
    let info: Info
    let daily: [DailyRow]
    let sensors: [SensorRow]
}
