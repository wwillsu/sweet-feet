import SwiftUI

struct StatusIcon: View {
    let status: any StatusDisplay
    var size: CGFloat = 14

    var body: some View {
        Image(systemName: status.symbol)
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(status.color)
            .accessibilityHidden(true)
    }
}

struct StatusBadge: View {
    let status: any StatusDisplay
    var large = false

    var body: some View {
        HStack(spacing: 5) {
            StatusIcon(status: status, size: large ? 17 : 12)
            Text(status.label)
                .font(large ? .title3.weight(.semibold) : .footnote.weight(.semibold))
        }
        .padding(.horizontal, large ? 10 : 8)
        .padding(.vertical, large ? 4 : 3)
        .background(Color(.tertiarySystemFill), in: Capsule())
    }
}

struct Card<Content: View>: View {
    var title: String?
    var subtitle: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title {
                Text(title).font(.headline)
            }
            if let subtitle {
                Text(subtitle).font(.caption).foregroundStyle(.secondary).padding(.top, -6)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

struct Tile<Value: View>: View {
    let label: String
    var sub: String?
    @ViewBuilder var value: Value

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            value
                .font(.title2.weight(.bold).monospacedDigit())
                .frame(minHeight: 30)
            if let sub {
                Text(sub).font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Colored-edge box for warnings/alerts and the demo-mode banner.
struct Callout<Content: View>: View {
    let color: Color
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .padding(.leading, 4)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
            .overlay(alignment: .leading) {
                UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14)
                    .fill(color)
                    .frame(width: 5)
            }
    }
}

/// One flagged site in a callout.
struct FlagRow: View {
    let tier: Tier
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            StatusIcon(status: tier, size: 15)
            (Text(tier.label).bold() + Text(" · \(text)"))
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Shown when the phone can't reach the Convex backend on the Mac. `subtle` is for the Daily
/// tracker, which keeps working on its bundled data; the Live demo needs the backend.
struct ConnectionBanner: View {
    @Environment(Store.self) private var store
    @Binding var showSettings: Bool
    var subtle = false

    var body: some View {
        if subtle, store.lastError != nil {
            Button { showSettings = true } label: {
                Label("Showing saved data · backend unreachable", systemImage: "wifi.slash")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens backend settings")
        } else if let error = store.lastError {
            Button { showSettings = true } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Label(store.lastSuccess == nil ? "Can't reach the backend" : "Connection lost, retrying…",
                          systemImage: "wifi.exclamationmark")
                        .font(.subheadline.weight(.semibold))
                    Text("\(store.serverURL): \(error)")
                        .font(.caption)
                        .lineLimit(2)
                    Text("Check `npm run dev` is running and the phone is on the Mac's Wi-Fi. Tap to change the address.")
                        .font(.caption2)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Palette.critical, in: RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
        }
    }
}

/// Gear button that opens the backend address settings.
struct SettingsToolbar: ToolbarContent {
    @Binding var showSettings: Bool

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
            }
            .accessibilityLabel("Backend settings")
        }
    }
}

/// Shell command shown in empty states, selectable so it can be copied.
struct CommandText: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(.caption, design: .monospaced))
            .textSelection(.enabled)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
    }
}

extension View {
    /// Debug-only screenshot hook: scrolls to the view whose id matches $FT_SCROLL. No-op in release builds.
    func debugScrollTarget(_ proxy: ScrollViewProxy) -> some View {
        #if DEBUG
        task {
            guard let target = ProcessInfo.processInfo.environment["FT_SCROLL"] else { return }
            try? await Task.sleep(for: .seconds(1.5))
            proxy.scrollTo(target, anchor: .top)
        }
        #else
        self
        #endif
    }
}
