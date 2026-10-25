import SwiftUI

/// Site × night table: every value the chart shows. Tap a column to select that night.
struct DayGridView: View {
    let rows: [DailyRow]
    let dates: [String]
    let selected: String
    let onSelect: (String) -> Void

    private let rowHeight: CGFloat = 30

    var body: some View {
        let cell = Dictionary(rows.map { ("\($0.site)|\($0.date)", $0) }, uniquingKeysWith: { a, _ in a })
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Color.clear.frame(height: 24)
                ForEach(CONFIG.sites, id: \.self) { site in
                    Text(shortSite(site))
                        .font(.caption.weight(.medium))
                        .lineLimit(1)
                        .frame(width: 92, height: rowHeight, alignment: .leading)
                }
            }
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 2) {
                        ForEach(dates, id: \.self) { date in
                            column(date, cell: cell).id(date)
                        }
                    }
                }
                .onAppear { proxy.scrollTo(selected, anchor: .trailing) }
                .onChange(of: selected) { _, d in withAnimation { proxy.scrollTo(d, anchor: .center) } }
            }
        }
    }

    private func column(_ date: String, cell: [String: DailyRow]) -> some View {
        let isSel = date == selected
        return Button { onSelect(date) } label: {
            VStack(spacing: 2) {
                Text(fmtNight(date))
                    .font(.caption2.weight(isSel ? .bold : .medium))
                    .foregroundStyle(isSel ? .primary : .secondary)
                    .frame(height: 24)
                ForEach(CONFIG.sites, id: \.self) { site in
                    let r = cell["\(site)|\(date)"]
                    let tier = r?.tier ?? .noData
                    HStack(spacing: 2) {
                        if tier != .normal { StatusIcon(status: tier, size: 9) }
                        Text(fmtDelta(r?.deltaC)).font(.caption.monospacedDigit())
                    }
                    .frame(width: 56, height: rowHeight)
                    .background(tier.isFlagged ? tier.color.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 6))
                }
            }
            .padding(.bottom, 2)
            .background(isSel ? Color(.tertiarySystemFill) : .clear, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(fmtNightLong(date))")
        .accessibilityAddTraits(isSel ? .isSelected : [])
    }
}

struct SensorPanelView: View {
    let sensors: [SensorRow]

    var body: some View {
        let by = Dictionary(sensors.map { ("\($0.foot)|\($0.site)", $0) }, uniquingKeysWith: { a, _ in a })
        VStack(alignment: .leading, spacing: 0) {
            ForEach(CONFIG.sites, id: \.self) { site in
                HStack(alignment: .top, spacing: 8) {
                    Text(shortSite(site))
                        .font(.footnote.weight(.medium))
                        .frame(width: 92, alignment: .leading)
                    ForEach(["L", "R"], id: \.self) { foot in
                        sensorCell(by["\(foot)|\(site)"], foot: foot)
                    }
                }
                .padding(.vertical, 8)
                Divider()
            }
            if let asOf = sensors.first?.asOf {
                Text("Faulty samples are excluded before ΔT is computed. Status covers data through \(fmtNight(asOf)).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 8)
            }
        }
    }

    private func sensorCell(_ s: SensorRow?, foot: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(foot == "L" ? "Left" : "Right").font(.caption2).foregroundStyle(.secondary)
            if let s {
                StatusBadge(status: s.status)
                if s.status != .ok {
                    let pct = s.faultFraction < 0.001 ? "<0.1" : String(format: "%.1f", s.faultFraction * 100)
                    let detail = [(s.nRange, "out-of-range"), (s.nJump, "spike"), (s.nStuck, "stuck")]
                        .filter { $0.0 > 0 }.map { "\(Int($0.0)) \($0.1)" }.joined(separator: ", ")
                    Text("\(pct)% masked\(detail.isEmpty ? "" : " · \(detail)")")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("—").foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct LiveTableView: View {
    let sites: [LiveSite]

    var body: some View {
        let by = Dictionary(sites.map { ($0.site, $0) }, uniquingKeysWith: { a, _ in a })
        Grid(alignment: .trailing, horizontalSpacing: 8, verticalSpacing: 8) {
            GridRow {
                Text("Spot").gridColumnAlignment(.leading)
                Text("Left")
                Text("Right")
                Text("ΔT")
                Color.clear.frame(width: 16, height: 1)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            ForEach(CONFIG.sites, id: \.self) { site in
                let r = by[site]
                Divider()
                GridRow {
                    Text(shortSite(site)).lineLimit(1)
                    Text(fmtTemp(r?.leftC))
                    Text(fmtTemp(r?.rightC))
                    Text(fmtDelta(r?.deltaC)).bold()
                    if let r { StatusIcon(status: r.tier) } else { Color.clear.frame(width: 16, height: 1) }
                }
                .font(.subheadline.monospacedDigit())
            }
        }
    }
}

/// Dropdown to switch between data profiles (sample scenarios or "me").
struct ProfilePicker: View {
    let profiles: [Store.Profile]
    let current: String
    let onPick: (String) -> Void

    var body: some View {
        if profiles.count > 1 {
            Menu {
                Picker("Profile", selection: Binding(get: { current }, set: onPick)) {
                    ForEach(profiles) { p in
                        Label(profileLabel(p.id), systemImage: p.worstTier.symbol).tag(p.id)
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    if let p = profiles.first(where: { $0.id == current }) {
                        StatusIcon(status: p.worstTier, size: 12)
                    }
                    Text(profileLabel(current)).font(.subheadline.weight(.semibold))
                    Image(systemName: "chevron.up.chevron.down").font(.caption2.weight(.semibold))
                }
                .foregroundStyle(.primary)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Color(.tertiarySystemFill), in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel("Profile: \(profileLabel(current))")
        }
    }
}
