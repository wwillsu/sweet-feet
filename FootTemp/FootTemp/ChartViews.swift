import Charts
import SwiftUI

private struct LinePoint: Identifiable {
    let id: String
    let x: Date
    let v: Double
    let site: String
    let segment: String  // a new segment starts after a missing value, so gaps aren't bridged
}

private let siteNames = CONFIG.sites.map(shortSite)

/// Symmetric ΔT axis bound, at least ±3 °C.
private func yBound(_ values: [Double]) -> Double {
    max(3, ((values.map(abs).max() ?? 0) + 0.3).rounded(.up))
}

private func yTicks(_ bound: Double) -> [Double] {
    Array(stride(from: -bound, through: bound, by: bound > 5 ? 2 : 1))
}

/// Warning and alert zones, both signs.
@ChartContentBuilder
private func bands(from x0: Date, to x1: Date, bound: Double) -> some ChartContent {
    let c = CONFIG.clinical
    let zones: [(Double, Double, Color)] = [
        (c.alertC, bound, Palette.critical.opacity(0.10)), (-bound, -c.alertC, Palette.critical.opacity(0.10)),
        (c.warningC, c.alertC, Palette.warning.opacity(0.14)), (-c.alertC, -c.warningC, Palette.warning.opacity(0.14)),
    ]
    ForEach(Array(zones.enumerated()), id: \.offset) { _, z in
        RectangleMark(xStart: .value("Start", x0), xEnd: .value("End", x1),
                      yStart: .value("Low", z.0), yEnd: .value("High", z.1))
            .foregroundStyle(z.2)
    }
    RuleMark(y: .value("Zero", 0))
        .foregroundStyle(Color.secondary.opacity(0.6))
        .lineStyle(StrokeStyle(lineWidth: 1))
}

