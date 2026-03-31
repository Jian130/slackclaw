import Foundation
import Observation
import AppKit
import ChillClawClient
import ChillClawProtocol

enum DaemonEndpointState: Equatable, Sendable {
    case ready(URL)
    case unavailable(String)
}

actor DaemonEndpointStore {
    private let configuration: ChillClawClientConfiguration
    private let ping: @Sendable () async throws -> Bool
    private(set) var state: DaemonEndpointState

    init(
        configuration: ChillClawClientConfiguration,
        ping: @escaping @Sendable () async throws -> Bool
    ) {
        self.configuration = configuration
        self.ping = ping
        self.state = .unavailable("ChillClaw daemon has not been checked yet.")
    }

    func refresh() async {
        do {
            let ok = try await ping()
            state = ok ? .ready(configuration.daemonURL) : .unavailable("ChillClaw daemon is not reachable.")
        } catch {
            state = .unavailable(error.localizedDescription)
        }
    }
}

struct LaunchAgentStatus: Equatable, Sendable {
    var installed: Bool
    var running: Bool
    var detail: String
}

protocol LaunchAgentControlling: AnyObject, Sendable {
    func installAndStart() async throws
    func stopAndRemove() async throws
    func restart() async throws
    func status() async -> LaunchAgentStatus
}

