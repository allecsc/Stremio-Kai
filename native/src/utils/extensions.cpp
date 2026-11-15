#include "extensions.h"

#include <iostream>
#include <string>
#include "../core/globals.h"

bool HandleExtensions(const std::wstring& finalUri) {
    bool handledPremid = HandlePremidLogin(finalUri);
    bool handledStylus = HandleStylusUsoInstall(finalUri);
    return handledPremid || handledStylus;
}

bool HandlePremidLogin(const std::wstring& finalUri) {
    if (finalUri.rfind(L"https://login.premid.app", 0) == 0 && finalUri.rfind(L"https://discord.com", 0) != 0) {
        std::wstring extensionId;
        auto it = std::find_if(g_extensionMap.begin(), g_extensionMap.end(),
            [](const std::pair<std::wstring, std::wstring>& p) -> bool {
                return p.first.find(L"premid") != std::wstring::npos;
            });
        if (it != g_extensionMap.end()) {
            extensionId = it->second;
        } else {
            std::wcout << L"[EXTENSIONS]: Extension id not found\n";
            g_webview->Navigate(g_webuiUrl.c_str());
            return true;
        }

        std::wstring codeParam;
        size_t codePos = finalUri.find(L"code=");
        if (codePos != std::wstring::npos) {
            codePos += 5; // Move past "code="
            size_t ampPos = finalUri.find(L'&', codePos);
            if (ampPos == std::wstring::npos) {
                codeParam = finalUri.substr(codePos);
            } else {
                codeParam = finalUri.substr(codePos, ampPos - codePos);
            }
        }
        std::wstring script = L"globalThis.getAuthorizationCode(\"" + codeParam + L"\");";
        g_scriptQueue.push_back(script);

        std::wstring uri = L"chrome-extension://" + extensionId + L"/popup.html";
        g_webview->Navigate(uri.c_str());
        return true;
    }
    return false;
}

bool HandleStylusUsoInstall(const std::wstring& finalUri) {
    if (finalUri.rfind(L"https://raw.githubusercontent.com/uso-archive", 0) == 0) {
        std::wstring extensionId;
        auto it = std::find_if(g_extensionMap.begin(), g_extensionMap.end(),
            [](const std::pair<std::wstring, std::wstring>& p) -> bool {
                return p.first.find(L"stylus") != std::wstring::npos;
            });
        if (it != g_extensionMap.end()) {
            extensionId = it->second;
        } else {
            std::wcout << L"[EXTENSIONS]: Extension id not found\n";
            g_webview->Navigate(g_webuiUrl.c_str());
            return true;
        }
        std::wstring uri = L"chrome-extension://" + extensionId + L"/install-usercss.html?updateUrl=" + finalUri;
        g_webview->Navigate(uri.c_str());
        return true;
    }
    return false;
}