private struct AxisNote: View {
    var body: some View {
        HStack {
            Text("▲ left foot warmer")
            Spacer()
            Text("▼ right foot warmer")
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
}

/// Per-site values at the selected point, sorted by |ΔT|.
struct Readout: View {
    let title: String
    let rows: [(site: String, delta: Double?, tier: Tier?)]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.weight(.semibold))
            ForEach(rows.sorted { abs($0.delta ?? -1) > abs($1.delta ?? -1) }, id: \.site) { r in
                HStack(spacing: 8) {
                    Capsule().fill(Palette.site(r.site)).frame(width: 12, height: 3)
                    Text(r.delta == nil ? "—" : "\(fmtDelta(r.delta)) °C")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .frame(width: 74, alignment: .leading)
                    Text(siteLabel(r.site)).font(.subheadline).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    if let tier = r.tier, tier != .normal {
                        StatusIcon(status: tier, size: 13)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
    }
}

/// ΔT = left − right per site per day. Touch or drag across the chart to pick a day.
/// Every day gets an equal slot with its point in the middle, so the first and last day are as wide as the rest.
struct DeltaChartView: View {
    let rows: [DailyRow]
    let dates: [String]
    let selected: String
    let onSelect: (String) -> Void

    @State private var rawSelection: Date?

    var body: some View {
        let cell = Dictionary(rows.map { ("\($0.site)|\($0.date)", $0) }, uniquingKeysWith: { a, _ in a })
        let points = linePoints(cell)
        let bound = yBound(rows.compactMap(\.deltaC))
        let half: TimeInterval = 43_200
        let x0 = nightDate(dates.first ?? selected).addingTimeInterval(-half)
        let x1 = nightDate(dates.last ?? selected).addingTimeInterval(half)
        let selDate = nightDate(selected)
        let lead = leadSite(cell)
        // Every day is labeled; on a phone that only fits with vertical labels past a week.
        let vertical = dates.count > 7

        VStack(alignment: .leading, spacing: 8) {
            AxisNote()
            Chart {
                bands(from: x0, to: x1, bound: bound)
                RectangleMark(xStart: .value("Start", selDate.addingTimeInterval(-half)),
                              xEnd: .value("End", selDate.addingTimeInterval(half)),
                              yStart: .value("Low", -bound), yEnd: .value("High", bound))
                    .foregroundStyle(Color.primary.opacity(0.06))
                ForEach(points) { p in
                    LineMark(x: .value("Day", p.x), y: .value("ΔT", p.v), series: .value("Line", p.segment))
                        .foregroundStyle(by: .value("Site", shortSite(p.site)))
                        .lineStyle(StrokeStyle(lineWidth: 2, lineJoin: .round))
                }
                ForEach(CONFIG.sites, id: \.self) { site in
                    if let v = cell["\(site)|\(selected)"]?.deltaC {
                        PointMark(x: .value("Day", selDate), y: .value("ΔT", v))
                            .foregroundStyle(by: .value("Site", shortSite(site)))
                            .symbolSize(60)
                    }
                }
                // Direct-label only the site the story is about: largest |ΔT| on the latest day, if flagged.
                if let lead, let last = dates.last {
                    PointMark(x: .value("Day", nightDate(last)), y: .value("ΔT", lead.v))
                        .foregroundStyle(by: .value("Site", shortSite(lead.site)))
                        .symbolSize(40)
                        .annotation(position: lead.v > 0 ? .bottom : .top, alignment: .trailing,
                                    overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
                            VStack(alignment: .trailing, spacing: 0) {
                                Text("\(fmtDelta(lead.v)) °C").font(.caption.weight(.bold))
                                Text(shortSite(lead.site)).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                }
            }
            .chartForegroundStyleScale(domain: siteNames, range: Palette.series)
            .chartYScale(domain: -bound...bound)
            .chartXScale(domain: x0...x1)
            .chartYAxis {
                AxisMarks(position: .leading, values: yTicks(bound)) { value in
                    AxisGridLine()
                    AxisValueLabel { if let v = value.as(Double.self) { Text(fmtDelta(v, digits: 0)) } }
                }
            }
            .chartXAxis {
                AxisMarks(values: dates.map(nightDate)) { _ in
                    AxisGridLine()
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day(), anchor: vertical ? .top : nil,
                                   orientation: vertical ? .verticalReversed : .horizontal)
                }
            }
            .chartLegend(position: .bottom, alignment: .leading)
            .chartXSelection(value: $rawSelection)
            .frame(height: vertical ? 290 : 260)
            .onChange(of: rawSelection) { _, raw in
                guard let raw, let nearest = dates.min(by: {
                    abs(nightDate($0).timeIntervalSince(raw)) < abs(nightDate($1).timeIntervalSince(raw))
                }) else { return }
                if nearest != selected { onSelect(nearest) }
            }

            Readout(title: fmtNightLong(selected),
                    rows: CONFIG.sites.map { s in
                        let r = cell["\(s)|\(selected)"]
                        return (s, r?.deltaC, r?.tier)
                    })
        }
    }

    private func leadSite(_ cell: [String: DailyRow]) -> (site: String, v: Double)? {
        guard let last = dates.last else { return nil }
        return CONFIG.sites
            .compactMap { s in cell["\(s)|\(last)"]?.deltaC.map { (site: s, v: $0) } }
            .filter { abs($0.v) >= CONFIG.clinical.warningC }
            .max { abs($0.v) < abs($1.v) }
    }

    private func linePoints(_ cell: [String: DailyRow]) -> [LinePoint] {
        var out: [LinePoint] = []
        for site in CONFIG.sites {
            var segment = 0
            for date in dates {
                guard let v = cell["\(site)|\(date)"]?.deltaC else {
                    segment += 1
                    continue
                }
                out.append(LinePoint(id: "\(site)|\(date)", x: nightDate(date), v: v, site: site,
                                     segment: "\(site)-\(segment)"))
            }
        }
        return out
    }
}

/// Live ΔT per site over the last `window` seconds. Drag to scrub back in time.
struct LiveChartView: View {
    let samples: [LiveSample]
    let window: Double

    @State private var rawSelection: Date?
    private let gap: TimeInterval = 2.5  // break the line if a reading is missing

    var body: some View {
        let tEnd = samples.last?.date ?? .now
        // Grow with the data until the window is full, so a fresh stream isn't squeezed to the right.
        let span = min(window, max(30, samples.first.map { tEnd.timeIntervalSince($0.date) } ?? 0))
        let tStart = tEnd.addingTimeInterval(-span)
        let bound = yBound(samples.flatMap { $0.sites.compactMap(\.deltaC) })
        let active = scrubbed ?? samples.last

        VStack(alignment: .leading, spacing: 8) {
            AxisNote()
            Chart {
                bands(from: tStart, to: tEnd, bound: bound)
                ForEach(linePoints()) { p in
                    LineMark(x: .value("Time", p.x), y: .value("ΔT", p.v), series: .value("Line", p.segment))
                        .foregroundStyle(by: .value("Site", shortSite(p.site)))
                        .lineStyle(StrokeStyle(lineWidth: 2, lineJoin: .round))
                }
                if let active {
                    if scrubbed != nil {
                        RuleMark(x: .value("Selected", active.date))
                            .foregroundStyle(Color.secondary)
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    }
                    ForEach(active.sites) { r in
                        if let v = r.deltaC {
                            PointMark(x: .value("Time", active.date), y: .value("ΔT", v))
                                .foregroundStyle(by: .value("Site", shortSite(r.site)))
                                .symbolSize(50)
                        }
                    }
                }
            }
            .chartForegroundStyleScale(domain: siteNames, range: Palette.series)
            .chartYScale(domain: -bound...bound)
            .chartXScale(domain: tStart...tEnd)
            .chartYAxis {
                AxisMarks(position: .leading, values: yTicks(bound)) { value in
                    AxisGridLine()
                    AxisValueLabel { if let v = value.as(Double.self) { Text(fmtDelta(v, digits: 0)) } }
                }
            }
            .chartXAxis {
                // Ticks every 10/30/60 s back from "now", like the web chart.
                AxisMarks(values: stride(from: 0, through: span, by: span > 120 ? 60 : span > 60 ? 30 : 10)
                    .map { tEnd.addingTimeInterval(-$0) }) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let d = value.as(Date.self) {
                            let s = Int(tEnd.timeIntervalSince(d).rounded())
                            Text(s <= 0 ? "now" : "−\(s)s")
                        }
                    }
                }
            }
            .chartLegend(position: .bottom, alignment: .leading)
            .chartXSelection(value: $rawSelection)
            .frame(height: 250)

            if let active {
                Readout(title: scrubbed == nil ? "Now" : active.date.formatted(date: .omitted, time: .standard),
                        rows: active.sites.map { ($0.site, $0.deltaC, $0.tier) })
            }
        }
    }

    private var scrubbed: LiveSample? {
        guard let raw = rawSelection else { return nil }
        return samples.min { abs($0.date.timeIntervalSince(raw)) < abs($1.date.timeIntervalSince(raw)) }
    }

    private func linePoints() -> [LinePoint] {
        var out: [LinePoint] = []
        for site in CONFIG.sites {
            var segment = 0
            var prev: Date?
            for s in samples {
                guard let v = s.sites.first(where: { $0.site == site })?.deltaC else {
                    prev = nil
                    continue
                }
                if prev == nil || s.date.timeIntervalSince(prev!) >= gap { segment += 1 }
                out.append(LinePoint(id: "\(site)|\(s.id)", x: s.date, v: v, site: site, segment: "\(site)-\(segment)"))
                prev = s.date
            }
        }
        return out
    }
}
