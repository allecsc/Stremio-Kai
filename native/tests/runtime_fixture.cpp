#include <windows.h>
#include <filesystem>
#include <fstream>
#include <string>

static std::wstring Env(const wchar_t* name) {
    const auto length = GetEnvironmentVariableW(name, nullptr, 0);
    if (!length) return {};
    std::wstring value(length, L'\0');
    value.resize(GetEnvironmentVariableW(name, value.data(), length));
    return value;
}
int wmain(int argc, wchar_t* argv[]) {
    if (argc != 2) return 2;
    const std::filesystem::path script(argv[1]);
    const auto app = script.parent_path();
    const bool correctPaths = script.is_absolute() && std::filesystem::is_regular_file(script) &&
        std::filesystem::current_path() == app;
    const bool correctProfile = Env(L"LOCALAPPDATA") == (app / L"user-data" / L"local").wstring() &&
        Env(L"APPDATA") == (app / L"user-data" / L"roaming").wstring() &&
        Env(L"WEBVIEW2_USER_DATA_FOLDER") == (app / L"user-data" / L"webview").wstring();
    std::ofstream(app / L"startup-result.txt") << correctPaths << ' ' << correctProfile << ' ' << (GetConsoleWindow() == nullptr);
    return correctPaths && correctProfile && GetConsoleWindow() == nullptr ? 0 : 3;
}
