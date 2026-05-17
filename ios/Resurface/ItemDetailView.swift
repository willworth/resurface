import SwiftUI

struct ItemDetailView: View {
    @ObservedObject var vm: ResurfaceViewModel
    let item: ResurfaceItem
    @Environment(\.dismiss) private var dismiss
    @State private var archiveDestination: String

    init(vm: ResurfaceViewModel, item: ResurfaceItem) {
        self.vm = vm
        self.item = item
        _archiveDestination = State(initialValue: item.archivedTo ?? item.suggestedArchive ?? "")
    }

    var body: some View {
        NavigationStack {
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

                Section("Actions") {
                    TextField("Archive destination", text: $archiveDestination)
                        .autocorrectionDisabled()

                    if item.url != nil {
                        Button("Open URL") { vm.openURL(for: item) }
                    }
                    Button("Archive") {
                        Task {
                            await vm.archive(item, archivedTo: archiveDestination)
                            dismiss()
                        }
                    }
                    Button("Drop", role: .destructive) {
                        Task {
                            await vm.drop(item)
                            dismiss()
                        }
                    }

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
            }
            .resurfaceScreen()
            .navigationTitle("Saved thing")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
