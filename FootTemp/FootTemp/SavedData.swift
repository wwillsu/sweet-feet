import Foundation

/// Daily tracker data bundled with the app (dashboard.json, built by `python -m pipeline.export_static`
/// and copied in by scripts/configure.sh), so the tracker works without the backend.
/// Convex data for the same profile takes precedence.
struct SavedData: Decodable {
    struct Patient: Decodable {
        let patientId: String
        let description: String
    }

    let patients: [Patient]
    let daily: [DailyRow]
    let sensors: [SensorRow]

    static let shared: SavedData = {
        guard let url = Bundle.main.url(forResource: "dashboard", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let saved = try? JSONDecoder().decode(SavedData.self, from: data)
        else { return SavedData(patients: [], daily: [], sensors: []) }
        return saved
    }()

    func patient(_ id: String) -> PatientData? {
        guard let p = patients.first(where: { $0.patientId == id }) else { return nil }
        return PatientData(info: .init(patientId: id, description: p.description, updatedAt: nil),
                           daily: daily.filter { $0.patientId == id },
                           sensors: sensors.filter { $0.patientId == id })
    }

    /// Worst tier on the profile's most recent day, for the profile picker.
    func worstTier(_ id: String) -> Tier {
        let rows = daily.filter { $0.patientId == id }
        guard let latest = rows.map(\.date).max() else { return .noData }
        return rows.filter { $0.date == latest }.map(\.tier).max() ?? .noData
    }
}
