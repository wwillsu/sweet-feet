import SwiftUI

@main
struct FootTempApp: App {
    @State private var store = Store()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .onChange(of: scenePhase, initial: true) { _, phase in
                    // Poll only while the app is on screen.
                    if phase == .active { store.start() } else { store.stop() }
                }
        }
    }
}

struct RootView: View {
    @Environment(Store.self) private var store

    var body: some View {
        @Bindable var store = store
        TabView(selection: $store.tab) {
            TrackerView()
                .tabItem { Label("Daily tracker", systemImage: "shoeprints.fill") }
                .tag(Store.Tab.tracker)
            LiveView()
                .tabItem { Label("Live demo", systemImage: "waveform.path.ecg") }
                .tag(Store.Tab.live)
        }
    }
}
