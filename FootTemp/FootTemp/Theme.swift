import SwiftUI
import UIKit

extension Color {
    /// A color that follows light/dark mode.
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xff) / 255,
                green: CGFloat((hex >> 8) & 0xff) / 255,
                blue: CGFloat(hex & 0xff) / 255,
                alpha: 1)
        })
    }
}

/// Same categorical and status colors as the web dashboard (dashboard/src/styles.css).
enum Palette {
    static let series: [Color] = [
        Color(light: 0x2a78d6, dark: 0x3987e5),
        Color(light: 0xeb6834, dark: 0xd95926),
        Color(light: 0x1baf7a, dark: 0x199e70),
        Color(light: 0xeda100, dark: 0xc98500),
        Color(light: 0xe87ba4, dark: 0xd55181),
    ]
    static let good = Color(light: 0x0ca30c, dark: 0x0ca30c)
    static let warning = Color(light: 0xfab219, dark: 0xfab219)
    static let critical = Color(light: 0xd03b3b, dark: 0xd03b3b)
    static let footFill = Color(light: 0xf0efec, dark: 0x262624)
    static let footStroke = Color(light: 0xc3c2b7, dark: 0x4a4a46)

    static func site(_ site: String) -> Color {
        let i = CONFIG.sites.firstIndex(of: site) ?? 0
        return series[i % series.count]
    }
}

/// Status is never color alone: each state has its own SF Symbol shape and a text label.
protocol StatusDisplay {
    var label: String { get }
    var symbol: String { get }
    var color: Color { get }
}

extension Tier: StatusDisplay {
    var label: String {
        switch self {
        case .normal: "Normal"
        case .warning: "Warning"
        case .alert: "Alert"
        case .noData: "No data"
        }
    }
    var symbol: String {
        switch self {
        case .normal: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .alert: "exclamationmark.octagon.fill"
        case .noData: "minus.circle"
        }
    }
    var color: Color {
        switch self {
        case .normal: Palette.good
        case .warning: Palette.warning
        case .alert: Palette.critical
        case .noData: .secondary
        }
    }
}

extension SensorState: StatusDisplay {
    var label: String {
        switch self {
        case .ok: "OK"
        case .degraded: "Degraded"
        case .fault: "Fault"
        }
    }
    var symbol: String {
        switch self {
        case .ok: "checkmark.circle.fill"
        case .degraded: "exclamationmark.triangle.fill"
        case .fault: "exclamationmark.octagon.fill"
        }
    }
    var color: Color {
        switch self {
        case .ok: Palette.good
        case .degraded: Palette.warning
        case .fault: Palette.critical
        }
    }
}
