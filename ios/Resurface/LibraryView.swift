import SwiftUI

struct LibraryView: View {
    @ObservedObject var vm: ResurfaceViewModel

    var body: some View {
        NavigationStack {
            List {
                ConnectionBanner(vm: vm)

                Section {
                    Picker("Status", selection: $vm.selectedStatus) {
                        ForEach(ResurfaceStatus.allCases) { status in
                            Text(status.label).tag(status)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: vm.selectedStatus) { _, _ in
                        Task { await vm.refreshLibrary() }
                    }
                }
                .listRowBackground(ResurfaceStyle.panel)

                Section {
                    if vm.libraryItems.isEmpty {
                        EmptyState(title: "No matching items", message: "Try another status or search query.")
                    } else {
                        ForEach(vm.libraryItems) { item in
                            Button { vm.selectedItem = item } label: {
                                ItemCard(item: item, compact: true)
                            }
                        }
                    }
                }
                .listRowBackground(ResurfaceStyle.card)
            }
            .resurfaceScreen()
            .navigationTitle("Library")
            .searchable(text: $vm.searchText, prompt: "Search saved things")
            .onSubmit(of: .search) { Task { await vm.refreshLibrary() } }
            .toolbar { ResurfaceToolbar(vm: vm) }
            .refreshable { await vm.refreshLibrary() }
        }
    }
}
