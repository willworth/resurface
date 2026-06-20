import Foundation
import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@MainActor
final class ResurfaceViewModel: ObservableObject {
    @AppStorage("resurfaceBackendURL") var backendURL = "https://wills-mac-mini.taild4212d.ts.net:7790"
    private static let lightModeKey = "resurfaceUseLightMode"

    @Published var health: HealthPayload?
    @Published var current: ResurfaceItem?
    @Published var forceDecision = false
    @Published var remaining = 0
    @Published var libraryItems: [ResurfaceItem] = []
    @Published var selectedItem: ResurfaceItem?
    @Published var selectedStatus: ResurfaceStatus = .active
    @Published var searchText = ""
    @Published var captureDraft = CaptureDraft() { didSet { persistCaptureDraft() } }
    @Published var archiveDestination = ""
    @Published var status = "Not connected"
    @Published var lastError: String?
    @Published var isLoading = false
    @Published var showSettings = false
    @Published var useLightMode: Bool {
        didSet {
            UserDefaults.standard.set(useLightMode, forKey: Self.lightModeKey)
        }
    }

    private let captureDraftKey = "resurfaceCaptureDraft"
    private var passedItemIds: [String] = []
    private var client: ResurfaceAPIClient { ResurfaceAPIClient(backendURL: backendURL) }
    var preferredColorScheme: ColorScheme { useLightMode ? .light : .dark }

    init() {
        useLightMode = UserDefaults.standard.bool(forKey: Self.lightModeKey)
        captureDraft = Self.loadCaptureDraft(key: captureDraftKey)
    }

    func start() {
        Task { await refresh() }
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let health = client.health()
            async let next = client.nextItem(excluding: passedItemIds)
            async let list = client.listItems(status: selectedStatus, query: searchText)
            self.health = try await health
            let nextPayload = try await next
            current = nextPayload.item
            forceDecision = nextPayload.forceDecision
            remaining = nextPayload.remaining
            archiveDestination = nextPayload.item?.suggestedArchive ?? ""
            libraryItems = try await list.items
            status = "Connected"
            lastError = nil
        } catch {
            status = "Connection failed"
            lastError = error.localizedDescription
        }
    }

    func refreshLibrary() async {
        do {
            let payload = try await client.listItems(status: selectedStatus, query: searchText)
            libraryItems = payload.items
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    func capture() async {
        guard captureDraft.canSave else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await client.capture(captureDraft)
            clearCaptureDraft()
            status = result.duplicates > 0 ? "Already saved" : "Saved"
            lastError = nil
            await refresh()
        } catch {
            status = "Capture failed"
            lastError = error.localizedDescription
        }
    }

    func archiveCurrent() async {
        guard let item = current else { return }
        await archive(item, archivedTo: archiveDestination)
    }

    func archive(_ item: ResurfaceItem, archivedTo: String? = nil) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let destination = archivedTo?.trimmingCharacters(in: .whitespacesAndNewlines)
            let updated = try await client.archive(
                id: item.id,
                archivedTo: destination?.isEmpty == true ? nil : destination
            )
            selectedItem = selectedItem?.id == item.id ? updated : selectedItem
            status = "Archived"
            lastError = nil
            await refresh()
        } catch {
            status = "Archive failed"
            lastError = error.localizedDescription
        }
    }

    func snoozeCurrent(_ preset: SnoozePreset) async {
        guard let item = current else { return }
        await snooze(item, preset: preset)
    }

    func snooze(_ item: ResurfaceItem, preset: SnoozePreset) async {
        guard !forceDecision || current?.id != item.id else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let updated = try await client.snooze(id: item.id, preset: preset)
            selectedItem = selectedItem?.id == item.id ? updated : selectedItem
            status = "Snoozed"
            lastError = nil
            await refresh()
        } catch {
            status = "Snooze failed"
            lastError = error.localizedDescription
        }
    }

    func passCurrent() async {
        guard let item = current else { return }
        await pass(item)
    }

    func pass(_ item: ResurfaceItem) async {
        if !passedItemIds.contains(item.id) {
            passedItemIds.append(item.id)
        }
        isLoading = true
        defer { isLoading = false }

        do {
            let updated = try await client.pass(id: item.id)
            selectedItem = selectedItem?.id == item.id ? updated : selectedItem
            status = "Passed"
            lastError = nil
            await refresh()
        } catch {
            passedItemIds.removeAll { $0 == item.id }
            status = "Pass failed"
            lastError = error.localizedDescription
        }
    }

    func dropCurrent() async {
        guard let item = current else { return }
        await drop(item)
    }

    func drop(_ item: ResurfaceItem) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let updated = try await client.drop(id: item.id)
            selectedItem = selectedItem?.id == item.id ? updated : selectedItem
            status = "Dropped"
            lastError = nil
            await refresh()
        } catch {
            status = "Drop failed"
            lastError = error.localizedDescription
        }
    }

    func openURL(for item: ResurfaceItem) {
        guard let raw = item.url, let url = URL(string: raw) else { return }
#if os(iOS)
        UIApplication.shared.open(url)
#elseif os(macOS)
        NSWorkspace.shared.open(url)
#endif
    }

    func clearCaptureDraft() {
        captureDraft = CaptureDraft()
        UserDefaults.standard.removeObject(forKey: captureDraftKey)
    }

    private func persistCaptureDraft() {
        guard captureDraft.hasContent else {
            UserDefaults.standard.removeObject(forKey: captureDraftKey)
            return
        }
        if let data = try? JSONEncoder().encode(captureDraft) {
            UserDefaults.standard.set(data, forKey: captureDraftKey)
        }
    }

    private static func loadCaptureDraft(key: String) -> CaptureDraft {
        guard let data = UserDefaults.standard.data(forKey: key),
              let draft = try? JSONDecoder().decode(CaptureDraft.self, from: data) else {
            return CaptureDraft()
        }
        return draft
    }
}
