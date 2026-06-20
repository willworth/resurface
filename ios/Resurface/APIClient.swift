import Foundation

struct ResurfaceAPIClient {
    var backendURL: String

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func health() async throws -> HealthPayload {
        try await request("/api/v1/health")
    }

    func nextItem(excluding excludedIds: [String] = []) async throws -> NextItemPayload {
        guard !excludedIds.isEmpty else {
            return try await request("/api/v1/items/next")
        }

        var components = URLComponents()
        components.path = "/api/v1/items/next"
        components.queryItems = excludedIds.map { URLQueryItem(name: "exclude", value: $0) }
        return try await request(components.string ?? "/api/v1/items/next")
    }

    func session(count: Int = 10) async throws -> SessionPayload {
        try await request("/api/v1/items/session?count=\(count)")
    }

    func listItems(status: ResurfaceStatus = .active, query: String = "", page: Int = 1, limit: Int = 50) async throws -> ItemListPayload {
        var components = URLComponents()
        components.path = "/api/v1/items"
        components.queryItems = [
            URLQueryItem(name: "status", value: status.rawValue),
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "sort", value: "captured_at"),
            URLQueryItem(name: "dir", value: "desc"),
        ]
        if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            components.queryItems?.append(URLQueryItem(name: "q", value: query))
        }
        return try await request(components.string ?? "/api/v1/items")
    }

    func capture(_ draft: CaptureDraft) async throws -> IngestPayload {
        let body = CaptureRequest(source: "ios", items: [draft.asInput])
        return try await request("/api/v1/items", method: "POST", body: body)
    }

    func archive(id: String, archivedTo: String?) async throws -> ResurfaceItem {
        let payload: ItemActionPayload = try await request(
            "/api/v1/items/\(encodePath(id))/archive",
            method: "POST",
            body: ArchiveRequest(archivedTo: archivedTo)
        )
        return payload.item
    }

    func snooze(id: String, preset: SnoozePreset) async throws -> ResurfaceItem {
        let payload: ItemActionPayload = try await request(
            "/api/v1/items/\(encodePath(id))/snooze",
            method: "POST",
            body: SnoozeRequest(preset: preset)
        )
        return payload.item
    }

    func pass(id: String) async throws -> ResurfaceItem {
        let empty: EmptyBody? = nil
        let payload: ItemActionPayload = try await request(
            "/api/v1/items/\(encodePath(id))/pass",
            method: "POST",
            body: empty
        )
        return payload.item
    }

    func drop(id: String) async throws -> ResurfaceItem {
        let empty: EmptyBody? = nil
        let payload: ItemActionPayload = try await request(
            "/api/v1/items/\(encodePath(id))/drop",
            method: "POST",
            body: empty
        )
        return payload.item
    }

    private func request<T: Decodable, B: Encodable>(_ path: String, method: String = "GET", body: B? = nil) async throws -> T {
        guard let url = buildURL(path: path) else { throw ResurfaceError.invalidBackendURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ResurfaceError.server("Bad response")
        }

        guard (200..<300).contains(http.statusCode) else {
            if let apiError = try? decoder.decode(APIError.self, from: data) {
                throw ResurfaceError.server(apiError.error)
            }
            throw ResurfaceError.server("HTTP \(http.statusCode)")
        }

        return try decoder.decode(APIEnvelope<T>.self, from: data).data
    }

    private func request<T: Decodable>(_ path: String) async throws -> T {
        let empty: EmptyBody? = nil
        return try await request(path, body: empty)
    }

    private func buildURL(path: String) -> URL? {
        let cleanBase = backendURL
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let cleanPath = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(cleanBase)\(cleanPath)")
    }

    private func encodePath(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove("/")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}

private struct EmptyBody: Encodable {}
