import SwiftUI

/// Sole outline in a 120 × 310 design space (left foot, medial side on the right) - same path as the web map.
struct FootOutline: Shape {
    static let size = CGSize(width: 120, height: 310)

    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 60, y: 274))
        let curves: [(CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (34, 274, 22, 250, 24, 218), (26, 186, 32, 162, 24, 134), (18, 110, 20, 84, 32, 74),
            (48, 64, 72, 62, 98, 64), (112, 68, 110, 96, 104, 124), (98, 152, 86, 168, 90, 202),
            (94, 238, 90, 274, 60, 274),
        ]
        for (c1x, c1y, c2x, c2y, x, y) in curves {
            p.addCurve(to: CGPoint(x: x, y: y), control1: CGPoint(x: c1x, y: c1y), control2: CGPoint(x: c2x, y: c2y))
        }
        p.closeSubpath()
        let s = rect.width / Self.size.width
        return p.applying(CGAffineTransform(scaleX: s, y: s).translatedBy(x: rect.minX / s, y: rect.minY / s))
    }
}

/// Both soles with a marker per sensor. Tap a marker to see its readings.
struct FootMapView: View {
    let rows: [any SiteReading]
    var live = false

    @State private var picked: String?

    private static let positions: [String: CGPoint] = [
        "hallux": CGPoint(x: 88, y: 42),
        "met1": CGPoint(x: 86, y: 104),
        "met3": CGPoint(x: 60, y: 98),
        "met5": CGPoint(x: 34, y: 110),
        "heel": CGPoint(x: 60, y: 238),
    ]
    private static let toes: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
        (90, 36, 13, 17), (68, 34, 8, 10), (52, 40, 7, 9), (39, 49, 6.5, 8), (28, 61, 6, 7),
    ]
    private static let gap: CGFloat = 36
    private static let total = CGSize(width: FootOutline.size.width * 2 + gap, height: FootOutline.size.height)

    private var bySite: [String: any SiteReading] {
        Dictionary(rows.map { ($0.site, $0) }, uniquingKeysWith: { a, _ in a })
    }

    var body: some View {
        VStack(spacing: 10) {
            GeometryReader { geo in
                let s = min(geo.size.width / Self.total.width, geo.size.height / Self.total.height)
                HStack(spacing: Self.gap * s) {
                    foot(left: true, scale: s)
                    foot(left: false, scale: s)
                }
                .frame(maxWidth: .infinity)
            }
            .aspectRatio(Self.total.width / Self.total.height, contentMode: .fit)
            .frame(maxHeight: 320)

            info
        }
    }

    private func foot(left: Bool, scale s: CGFloat) -> some View {
        let w = FootOutline.size.width
        return ZStack(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                FootOutline().fill(Palette.footFill)
                FootOutline().stroke(Palette.footStroke, lineWidth: 1.5)
                ForEach(Array(Self.toes.enumerated()), id: \.offset) { _, toe in
                    Ellipse()
                        .fill(Palette.footFill)
                        .overlay(Ellipse().stroke(Palette.footStroke, lineWidth: 1.5))
                        .frame(width: toe.2 * 2 * s, height: toe.3 * 2 * s)
                        .position(x: toe.0 * s, y: toe.1 * s)
                }
            }
            .frame(width: w * s, height: FootOutline.size.height * s)
            .scaleEffect(x: left ? 1 : -1, y: 1)

            Text(left ? "Left" : "Right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .position(x: w / 2 * s, y: 298 * s)

            ForEach(CONFIG.sites, id: \.self) { site in
                if let p = Self.positions[site] {
                    marker(site: site, left: left, scale: s)
                        .position(x: (left ? p.x : w - p.x) * s, y: p.y * s)
                }
            }
        }
        .frame(width: w * s, height: FootOutline.size.height * s)
    }

    private func marker(site: String, left: Bool, scale s: CGFloat) -> some View {
        let r = bySite[site]
        let temp = left ? r?.leftC : r?.rightC
        let missing = r == nil || temp == nil
        let warm = r.map { $0.tier.isFlagged && warmerFoot($0.deltaC) == (left ? "left" : "right") } ?? false
        let color = warm ? r!.tier.color : Color.secondary
        let selected = picked == site
        return Button {
            picked = selected ? nil : site
        } label: {
            ZStack {
                if warm && r?.tier == .alert {
                    Circle().stroke(Palette.critical.opacity(0.45), lineWidth: 2).frame(width: 30 * s, height: 30 * s)
                }
                Circle()
                    .fill(missing ? Color.clear : warm ? color : Color(.systemBackground))
                    .overlay(
                        Circle().stroke(
                            selected ? Color.primary : missing ? Color.secondary : warm ? color : Palette.footStroke,
                            style: StrokeStyle(lineWidth: selected ? 2.5 : 1.5, dash: missing ? [3, 2] : []))
                    )
                    .frame(width: 20 * s, height: 20 * s)
            }
            .frame(width: 40 * s, height: 40 * s)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(left ? "Left" : "Right") \(siteLabel(site)): \(fmtTemp(temp))\(warm ? ", warmer side, \(r!.tier.label)" : "")")
    }

    @ViewBuilder private var info: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let site = picked, let r = bySite[site] {
                HStack(spacing: 6) {
                    StatusIcon(status: r.tier)
                    Text(siteLabel(site)).font(.subheadline.weight(.semibold))
                }
                (Text("L \(fmtTemp(r.leftC)) · R \(fmtTemp(r.rightC)) · ") + Text("ΔT \(fmtDelta(r.deltaC)) °C").bold())
                    .font(.subheadline.monospacedDigit())
                Text(live ? "Live reading (rest rule off) · \(r.reason)"
                          : "Rest window \(clockTime(r.restStart))–\(clockTime(r.restEnd)) · \(r.reason)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("Tap a sensor for its readings. A filled marker shows the warmer foot at a flagged spot.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .padding(10)
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
    }
}
