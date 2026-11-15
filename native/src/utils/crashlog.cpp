#include "crashlog.h"
#include <fstream>
#include <iomanip>
#include <ctime>
#include "../core/globals.h"
#include "../mpv/player.h"
#include "../node/server.h"
#include "../tray/tray.h"
#include "../utils/helpers.h"
#include <gdiplus.h>
#include <sstream>
#include "discord_rpc.h"

#include "config.h"
#include "../simkl/simkl.h"

static std::wstring GetDailyCrashLogPath()
{
    std::time_t t = std::time(nullptr);
    std::tm localTime;
    localtime_s(&localTime, &t);

    std::wstringstream filename;
    filename << L"\\errors-"
             << localTime.tm_mday << L"."
             << (localTime.tm_mon + 1) << L"."
             << (localTime.tm_year + 1900) << L".txt";

    std::wstring exeDir = GetExeDirectory();
    std::wstring pcDir  = exeDir + L"\\portable_config";
    return pcDir + filename.str();
}

void AppendToCrashLog(const std::wstring& message)
{
    std::wofstream logFile;
    logFile.open(GetDailyCrashLogPath(), std::ios::app);
    if(!logFile.is_open()) {
        return;
    }
    std::time_t t = std::time(nullptr);
    std::tm localTime;
    localtime_s(&localTime, &t);
    logFile << L"[" << std::put_time(&localTime, L"%H:%M:%S") << L"] "
            << message << std::endl;
}

void AppendToCrashLog(const std::string& message)
{
    std::wstring wmsg(message.begin(), message.end());
    AppendToCrashLog(wmsg);
}

void Cleanup()
{
    //Save Settings
    SaveSettings();
    simkl::Shutdown();
    // Shut down mpv
    CleanupMPV();
    // Shut down Node
    StopNodeServer();
    // Remove tray icon
    RemoveTrayIcon();

    // GDI+ cleanup
    if(g_gdiplusToken) {
        Gdiplus::GdiplusShutdown(g_gdiplusToken);
    }

    Discord_Shutdown();

    UnregisterHotKey(g_hWnd, 1);
}
