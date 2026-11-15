#include "../src/core/globals.h"
#include "../src/node/server.h"
#include "../src/utils/profile.h"
#include <fstream>
#include <iostream>
#include <stdexcept>

// Link the actual server launcher, with only its application/UI dependencies
// replaced. The child is a real console executable started by CreateProcessW.
HWND g_hWnd = nullptr;
std::atomic_bool g_nodeRunning = false;
std::thread g_nodeThread;
HANDLE g_nodeProcess = nullptr, g_nodeOutPipe = nullptr, g_nodeInPipe = nullptr, g_serverJob = nullptr;
std::vector<nlohmann::json> g_outboundMessages;
static std::filesystem::path appDirectory;
std::wstring GetExeDirectory() { return appDirectory.wstring(); }
bool FileExists(const std::wstring& path) { return std::filesystem::is_regular_file(path); }
void AppendToCrashLog(const std::wstring&) { std::cerr << "Streaming-server startup failed\n"; }
void AppendToCrashLog(const std::string&) { std::cerr << "Streaming-server startup failed\n"; }
static void Check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }

int wmain(int argc, wchar_t* argv[]) {
    if (argc != 2) return 2;
    const auto initialDirectory = std::filesystem::current_path();
    const auto tempDirectory = std::filesystem::temp_directory_path();
    // Spaces and a non-ASCII name exercise Windows path quoting and UTF-16.
    const auto testDirectory = tempDirectory / (L"Kai startup \u03a9 " + std::to_wstring(GetCurrentProcessId()) +
        L" " + std::to_wstring(GetTickCount64()));
    try {
        appDirectory = testDirectory / L"Application with spaces";
        std::filesystem::create_directories(appDirectory / L"user-data/local");
        std::ofstream(appDirectory / L"user-data/local/existing-profile.txt") << "keep";
        Check(!ConfigureUserData(L"relative-directory"), "Relative profile roots must be rejected");
        Check(ConfigureUserData(appDirectory), "Cannot initialize portable profile");
        std::string marker;
        std::ifstream(appDirectory / L"user-data/local/existing-profile.txt") >> marker;
        Check(marker == "keep", "Existing profile marker changed");
        std::filesystem::copy_file(argv[1], appDirectory / L"stremio-runtime.exe");
        std::ofstream(appDirectory / L"server.js") << "fixture";
        const auto otherDirectory = testDirectory / L"Unrelated working directory";
        std::filesystem::create_directories(otherDirectory);
        std::filesystem::current_path(otherDirectory);
        Check(StartNodeServer(), "Server did not start from an unrelated working directory");
        Check(WaitForSingleObject(g_nodeProcess, 10000) == WAIT_OBJECT_0, "Child did not exit");
        DWORD exitCode = 1;
        Check(GetExitCodeProcess(g_nodeProcess, &exitCode) && exitCode == 0, "Child startup contract failed");
        StopNodeServer();
        int correctPaths = 0, correctProfile = 0, hiddenConsole = 0;
        std::ifstream(appDirectory / L"startup-result.txt") >> correctPaths >> correctProfile >> hiddenConsole;
        Check(correctPaths && correctProfile && hiddenConsole, "Paths, profile inheritance or console visibility failed");
        std::cout << "PASS: existing profile preserved; paths with spaces/Unicode; absolute server launch from another directory; no child console.\n";
    } catch (const std::exception& error) {
        StopNodeServer();
        std::cerr << error.what() << '\n';
        return 1;
    }
    if (g_serverJob) CloseHandle(g_serverJob);
    std::filesystem::current_path(initialDirectory);
    Check(testDirectory.is_absolute() && std::filesystem::equivalent(testDirectory.parent_path(), tempDirectory),
        "Cleanup target escaped the temporary directory");
    std::error_code cleanupError;
    std::filesystem::remove_all(testDirectory, cleanupError);
    return 0;
}
