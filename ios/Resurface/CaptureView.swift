import SwiftUI

struct CaptureView: View {
    @ObservedObject var vm: ResurfaceViewModel
    var embeddedInTab = false

    var body: some View {
        NavigationStack {
            List {
                CaptureForm(vm: vm, embedded: false)
            }
            .resurfaceScreen()
            .navigationTitle("Capture")
        }
    }
}

struct CaptureForm: View {
    @ObservedObject var vm: ResurfaceViewModel
    var embedded: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if embedded {
                Text("Drop in a URL, note, or idea without leaving review.")
                    .font(ResurfaceStyle.body(14))
                    .foregroundStyle(ResurfaceStyle.muted)
            }

            TextField("Paste a URL or type an idea…", text: $vm.captureDraft.text, axis: .vertical)
                .lineLimit(2...5)
                .textFieldStyle(.roundedBorder)

            TextField("Notes", text: $vm.captureDraft.notes, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.roundedBorder)

            HStack {
                Button("Save") { Task { await vm.capture() } }
                    .buttonStyle(.borderedProminent)
                    .tint(ResurfaceStyle.accent)
                    .disabled(!vm.captureDraft.canSave || vm.isLoading)

                Button("Clear") { vm.clearCaptureDraft() }
                    .buttonStyle(.bordered)
                    .disabled(!vm.captureDraft.hasContent)

                Spacer()
            }

            if let error = vm.lastError {
                Text(error)
                    .font(ResurfaceStyle.body(13))
                    .foregroundStyle(ResurfaceStyle.danger)
            }
        }
        .padding(.vertical, 8)
    }
}
