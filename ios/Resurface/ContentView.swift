import SwiftUI

struct ContentView: View {
    @StateObject private var vm = ResurfaceViewModel()

    var body: some View {
        TabView {
            HomeView(vm: vm)
                .tabItem { Label("Review", systemImage: "sparkles") }

            LibraryView(vm: vm)
                .tabItem { Label("Library", systemImage: "square.grid.2x2") }

            CaptureView(vm: vm, embeddedInTab: true)
                .tabItem { Label("Capture", systemImage: "plus.circle") }
        }
        .tint(ResurfaceStyle.accent)
        .preferredColorScheme(vm.preferredColorScheme)
        .sheet(isPresented: $vm.showSettings) { SettingsView(vm: vm) }
        .task { vm.start() }
    }
}
