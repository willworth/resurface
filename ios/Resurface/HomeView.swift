import SwiftUI

struct HomeView: View {
    @ObservedObject var vm: ResurfaceViewModel
    private let snoozeColumns = [
        GridItem(.adaptive(minimum: 116), spacing: 8)
    ]

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
                        Text("This has been snoozed enough. You can pass for now, but it is worth a real keep/drop decision soon.")
                            .font(ResurfaceStyle.body(14, weight: .semibold))
                            .foregroundStyle(ResurfaceStyle.accent)
                    }

                    if let shareURL = item.shareURL {
                        HStack(spacing: 10) {
                            Button {
                                Task { await vm.passCurrent() }
                            } label: {
                                Label("Next", systemImage: "arrow.right")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .tint(ResurfaceStyle.accent)

                            Button {
                                vm.openURL(for: item)
                            } label: {
                                Label("Open", systemImage: "safari")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.large)

                            ShareLink(
                                item: shareURL,
                                subject: Text(item.title),
                                message: Text(item.title)
                            ) {
                                Label("Share", systemImage: "square.and.arrow.up")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                        }
                    } else {
                        Button {
                            Task { await vm.passCurrent() }
                        } label: {
                            Label("Next", systemImage: "arrow.right")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .tint(ResurfaceStyle.accent)
                    }

                    if !vm.forceDecision {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Snooze")
                                .font(ResurfaceStyle.mono(11))
                                .foregroundStyle(ResurfaceStyle.muted)

                            LazyVGrid(columns: snoozeColumns, alignment: .leading, spacing: 8) {
                                ForEach(SnoozePreset.allCases) { preset in
                                    Button {
                                        Task { await vm.snoozeCurrent(preset) }
                                    } label: {
                                        Text(preset.label)
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.bordered)
                                    .controlSize(.large)
                                }
                            }
                        }
                    }

                    Divider()
                        .padding(.vertical, 2)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Done with this")
                            .font(ResurfaceStyle.mono(11))
                            .foregroundStyle(ResurfaceStyle.muted)

                        TextField("Archive destination", text: $vm.archiveDestination)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)

                        Button {
                            Task { await vm.archiveCurrent() }
                        } label: {
                            Label("Archive", systemImage: "archivebox")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .tint(ResurfaceStyle.accent)

                        Button(role: .destructive) {
                            Task { await vm.dropCurrent() }
                        } label: {
                            Label("Drop", systemImage: "trash")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
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
