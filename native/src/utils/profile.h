#pragma once
#include <windows.h>
#include <filesystem>
#include <initializer_list>

// Match the original portable launcher's folders before starting WebView, Simkl
// or any child process. Direct EXE launches must use the same existing profile.
inline bool ConfigureUserData(const std::filesystem::path& appDirectory) {
    if (!appDirectory.is_absolute()) return false;
    try {
        const auto root = appDirectory / L"user-data";
        for (const auto* folder : {L"webview", L"local", L"roaming"})
            std::filesystem::create_directories(root / folder);
        return SetEnvironmentVariableW(L"WEBVIEW2_USER_DATA_FOLDER", (root / L"webview").c_str()) &&
            SetEnvironmentVariableW(L"LOCALAPPDATA", (root / L"local").c_str()) &&
            SetEnvironmentVariableW(L"APPDATA", (root / L"roaming").c_str());
    } catch (const std::filesystem::filesystem_error&) {
        return false;
    }
}
