import Foundation

struct APIEnvelope<T: Decodable>: Decodable {
    let data: T
}

struct APIError: Decodable {
    let error: String
}

struct HealthPayload: Decodable {
    let app: String
    let status: String
    let timestamp: String
    let database: DatabaseHealth
    let apiVersion: String
}

struct DatabaseHealth: Decodable, Hashable {
    let totalItems: Int
    let counts: [String: Int]
}

enum ResurfaceStatus: String, CaseIterable, Identifiable, Codable {
    case active
    case snoozed
    case archived
    case dropped

    var id: String { rawValue }

    var label: String {
        switch self {
        case .active: "Active"
        case .snoozed: "Snoozed"
        case .archived: "Archived"
        case .dropped: "Dropped"
        }
    }
}

enum SnoozePreset: String, CaseIterable, Identifiable, Codable {
    case tomorrow
    case thisWeekend = "this-weekend"
    case nextWeek = "next-week"
    case inAMonth = "in-a-month"
    case surprise

    var id: String { rawValue }

    var label: String {
        switch self {
        case .tomorrow: "Tomorrow"
        case .thisWeekend: "3 days"
        case .nextWeek: "Next week"
        case .inAMonth: "Month"
        case .surprise: "Surprise"
        }
    }
}

struct ResurfaceItem: Identifiable, Decodable, Hashable {
    let id: String
    let url: String?
    let title: String
    let summary: String?
    let previewSiteName: String?
    let previewDescription: String?
    let previewImageUrl: String?
    let previewFetchedAt: String?
    let originalText: String
    let category: String
    let suggestedArchive: String?
    let tags: [String]
    let source: String
    let sourceItemId: String?
    let capturedAt: String
    let ingestedAt: String
    let lastSurfacedAt: String?
    let surfaceCount: Int
    let status: ResurfaceStatus
    let suppressUntil: String?
    let archivedAt: String?
    let archivedTo: String?
    let droppedAt: String?
    let fingerprint: String
    let snoozeCount: Int

    var displayURL: String? {
        guard let url, let parsed = URL(string: url) else { return url }
        return parsed.host()?.replacingOccurrences(of: "www.", with: "") ?? url
    }

    var excerpt: String? {
        if let previewDescription, !previewDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return previewDescription
        }
        if let summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return summary
        }
        let text = originalText.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty || text == url || text == title { return nil }
        return text.count > 220 ? String(text.prefix(217)) + "…" : text
    }
}

struct NextItemPayload: Decodable {
    let item: ResurfaceItem?
    let forceDecision: Bool
    let remaining: Int
}

struct ItemListPayload: Decodable {
    let items: [ResurfaceItem]
    let total: Int
    let page: Int
    let totalPages: Int
    let pageSize: Int
    let counts: [String: Int]
}

struct SessionPayload: Decodable {
    let items: [ResurfaceItem]
    let count: Int
}

struct ItemActionPayload: Decodable {
    let item: ResurfaceItem
}

struct IngestPayload: Decodable {
    let source: String
    let scanned: Int
    let persisted: Int
    let duplicates: Int
    let invalid: Int
    let invalidReasons: [String]
}

struct CaptureDraft: Codable, Equatable {
    var text = ""
    var notes = ""

    var trimmedText: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    var trimmedNotes: String { notes.trimmingCharacters(in: .whitespacesAndNewlines) }
    var canSave: Bool { !trimmedText.isEmpty }
    var hasContent: Bool { !trimmedText.isEmpty || !trimmedNotes.isEmpty }

    var asInput: CaptureInput {
        let isURL = trimmedText.range(of: #"^https?://"#, options: .regularExpression) != nil
        return CaptureInput(
            source: "ios",
            sourceItemId: nil,
            text: isURL ? (trimmedNotes.isEmpty ? trimmedText : trimmedNotes) : trimmedText,
            url: isURL ? trimmedText : nil,
            capturedAt: nil,
            summary: trimmedNotes.isEmpty ? nil : trimmedNotes,
            title: nil
        )
    }
}

struct CaptureInput: Encodable {
    let source: String?
    let sourceItemId: String?
    let text: String
    let url: String?
    let capturedAt: String?
    let summary: String?
    let title: String?
}

struct CaptureRequest: Encodable {
    let source: String
    let items: [CaptureInput]
}

struct ArchiveRequest: Encodable {
    let archivedTo: String?
}

struct SnoozeRequest: Encodable {
    let preset: SnoozePreset
}

enum ResurfaceError: LocalizedError {
    case invalidBackendURL
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidBackendURL: "Invalid Resurface backend URL"
        case .server(let message): message
        }
    }
}