actor LaunchAgentManager: LaunchAgentControlling {
    private let label: String

    init(label: String = "ai.chillclaw.daemon") {
        self.label = label
    }

    func installAndStart() async throws {
        let plistPath = try writePlist()
        let uid = try currentUID()
        _ = try await run("/bin/launchctl", ["bootout", "gui/\(uid)/\(label)"], allowFailure: true)
        _ = try await run("/bin/launchctl", ["bootstrap", "gui/\(uid)", plistPath])
        _ = try await run("/bin/launchctl", ["kickstart", "-k", "gui/\(uid)/\(label)"])
    }

    func stopAndRemove() async throws {
        let uid = try currentUID()
        _ = try await run("/bin/launchctl", ["bootout", "gui/\(uid)/\(label)"], allowFailure: true)
        let plistPath = launchAgentPlistPath()
        try? FileManager.default.removeItem(atPath: plistPath)
    }

    func restart() async throws {
        try await installAndStart()
    }

    func status() async -> LaunchAgentStatus {
        do {
            let plistPath = launchAgentPlistPath()
            let installed = FileManager.default.fileExists(atPath: plistPath)
            let uid = try currentUID()
            let result = try await run("/bin/launchctl", ["print", "gui/\(uid)/\(label)"], allowFailure: true)
            return LaunchAgentStatus(
                installed: installed,
                running: result.code == 0,
                detail: result.stdout.isEmpty ? result.stderr : result.stdout
            )
        } catch {
            return LaunchAgentStatus(installed: false, running: false, detail: error.localizedDescription)
        }
    }

    private func writePlist() throws -> String {
        let launchAgentsDir = (NSHomeDirectory() as NSString).appendingPathComponent("Library/LaunchAgents")
        try FileManager.default.createDirectory(atPath: launchAgentsDir, withIntermediateDirectories: true)
        let plistPath = launchAgentPlistPath()
        let appRoot = try appRootPath()
        let appSupport = (NSHomeDirectory() as NSString).appendingPathComponent("Library/Application Support/ChillClaw")
        let dataDir = (appSupport as NSString).appendingPathComponent("data")
        let logDir = (appSupport as NSString).appendingPathComponent("logs")
        try FileManager.default.createDirectory(atPath: dataDir, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(atPath: logDir, withIntermediateDirectories: true)
        let runScript = ((appRoot as NSString).appendingPathComponent("app/scripts/run-daemon.sh"))
        let staticDir = ((appRoot as NSString).appendingPathComponent("app/ui"))
        let bootstrap = ((appRoot as NSString).appendingPathComponent("app/scripts/bootstrap-openclaw.mjs"))
        let logPath = (logDir as NSString).appendingPathComponent("daemon.log")

        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>Label</key>
          <string>\(label)</string>
          <key>ProgramArguments</key>
          <array>
            <string>\(runScript)</string>
            <string>launchagent</string>
          </array>
          <key>EnvironmentVariables</key>
          <dict>
            <key>CHILLCLAW_APP_ROOT</key>
            <string>\(appRoot)</string>
            <key>CHILLCLAW_PORT</key>
            <string>4545</string>
            <key>CHILLCLAW_DATA_DIR</key>
            <string>\(dataDir)</string>
            <key>CHILLCLAW_STATIC_DIR</key>
            <string>\(staticDir)</string>
            <key>CHILLCLAW_OPENCLAW_BOOTSTRAP_SCRIPT</key>
            <string>\(bootstrap)</string>
            <key>CHILLCLAW_LAUNCHAGENT_LABEL</key>
            <string>\(label)</string>
          </dict>
          <key>KeepAlive</key>
          <true/>
          <key>RunAtLoad</key>
          <true/>
          <key>StandardOutPath</key>
          <string>\(logPath)</string>
          <key>StandardErrorPath</key>
          <string>\(logPath)</string>
          <key>ProcessType</key>
          <string>Background</string>
        </dict>
        </plist>
        """

        try plist.write(toFile: plistPath, atomically: true, encoding: .utf8)
        return plistPath
    }

    private func launchAgentPlistPath() -> String {
        (NSHomeDirectory() as NSString).appendingPathComponent("Library/LaunchAgents/\(label).plist")
    }

    private func appRootPath() throws -> String {
        guard let resourceURL = Bundle.main.resourceURL else {
            throw NativeClientError.runtime("ChillClaw app resources are unavailable.")
        }
        return resourceURL.path
    }

    private func currentUID() throws -> String {
        let uid = getuid()
        return String(uid)
    }

    @discardableResult
    private func run(_ command: String, _ args: [String], allowFailure: Bool = false) async throws -> ShellResult {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: command)
            process.arguments = args

            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe

            process.terminationHandler = { process in
                let stdout = String(data: stdoutPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let stderr = String(data: stderrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let result = ShellResult(code: process.terminationStatus, stdout: stdout.trimmingCharacters(in: .whitespacesAndNewlines), stderr: stderr.trimmingCharacters(in: .whitespacesAndNewlines))
                if !allowFailure && process.terminationStatus != 0 {
                    continuation.resume(throwing: NativeClientError.runtime(result.stderr.isEmpty ? result.stdout : result.stderr))
                } else {
                    continuation.resume(returning: result)
                }
            }

            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
}

struct ShellResult: Sendable {
    var code: Int32
    var stdout: String
    var stderr: String
}

enum DaemonProcessStatus: Equatable {
    case stopped
    case starting
    case running(details: String)
    case attachedExisting(details: String)
    case failed(String)
}

@MainActor
@Observable
final class DaemonProcessManager {
    private let launchAgent: LaunchAgentControlling
    private let ping: @Sendable () async throws -> Bool

    private(set) var status: DaemonProcessStatus = .stopped

    init(
        launchAgent: LaunchAgentControlling = LaunchAgentManager(),
        ping: @escaping @Sendable () async throws -> Bool
    ) {
        self.launchAgent = launchAgent
        self.ping = ping
    }

    func ensureRunning() async {
        do {
            if try await ping() {
                status = .attachedExisting(details: "Using existing ChillClaw daemon")
                return
            }

            status = .starting
            try await launchAgent.installAndStart()
            for _ in 0..<20 {
                try? await Task.sleep(nanoseconds: 250_000_000)
                if (try? await ping()) == true {
                    status = .running(details: "Daemon reachable")
                    return
                }
            }
            status = .failed("ChillClaw daemon did not become reachable in time.")
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    func restart() async {
        do {
            status = .starting
            try await launchAgent.restart()
            for _ in 0..<20 {
                try? await Task.sleep(nanoseconds: 250_000_000)
                if (try? await ping()) == true {
                    status = .running(details: "Daemon reachable")
                    return
                }
            }
            status = .failed("ChillClaw daemon did not come back after restart.")
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    func stop() async {
        do {
            try await launchAgent.stopAndRemove()
            status = .stopped
        } catch {
            status = .failed(error.localizedDescription)
        }
    }
}
