import SwiftUI

struct ItemDetailView: View {
    @ObservedObject var vm: ResurfaceViewModel
    let item: ResurfaceItem
    @Environment(\.dismiss) private var dismiss
    @State private var archiveDestination: String
    @FocusState private var archiveFocused: Bool

    init(vm: ResurfaceViewModel, item: ResurfaceItem) {
        self.vm = vm
        self.item = item
        _archiveDestination = State(initialValue: item.archivedTo ?? item.suggestedArchive ?? "")
    }

    var body: some View {
        List {
            Section {
                ItemCard(item: item)
                if let url = item.url {
                    Text(url)
                        .font(ResurfaceStyle.mono(12))
                        .foregroundStyle(ResurfaceStyle.muted)
                        .textSelection(.enabled)
                }
            }
            .listRowBackground(ResurfaceStyle.card)

            if item.url != nil {
                Section("Open") {
                    Button {
                        vm.openURL(for: item)
                    } label: {
                        Label("Open URL", systemImage: "safari")
                    }
                }
                .listRowBackground(ResurfaceStyle.panel)
            }

            Section("Snooze") {
                ForEach(SnoozePreset.allCases) { preset in
                    Button("Snooze: \(preset.label)") {
                        Task {
                            await vm.snooze(item, preset: preset)
                            dismiss()
                        }
                    }
                    .disabled(item.snoozeCount >= 5)
                }
            }
            .listRowBackground(ResurfaceStyle.panel)

            Section("Archive") {
                TextField("Archive destination", text: $archiveDestination)
                    .autocorrectionDisabled()
                    .focused($archiveFocused)

                Button("Archive") {
                    Task {
                        archiveFocused = false
                        await vm.archive(item, archivedTo: archiveDestination)
                        dismiss()
                    }
                }
            }
            .listRowBackground(ResurfaceStyle.panel)

            Section("Drop") {
                Button("Drop", role: .destructive) {
                    Task {
                        await vm.drop(item)
                        dismiss()
                    }
                }
            }
            .listRowBackground(ResurfaceStyle.panel)
        }
        .resurfaceScreen()
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Saved thing")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    archiveFocused = false
                }
            }
        }
    }
}
