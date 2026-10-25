import Foundation

func siteLabel(_ site: String) -> String { CONFIG.siteLabels[site] ?? site }

/// Display names for the sample profiles (the ids stay as they are in the data and Convex).
private let profileLabels = [
    "me": "My data",
    "P0_control": "Healthy feet",
    "S1_hotspot": "Developing hotspot",
    "S4_sensor_fault": "Faulty sensor",
]

func profileLabel(_ id: String) -> String { profileLabels[id] ?? id }

func shortSite(_ site: String) -> String {
    siteLabel(site).replacingOccurrences(of: " metatarsal head", with: " met. head")
}

/// Signed ΔT with a real minus sign and no "−0.0".
func fmtDelta(_ v: Double?, digits: Int = 1) -> String {
    guard let v else { return "—" }
    let s = String(format: "%.\(digits)f", abs(v))
    if Double(s) == 0 { return s }
    return v > 0 ? "+\(s)" : "−\(s)"
}

func fmtTemp(_ v: Double?) -> String {
    guard let v else { return "—" }
    return String(format: "%.1f °C", v)
}

private let nightParser: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

/// "2026-10-20" -> local midnight of that day.
func nightDate(_ s: String) -> Date { nightParser.date(from: s) ?? .distantPast }

func fmtNight(_ s: String) -> String {
    nightDate(s).formatted(.dateTime.month(.abbreviated).day())
}

func fmtNightShort(_ s: String) -> String {
    nightDate(s).formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
}

func fmtNightLong(_ s: String) -> String {
    nightDate(s).formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
}

/// "2026-10-20 01:35:00" -> "01:35"
func clockTime(_ s: String?) -> String {
    guard let s, s.count >= 16 else { return "—" }
    return String(s.dropFirst(11).prefix(5))
}

func ago(_ seconds: TimeInterval) -> String {
    let s = max(0, Int(seconds.rounded()))
    if s < 60 { return "\(s)s ago" }
    if s < 3600 { return "\(s / 60) min ago" }
    return "\(s / 3600) h ago"
}

func warmerFoot(_ dt: Double?) -> String? {
    guard let dt, dt != 0 else { return nil }
    return dt > 0 ? "left" : "right"
}

func worstTier(_ rows: [some SiteReading]) -> Tier {
    rows.map(\.tier).max() ?? .noData
}

/// The site with the largest |ΔT| among rows that have a value.
func largestDelta<R: SiteReading>(_ rows: [R]) -> R? {
    rows.filter { $0.deltaC != nil }.max { abs($0.deltaC!) < abs($1.deltaC!) }
}

/// Consecutive nights up to `date` with |ΔT| ≥ alert threshold and the same sign.
func alertStreak(_ rows: [DailyRow], upTo date: String) -> Int {
    let byDate = Dictionary(rows.map { ($0.date, $0.deltaC) }, uniquingKeysWith: { a, _ in a })
    var n = 0
    var sign: Double = 0
    var day = nightDate(date)
    while let v = byDate[nightParser.string(from: day)] ?? nil, abs(v) >= CONFIG.clinical.alertC {
        if sign != 0 && (v > 0 ? 1 : -1) != sign { break }
        sign = v > 0 ? 1 : -1
        n += 1
        day = Calendar.current.date(byAdding: .day, value: -1, to: day)!
    }
    return n
}
