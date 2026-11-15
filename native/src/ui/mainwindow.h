#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <string>
#include <windows.h>
#include "nlohmann/json.hpp"

LRESULT CALLBACK WndProc(HWND, UINT, WPARAM, LPARAM);

// Helper for single-instance
bool CheckSingleInstance(int argc, char* argv[], std::wstring &outProtocolArg);
bool FocusExistingInstance(const std::wstring& protocolArg);

// Our "ToggleFullScreen" logic
void ToggleFullScreen(HWND hWnd, bool enable);

// Webview
void HandleInboundJSON(const std::string &msg);
void SendToJS(const std::string &eventName, const nlohmann::json &eventData);
void HandleEvent(const std::string &ev, std::vector<std::string> &args);

#endif // MAINWINDOW_H
