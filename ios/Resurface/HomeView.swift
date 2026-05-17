import SwiftUI

struct HomeView: View {
    @ObservedObject var vm: ResurfaceViewModel

    var body: some View {
        NavigationStack {
            List {
                currentSection
                if vm.lastError != nil {
                    ConnectionBanner(vm: vm)
                }
                captureSection
            }
            .resurfaceScreen()
            .navigationTitle("Review")
            .toolbar { ResurfaceToolbar(vm: vm) }
            .refreshable { await vm.refresh() }
        }
    }

    private var currentSection: some View {
        Section {
            if let item = vm.current {
                VStack(alignment: .leading, spacing: 14) {
                    ItemCard(item: item)

                    if vm.forceDecision {
                        Text("This has been snoozed enough. Archive it or drop it.")
                            .font(ResurfaceStyle.body(14, weight: .semibold))
                            .foregroundStyle(ResurfaceStyle.accent)
                    }

                    TextField("Archive destination", text: $vm.archiveDestination)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)

                    HStack(spacing: 10) {
                        if item.url != nil {
                            Button("Open") { vm.openURL(for: item) }
                                .buttonStyle(.bordered)
                        }
                        Button("Archive") { Task { await vm.archiveCurrent() } }
                            .buttonStyle(.borderedProminent)
                            .tint(ResurfaceStyle.accent)
                        Button("Drop", role: .destructive) { Task { await vm.dropCurrent() } }
                            .buttonStyle(.bordered)
                    }

                    if !vm.forceDecision {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(SnoozePreset.allCases) { preset in
                                    Button(preset.label) { Task { await vm.snoozeCurrent(preset) } }
                                        .buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                }
            } else {
                EmptyState(
                    title: "Nothing ready",
                    message: "Everything active is either snoozed or already decided. Capture something new, or check the library."
                )
            }
        }
        .listRowBackground(ResurfaceStyle.card)
    }

    private var captureSection: some View {
        Section("Quick capture") {
            CaptureForm(vm: vm, embedded: true)
        }
        .listRowBackground(ResurfaceStyle.panel)
    }
}
