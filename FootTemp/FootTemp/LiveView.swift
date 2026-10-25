import SwiftUI

/// Demo mode: a reading every second, compared immediately - the resting rule is switched off.
struct LiveView: View {
    @Environment(Store.self) private var store
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ConnectionBanner(showSettings: $showSettings)
                    content
                }
                .padding(16)
                .debugScrollTarget(proxy)
            }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Live demo")
            .toolbar { SettingsToolbar(showSettings: $showSettings) }
            .sheet(isPresented: $showSettings) { SettingsView() }
        }
    }

    private var banner: some View {
        let c = CONFIG.clinical
        let d = CONFIG.liveDemo
        return Callout(color: .accentColor) {
            (Text("Demo mode · resting rule off. ").bold()
             + Text("Temperature is taken every \(d.intervalS.formatted()) s and compared left vs right straight away. "
                    + "Normally only readings taken while your feet are resting are compared, so walking or touching "
                    + "a sensor here will move the numbers. Alert after \(d.alertConsecutiveSamples) readings in a row "
                    + "at ≥ \(c.alertC.formatted()) °C (instead of \(c.alertConsecutiveDays) days)."))
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var content: some View {
        if let samples = store.live {
            if let cur = samples.last {
                stream(samples, cur)
            } else {
                banner
                ContentUnavailableView {
                    Label("No live readings yet", systemImage: "waveform.path.ecg")
                } description: {
                    Text("Start the live demo from the foot-ulcer-ews folder on the Mac. It connects to the Arduino over Bluetooth and starts tracking.")
                } actions: {
                    CommandText(text: ".venv/bin/python -m pipeline.live              # FootMonitor Arduino\n"
                                + ".venv/bin/python -m pipeline.live --simulate   # no board: simulated insoles")
                }
            }
        } else {
            ProgressView("Connecting…").frame(maxWidth: .infinity).padding(.top, 60)
        }
    }

    @ViewBuilder private func stream(_ samples: [LiveSample], _ cur: LiveSample) -> some View {
        let top = largestDelta(cur.sites)
        let flagged = cur.sites.filter(\.tier.isFlagged).sorted { $0.tier > $1.tier }
        let lastMinute = samples.filter { $0.t > cur.t - 60_000 }.count
        // The Arduino has 3 thermistors, so sites without one report no data.
        let sensorCount = cur.sites.reduce(0) { $0 + ($1.leftC == nil ? 0 : 1) + ($1.rightC == nil ? 0 : 1) }

        banner

        Grid(horizontalSpacing: 10, verticalSpacing: 10) {
            GridRow {
                Tile(label: "Right now",
                     sub: flagged.isEmpty ? "left and right feet match"
                        : "\(flagged.count) spot\(flagged.count > 1 ? "s" : "") flagged") {
                    StatusBadge(status: worstTier(cur.sites), large: true)
                }
                Tile(label: "Biggest left–right difference",
                     sub: top.map { "\(siteLabel($0.site)) · \(warmerFoot($0.deltaC) ?? "neither") foot warmer" }
                        ?? "no valid readings") {
                    Text(top.map { String(format: "%.1f °C", abs($0.deltaC!)) } ?? "—")
                }
            }
            GridRow {
                Tile(label: "Readings in the last minute",
                     sub: "one every \(CONFIG.liveDemo.intervalS.formatted()) s · \(sensorCount) sensor\(sensorCount == 1 ? "" : "s") reporting") {
                    Text("\(lastMinute)")
                }
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let streaming = context.date.timeIntervalSince(cur.date) < 3
                    Tile(label: "Last reading",
                         sub: streaming ? "streaming" : "paused · start python -m pipeline.live") {
                        HStack(spacing: 6) {
                            Circle().fill(streaming ? Palette.good : Color.secondary).frame(width: 8, height: 8)
                            Text(cur.date.formatted(date: .omitted, time: .standard))
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }

        if let first = flagged.first {
            Callout(color: first.tier.color) {
                ForEach(flagged) { r in
                    FlagRow(tier: r.tier, text: "\(siteLabel(r.site)): \(warmerFoot(r.deltaC) ?? "neither") foot "
                            + String(format: "%.1f °C warmer", abs(r.deltaC ?? 0)) + " (\(r.reason))")
                }
            }
        }

        Card(title: "Your soles · live") {
            FootMapView(rows: cur.sites, live: true)
        }
        .id("map")

        Card(title: "Left − right difference, second by second",
             subtitle: "Last \(Int(CONFIG.liveDemo.historyS)) s. Warning at |ΔT| ≥ \(CONFIG.clinical.warningC.formatted()) °C; "
                + "alert at ≥ \(CONFIG.clinical.alertC.formatted()) °C held for \(CONFIG.liveDemo.alertConsecutiveSamples) "
                + "readings, same side. Drag across the chart to look back.") {
            LiveChartView(samples: samples, window: CONFIG.liveDemo.historyS)
        }
        .id("chart")

        Card(title: "Current readings") {
            LiveTableView(sites: cur.sites)
        }
    }
}
