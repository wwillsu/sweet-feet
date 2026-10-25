import SwiftUI

private let advice: [Tier: String] = [
    .warning: "One warm day is often nothing (a knock, a long walk). Keep wearing the insoles and see if it settles tomorrow.",
    .alert: "The same spot has stayed warmer for several days in a row. Look at that part of your foot today and contact your care team if you see redness, swelling or a wound.",
]

/// Personal tracker: one person's daily resting left/right comparison.
/// Works offline on the bundled data; Convex data replaces it per profile when reachable.
struct TrackerView: View {
    @Environment(Store.self) private var store
    @State private var pinned: String?  // nil = follow the newest day as data streams in
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ConnectionBanner(showSettings: $showSettings, subtle: true)
                    content
                }
                .padding(16)
                .debugScrollTarget(proxy)
            }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Daily tracker")
            .toolbar { SettingsToolbar(showSettings: $showSettings) }
            .sheet(isPresented: $showSettings) { SettingsView() }
        }
    }

    @ViewBuilder private var content: some View {
        if let data = store.patient {
            tracker(data)
        } else {
            ContentUnavailableView {
                Label("No readings yet", systemImage: "shoeprints.fill")
            } description: {
                Text("Rebuild the bundled data (then re-run scripts/configure.sh), or push pipeline results to Convex, from the foot-ulcer-ews folder.")
            } actions: {
                CommandText(text: ".venv/bin/python -m pipeline.export_static\n.venv/bin/python -m pipeline.push_convex")
            }
        }
    }

    @ViewBuilder private func tracker(_ data: PatientData) -> some View {
        let daily = data.daily
        let sensors = data.sensors
        let dates = Array(Set(daily.map(\.date))).sorted()

        ProfilePicker(profiles: store.profiles, current: store.currentProfile ?? "") { id in
            pinned = nil
            store.selectedProfile = id
        }

        if let latest = dates.last {
            let sel = pinned.flatMap { dates.contains($0) ? $0 : nil } ?? latest
            let idx = dates.firstIndex(of: sel) ?? 0
            let today = daily.filter { $0.date == sel }
            let top = largestDelta(today)
            let flagged = today.filter(\.tier.isFlagged).sorted { $0.tier > $1.tier }
            let streak = CONFIG.sites.map { s in alertStreak(daily.filter { $0.site == s }, upTo: sel) }.max() ?? 0
            let okSensors = sensors.filter { $0.status == .ok }.count
            let select = { (d: String) in pinned = d == latest ? nil : d }

            header(data.info, title: sel == latest ? "Your feet today" : "Your feet on \(fmtNightShort(sel))")

            HStack {
                Button { select(dates[max(0, idx - 1)]) } label: { Image(systemName: "chevron.left") }
                    .disabled(idx == 0)
                    .accessibilityLabel("Previous day")
                Spacer()
                VStack(spacing: 1) {
                    Text(fmtNightShort(sel)).font(.subheadline.weight(.semibold))
                    Text("day \(idx + 1) of \(dates.count)").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button { select(dates[min(dates.count - 1, idx + 1)]) } label: { Image(systemName: "chevron.right") }
                    .disabled(sel == latest)
                    .accessibilityLabel("Next day")
            }
            .font(.title3.weight(.semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))

            if pinned != nil {
                Button("Jump to latest") { pinned = nil }
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
            }

            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    Tile(label: "How things look",
                         sub: flagged.isEmpty ? "left and right feet match"
                            : "\(flagged.count) spot\(flagged.count > 1 ? "s" : "") to watch") {
                        StatusBadge(status: worstTier(today), large: true)
                    }
                    Tile(label: "Biggest left–right difference",
                         sub: top.map { "\(siteLabel($0.site)) · \(warmerFoot($0.deltaC) ?? "neither") foot warmer" }
                            ?? "no reliable resting data") {
                        Text(top.map { String(format: "%.1f °C", abs($0.deltaC!)) } ?? "—")
                    }
                }
                GridRow {
                    Tile(label: "Days in a row ≥ \(CONFIG.clinical.alertC.formatted()) °C",
                         sub: "\(CONFIG.clinical.alertConsecutiveDays) in a row, same spot and side, means check your feet") {
                        Text("\(streak)")
                    }
                    Tile(label: "Insole sensors working",
                         sub: okSensors == sensors.count ? "all readings look reliable" : "see sensor health below") {
                        Text("\(okSensors) / \(sensors.isEmpty ? 10 : sensors.count)")
                    }
                }
            }

            if let first = flagged.first {
                Callout(color: first.tier.color) {
                    ForEach(flagged) { r in FlagRow(tier: r.tier, text: r.message) }
                    if let text = advice[first.tier] {
                        Text(text).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            Card(title: "Your soles · \(fmtNight(sel))") {
                FootMapView(rows: today)
            }
            .id("map")

            Card(title: "Left − right difference, day by day",
                 subtitle: "Typical temperature while resting each day. Watch at |ΔT| ≥ "
                    + "\(CONFIG.clinical.warningC.formatted()) °C; alert at ≥ \(CONFIG.clinical.alertC.formatted()) °C on "
                    + "\(CONFIG.clinical.alertConsecutiveDays) consecutive days, same site and side. Touch the chart to pick a day.") {
                DeltaChartView(rows: daily, dates: dates, selected: sel, onSelect: select)
            }
            .id("chart")

            Card(title: "Every day", subtitle: "ΔT °C (L − R). Tap a day to select it.") {
                DayGridView(rows: daily, dates: dates, selected: sel, onSelect: select)
                Text("Selected: \(fmtNight(sel)) · rest window "
                     + (today.first?.restStart == nil ? "not found"
                        : "\(clockTime(today.first?.restStart))–\(clockTime(today.first?.restEnd))")
                     + (top.map { " · largest ΔT \(fmtDelta($0.deltaC)) °C" } ?? ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Card(title: "Sensor health") {
                SensorPanelView(sensors: sensors)
            }
            .id("sensors")

            Text("A screening aid, not a diagnosis.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
        } else {
            ContentUnavailableView("No days recorded yet", systemImage: "calendar")
        }
    }

    private func header(_ info: PatientData.Info, title: String) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let age = info.updatedAt.map { context.date.timeIntervalSince1970 - $0 / 1000 }
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.title.weight(.bold))
                Text("Measured while your feet were resting."
                     + (info.patientId != "me" && !info.description.isEmpty ? " Sample data: \(info.description)" : ""))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    Circle().fill(age.map { $0 < 15 } == true ? Palette.good : Color.secondary).frame(width: 7, height: 7)
                    Text(age.map { "Updated \(ago($0))" } ?? "Saved data").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}
