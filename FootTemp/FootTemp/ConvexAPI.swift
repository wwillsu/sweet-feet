import Foundation

/// Minimal client for Convex's HTTP query API (POST /api/query). The app only reads:
/// it never calls the ingest mutations and never holds INGEST_KEY.
struct ConvexAPI {
    let baseURL: URL

    enum APIError: LocalizedError {
        case server(String)
        case unexpected(Int)

        var errorDescription: String? {
            switch self {
            case .server(let message): message
            case .unexpected(let code): "Unexpected response from the backend (HTTP \(code))."
            }
        }
    }

    private struct Envelope<T: Decodable>: Decodable {
        let status: String
        let value: T?
        let errorMessage: String?
    }

    func query<T: Decodable>(_ path: String, _ args: [String: Any] = [:]) async throws -> T? {
        var request = URLRequest(url: baseURL.appending(path: "api/query"))
        request.httpMethod = "POST"
        request.timeoutInterval = 5
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["path": path, "args": args, "format": "json"])

        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        // Convex returns JSON for function errors too; anything else isn't a Convex backend.
        guard let envelope = try? JSONDecoder().decode(Envelope<T>.self, from: data) else {
            throw APIError.unexpected(code)
        }
        guard envelope.status == "success" else {
            throw APIError.server(envelope.errorMessage ?? "Query \(path) failed.")
        }
        return envelope.value
    }
}
