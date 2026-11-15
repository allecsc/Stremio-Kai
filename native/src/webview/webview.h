#ifndef WEBVIEW_H
#define WEBVIEW_H

#include <windows.h>
#include <string>

void InitWebView2(HWND hWnd);
void WaitAndRefreshIfNeeded();
void refreshWeb(bool refreshAll);
static void SetupWebMessageHandler();
static void SetupExtensions();
static void SetupWebMods();

#endif // WEBVIEW_H
