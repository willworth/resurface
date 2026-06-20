import SwiftUI

struct HomeView: View {
    @ObservedObject var vm: ResurfaceViewModel
    private let snoozeColumns = [
        GridItem(.flexible(minimum: 0), spacing: 10),
        GridItem(.flexible(minimum: 0), spacing: 10)
    ]

    var body: some View {
        List {
            currentSection
            if vm.lastError != nil {
                ConnectionBanner(vm: vm)
            }
        }
        .resurfaceScreen()
        .refreshable { await vm.refresh() }
    }

    private var currentSection: some View {
        Section {
            if let item = vm.current {
                VStack(alignment: .leading, spacing: 14) {
                    ItemHeader(item: item)

                    primaryActions(for: item)

                    ItemBody(item: item)

                    if vm.forceDecision {
                        Text("This has been snoozed enough. You can pass for now, but it is worth a real keep/drop decision soon.")
                            .font(ResurfaceStyle.body(14, weight: .semibold))
                            .foregroundStyle(ResurfaceStyle.accent)
                    }

                    secondaryActions(for: item)

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
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.85)
                                    }
                                    .buttonStyle(.bordered)
                                    .controlSize(.large)
                                    .frame(minHeight: 46)
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

    @ViewBuilder
    private func primaryActions(for item: ResurfaceItem) -> some View {
        HStack(spacing: 8) {
            Button {
                Task { await vm.archiveCurrent() }
            } label: {
                Text("Archive")
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .buttonStyle(DecisionButtonStyle(kind: .primary))

            Button(role: .destructive) {
                Task { await vm.dropCurrent() }
            } label: {
                Text("Drop")
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .buttonStyle(DecisionButtonStyle(kind: .destructive))

            Button {
                Task { await vm.passCurrent() }
            } label: {
                Text("Next")
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .buttonStyle(DecisionButtonStyle(kind: .primary))
        }
    }

    @ViewBuilder
    private func secondaryActions(for item: ResurfaceItem) -> some View {
        if item.shareURL != nil {
            HStack(spacing: 10) {
                if let shareURL = item.shareURL {
                    Button {
                        vm.openURL(for: item)
                    } label: {
                        Label("Open", systemImage: "safari")
                            .frame(maxWidth: .infinity)
                            .lineLimit(1)
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
                            .lineLimit(1)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
            }
        }
    }
}

private struct DecisionButtonStyle: ButtonStyle {
    enum Kind {
        case primary
        case destructive
    }

    let kind: Kind

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(ResurfaceStyle.body(15, weight: .semibold))
            .foregroundStyle(kind == .destructive ? ResurfaceStyle.danger : ResurfaceStyle.background)
            .padding(.horizontal, 8)
            .background(background(isPressed: configuration.isPressed))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(border, lineWidth: 1)
            }
            .opacity(configuration.isPressed ? 0.82 : 1)
    }

    private func background(isPressed: Bool) -> Color {
        switch kind {
        case .primary:
            isPressed ? ResurfaceStyle.accent.opacity(0.82) : ResurfaceStyle.accent
        case .destructive:
            isPressed ? ResurfaceStyle.danger.opacity(0.16) : ResurfaceStyle.danger.opacity(0.08)
        }
    }

    private var border: Color {
        switch kind {
        case .primary:
            ResurfaceStyle.accent.opacity(0.9)
        case .destructive:
            ResurfaceStyle.danger.opacity(0.65)
        }
    }
}
