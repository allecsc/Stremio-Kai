#include "server.h"
#include <windows.h>
#include <shlobj.h>
#include <string>
#include <thread>
#include <atomic>
#include <iostream>
#include "../core/globals.h"
#include "../ui/mainwindow.h"
#include "../utils/crashlog.h"
#include "../utils/helpers.h"

static void NodeOutputThreadProc()
{
    char buf[1024];
    DWORD readSz=0;
    while(g_nodeRunning){
        BOOL ok = ReadFile(g_nodeOutPipe, buf, sizeof(buf)-1, &readSz, nullptr);
        if(!ok || readSz==0) break;
        buf[readSz]='\0';
        std::cout<<"[node] "<<buf;
    }
    std::cout<<"NodeOutputThreadProc done.\n";
}

bool StartNodeServer()
{
    std::wstring exeDir   = GetExeDirectory();
    std::wstring exePath = exeDir + L"\\stremio-runtime.exe";
    std::wstring scriptPath = exeDir + L"\\server.js";

    if (!FileExists(exePath) || !FileExists(scriptPath)) {
        // Check alternative path in %localappdata%
        wchar_t localAppData[MAX_PATH];
        if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, localAppData))) {
            std::wstring altDir = std::wstring(localAppData) + L"\\Programs\\StremioService";
            std::wstring altExePath = altDir + L"\\stremio-runtime.exe";
            std::wstring altScriptPath = altDir + L"\\server.js";

            if (FileExists(altExePath) && FileExists(altScriptPath)) {
                exePath = altExePath;
                scriptPath = altScriptPath;
                exeDir = altDir;
            } else {
                AppendToCrashLog(L"[NODE]: Missing stremio-runtime.exe and server.js in both exeDir and localappdata.");
                return false;
            }
        } else {
            AppendToCrashLog(L"[NODE]: Failed to retrieve local app data path.");
            return false;
        }
    }

    if (!g_serverJob) {
        g_serverJob = CreateJobObject(nullptr, nullptr);
        if(!g_serverJob){
            AppendToCrashLog(L"[NODE]: Failed to create Job Object.");
            return false;
        }
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION jobInfo = {0};
        jobInfo.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(g_serverJob, JobObjectExtendedLimitInformation, &jobInfo, sizeof(jobInfo));
    }

    SECURITY_ATTRIBUTES sa;ZeroMemory(&sa, sizeof(sa));
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    HANDLE outR=nullptr, outW=nullptr;
    if(!CreatePipe(&outR,&outW,&sa,0)){
        AppendToCrashLog(L"[NODE]: CreatePipe fail1");
        return false;
    }
    SetHandleInformation(outR,HANDLE_FLAG_INHERIT,0);

    HANDLE inR=nullptr, inW=nullptr;
    if(!CreatePipe(&inR,&inW,&sa,0)){
        AppendToCrashLog(L"[NODE]: CreatePipe fail2");
        CloseHandle(outR);CloseHandle(outW);
        return false;
    }
    SetHandleInformation(inW,HANDLE_FLAG_INHERIT,0);

    STARTUPINFOW si;ZeroMemory(&si,sizeof(si));
    si.cb=sizeof(si);
    si.hStdOutput=outW; si.hStdError=outW; si.hStdInput=inR;
    si.dwFlags=STARTF_USESTDHANDLES;

    PROCESS_INFORMATION pi;ZeroMemory(&pi,sizeof(pi));
    std::wstring cmdLine = L"\"stremio-runtime.exe\" \"server.js\"";

    SetEnvironmentVariableW(L"NO_CORS", L"1");
    BOOL success = CreateProcessW(
        nullptr, &cmdLine[0],
        nullptr,nullptr, TRUE,
        CREATE_NO_WINDOW,nullptr,nullptr,
        &si, &pi
    );
    CloseHandle(inR);
    CloseHandle(outW);
    if(!success){
        std::wstring err = L"Failed to launch stremio-runtime.exe\nGetLastError=" + std::to_wstring(GetLastError());
        AppendToCrashLog(err);
        CloseHandle(inW);CloseHandle(outR);
        return false;
    }

    // Ensure the process belongs to the job
    AssignProcessToJobObject(g_serverJob, pi.hProcess);

    g_nodeProcess = pi.hProcess;
    CloseHandle(pi.hThread);

    g_nodeRunning = true;
    g_nodeOutPipe = outR;
    g_nodeInPipe  = inW;
    g_nodeThread  = std::thread(NodeOutputThreadProc);

    std::cout<<"Node server started.\n";

    // Let front-end know:
    nlohmann::json j;
    j["type"] ="ServerStarted";
    g_outboundMessages.push_back(j);
    PostMessage(g_hWnd, WM_NOTIFY_FLUSH, 0, 0);

    return true;
}

void StopNodeServer()
{
    if(g_nodeRunning){
        g_nodeRunning=false;
        if(g_nodeProcess){
            TerminateProcess(g_nodeProcess,0);
            WaitForSingleObject(g_nodeProcess,INFINITE);
            CloseHandle(g_nodeProcess); g_nodeProcess=nullptr;
        }
        if(g_nodeThread.joinable()) g_nodeThread.join();
        if(g_nodeOutPipe){CloseHandle(g_nodeOutPipe); g_nodeOutPipe=nullptr;}
        if(g_nodeInPipe){CloseHandle(g_nodeInPipe);   g_nodeInPipe=nullptr;}
        std::cout<<"Node server stopped.\n";
    }
}
