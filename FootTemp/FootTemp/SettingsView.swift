import SwiftUI

/// Backend address. The default comes from Config.xcconfig (this Mac's Wi-Fi address at build time).
struct SettingsView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://192.168.1.20:3210", text: $address)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.body.monospaced())
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(Palette.critical)
                    }
                } header: {
                    Text("Convex backend")
                } footer: {
                    Text("The Mac running `npm run dev` in foot-ulcer-ews, port 3210. In the Simulator, "
                         + "http://127.0.0.1:3210 also works. On an iPhone, use the Mac's Wi-Fi address "
                         + "(System Settings › Wi-Fi › Details) and keep both on the same network.")
                }

                Section("Status") {
                    LabeledContent("Connection") {
                        if store.lastError != nil {
                            Label("Unreachable", systemImage: "xmark.circle.fill").foregroundStyle(Palette.critical)
                        } else if store.lastSuccess != nil {
                            Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(Palette.good)
                        } else {
                            Text("Connecting…").foregroundStyle(.secondary)
                        }
                    }
                    if let message = store.lastError {
                        Text(message).font(.footnote).foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button("Use build default (\(Store.defaultURL))") {
                        address = Store.defaultURL
                        save()
                    }
                    .disabled(store.isUsingDefaultURL)
                }

                Section {
                    Text("This app only reads data. Writes need the INGEST_KEY, which stays on the Mac.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save", action: save).bold() }
            }
            .onAppear { address = store.serverURL }
        }
    }

    private func save() {
        if let message = store.setServerURL(address) {
            error = message
        } else {
            dismiss()
        }
    }
}
