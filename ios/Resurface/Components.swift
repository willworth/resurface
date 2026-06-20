import SwiftUI

struct ConnectionBanner: View {
    @ObservedObject var vm: ResurfaceViewModel

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: vm.lastError == nil ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(vm.lastError == nil ? ResurfaceStyle.accent : ResurfaceStyle.danger)
            VStack(alignment: .leading, spacing: 4) {
                Text(vm.status)
                    .font(ResurfaceStyle.mono(12))
                if let health = vm.health {
                    Text("\(health.database.totalItems) saved things · API \(health.apiVersion)")
                        .font(ResurfaceStyle.body(13))
                        .foregroundStyle(ResurfaceStyle.muted)
                }
                if let error = vm.lastError {
                    Text(error)
                        .font(ResurfaceStyle.body(13))
                        .foregroundStyle(ResurfaceStyle.danger)
                }
            }
            Spacer()
        }
        .padding(.vertical, 4)
        .listRowBackground(ResurfaceStyle.panel)
    }
}

struct ResurfaceToolbar: ToolbarContent {
    @ObservedObject var vm: ResurfaceViewModel

    var body: some ToolbarContent {
        ToolbarItem {
            Button { vm.showSettings = true } label: {
                Image(systemName: "gearshape")
            }
        }
        ToolbarItem {
            Button { Task { await vm.refresh() } } label: {
                Image(systemName: "arrow.clockwise")
            }
            .disabled(vm.isLoading)
        }
    }
}

struct ItemCard: View {
    let item: ResurfaceItem
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 6 : 10) {
            ItemHeader(item: item, compact: compact)
            ItemBody(item: item, compact: compact)
        }
        .padding(.vertical, 8)
    }
}

struct ItemHeader: View {
    let item: ResurfaceItem
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 6 : 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.category.uppercased())
                    .font(ResurfaceStyle.mono(10))
                    .foregroundStyle(ResurfaceStyle.accent)
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(item.savedDateLabel)
                        .font(ResurfaceStyle.mono(10))
                        .foregroundStyle(ResurfaceStyle.accent)
                        .lineLimit(1)
                    Text(item.source.replacingOccurrences(of: "-", with: " "))
                        .font(ResurfaceStyle.mono(10))
                        .foregroundStyle(ResurfaceStyle.muted)
                        .lineLimit(1)
                }
            }

            Text(item.title)
                .font(ResurfaceStyle.display(compact ? 20 : 28))
                .foregroundStyle(ResurfaceStyle.ink)
                .lineLimit(compact ? 2 : 4)
        }
    }
}

struct ItemBody: View {
    let item: ResurfaceItem
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 6 : 10) {
            if let url = item.displayURL {
                Text(url)
                    .font(ResurfaceStyle.mono(11))
                    .foregroundStyle(ResurfaceStyle.muted)
                    .lineLimit(1)
            }

            if let excerpt = item.excerpt {
                Text(excerpt)
                    .font(ResurfaceStyle.body(compact ? 14 : 16))
                    .foregroundStyle(ResurfaceStyle.muted)
                    .lineLimit(compact ? 3 : 8)
            }

            HStack(spacing: 8) {
                if item.snoozeCount > 0 {
                    Pill(text: "snoozed \(item.snoozeCount)")
                }
                if let archivedTo = item.archivedTo {
                    Pill(text: "archived in \(archivedTo)")
                }
                Spacer()
            }
        }
    }
}

struct Pill: View {
    let text: String

    var body: some View {
        Text(text)
            .font(ResurfaceStyle.mono(10))
            .foregroundStyle(ResurfaceStyle.ink)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(ResurfaceStyle.card)
            .clipShape(Capsule())
    }
}

struct EmptyState: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(ResurfaceStyle.display(24))
            Text(message)
                .font(ResurfaceStyle.body(15))
                .foregroundStyle(ResurfaceStyle.muted)
        }
        .padding(.vertical, 8)
    }
}

struct SettingsView: View {
    @ObservedObject var vm: ResurfaceViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Appearance") {
                    Toggle("Light mode", isOn: $vm.useLightMode)
                }

                Section("Backend") {
                    TextField("Backend URL", text: $vm.backendURL)
                        .autocorrectionDisabled()
                    Text("Use the Mac Mini Tailscale URL/IP. The iOS app talks to `/api/v1`; it does not store Resurface data locally.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                        Task { await vm.refresh() }
                    }
                }
            }
        }
    }
}
