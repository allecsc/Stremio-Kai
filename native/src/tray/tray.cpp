#include "tray.h"

#include <iostream>
#include <windows.h>
#include <tchar.h>
#include <windowsx.h>

#include "../core/globals.h"
#include "../utils/crashlog.h"
#include "../utils/helpers.h"
#include "../ui/mainwindow.h"
#include "../resource.h"

static LRESULT CALLBACK DarkTrayMenuProc(HWND, UINT, WPARAM, LPARAM);
static HWND CreateDarkTrayMenuWindow();
static void ShowDarkTrayMenu();
static void CreateRoundedRegion(HWND hWnd, int w, int h, int radius);

void CreateTrayIcon(HWND hWnd)
{
    g_nid.cbSize=sizeof(NOTIFYICONDATA);
    g_nid.hWnd=hWnd;
    g_nid.uID=1;
    g_nid.uFlags=NIF_ICON|NIF_MESSAGE|NIF_TIP;
    g_nid.uCallbackMessage=WM_TRAYICON;

    HICON hIcon = LoadIcon(g_hInst, MAKEINTRESOURCE(IDR_MAINFRAME));
    g_nid.hIcon = hIcon;

    _tcscpy_s(g_nid.szTip, _T("Stremio SingleInstance"));

    Shell_NotifyIcon(NIM_ADD,&g_nid);
}

void RemoveTrayIcon()
{
    Shell_NotifyIcon(NIM_DELETE,&g_nid);
    if(g_nid.hIcon){
        DestroyIcon(g_nid.hIcon);
        g_nid.hIcon=nullptr;
    }
}

void LoadCustomMenuFont()
{
    if (g_hMenuFont) {
        DeleteObject(g_hMenuFont);
        g_hMenuFont = nullptr;
    }
    LOGFONTW lf = { 0 };
    lf.lfHeight = -g_font_height;
    lf.lfWeight = FW_MEDIUM;
    wcscpy_s(lf.lfFaceName, L"Arial Rounded MT");
    lf.lfQuality = CLEARTYPE_QUALITY;

    g_hMenuFont = CreateFontIndirectW(&lf);

    // fallback to system menu font if custom is not available
    if (!g_hMenuFont) {
        NONCLIENTMETRICSW ncm = { sizeof(ncm) };
        if (SystemParametersInfoW(SPI_GETNONCLIENTMETRICS, sizeof(ncm), &ncm, 0))
        {
            ncm.lfMenuFont.lfQuality = CLEARTYPE_QUALITY;
            g_hMenuFont = CreateFontIndirectW(&ncm.lfMenuFont);
        }
    }
    if (!g_hMenuFont) {
        std::cerr << "Failed to load custom menu font.\n";
        AppendToCrashLog("[FONT]: Failed to load custom menu font");
    }
}

void ShowTrayMenu(HWND hWnd)
{
    ShowDarkTrayMenu();
}

static HWND CreateDarkTrayMenuWindow()
{
    static bool s_classRegistered = false;
    if (!s_classRegistered)
    {
        WNDCLASSEXW wcex = { sizeof(wcex) };
        wcex.style         = CS_HREDRAW | CS_VREDRAW;
        wcex.lpfnWndProc   = DarkTrayMenuProc;
        wcex.hInstance     = GetModuleHandle(nullptr);
        wcex.hCursor       = LoadCursor(nullptr, IDC_ARROW);
        wcex.hbrBackground = nullptr;
        wcex.lpszClassName = L"DarkTrayMenuWnd";
        RegisterClassExW(&wcex);
        s_classRegistered = true;
    }

    HWND hMenuWnd = CreateWindowExW(
        WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
        L"DarkTrayMenuWnd",
        L"",
        WS_POPUP,
        0, 0, 200, 200,
        nullptr, nullptr, GetModuleHandle(nullptr), nullptr
    );
    if(!hMenuWnd) {
        DWORD errorCode = GetLastError();
        std::string errorMessage = "[TRAY]: Failed to create tray" + std::to_string(errorCode);
        std::cerr << errorMessage << "\n";
        AppendToCrashLog(errorMessage);
    }
    g_trayHwnd = hMenuWnd;
    return hMenuWnd;
}

static void CreateRoundedRegion(HWND hWnd, int w, int h, int radius)
{
    HRGN hrgn = CreateRoundRectRgn(0, 0, w, h, radius, radius);
    SetWindowRgn(hWnd, hrgn, TRUE);
}

static void ShowDarkTrayMenu()
{
    g_menuItems.clear();
    g_menuItems.push_back({ ID_TRAY_SHOWWINDOW,   g_showWindow,   false, L"Show Window" });
    g_menuItems.push_back({ ID_TRAY_ALWAYSONTOP,  g_alwaysOnTop,  false, L"Always on Top" });
    g_menuItems.push_back({ ID_TRAY_PICTURE_IN_PICTURE, g_isPipMode, false, L"Picture in Picture" });
    g_menuItems.push_back({ ID_TRAY_PAUSE_MINIMIZED, g_pauseOnMinimize, false, L"Pause Minimized" });
    g_menuItems.push_back({ ID_TRAY_PAUSE_FOCUS_LOST, g_pauseOnLostFocus, false, L"Pause Unfocused" });
    g_menuItems.push_back({ ID_TRAY_CLOSE_ON_EXIT, g_closeOnExit,  false, L"Close on Exit" });
    g_menuItems.push_back({ ID_TRAY_USE_DARK_THEME, g_useDarkTheme, false, L"Use Dark Theme" });
    g_menuItems.push_back({ 0, false, true, L"" });
    g_menuItems.push_back({ ID_TRAY_QUIT, false, false, L"Quit" });

    HWND hMenuWnd = CreateDarkTrayMenuWindow();
    int itemH = g_tray_itemH;
    int sepH  = g_tray_sepH;
    int w     = g_tray_w;
    int totalH = 0;
    for (auto &it: g_menuItems) {
        totalH += it.separator ? sepH : itemH;
    }

    POINT cursor;
    GetCursorPos(&cursor);
    int posX = cursor.x;
    int posY = cursor.y - totalH;

    int screenWidth  = GetSystemMetrics(SM_CXSCREEN);
    int screenHeight = GetSystemMetrics(SM_CYSCREEN);

    if (posX + w > screenWidth) {
        posX = cursor.x - w;
    }
    if (posX < 0) posX = 0;
    if (posY < 0) posY = 0;
    if (posY + totalH > screenHeight) posY = screenHeight - totalH;

    SetCapture(hMenuWnd);
    SetWindowPos(hMenuWnd, HWND_TOPMOST, posX, posY, w, totalH, SWP_SHOWWINDOW);
    CreateRoundedRegion(hMenuWnd, w, totalH, 10);
    ShowWindow(hMenuWnd, SW_SHOW);
    UpdateWindow(hMenuWnd);
    SetForegroundWindow(hMenuWnd);
    SetFocus(hMenuWnd);
}

static LRESULT CALLBACK DarkTrayMenuProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch(msg)
    {
    case WM_ACTIVATE:
        if (LOWORD(wParam) == WA_INACTIVE) {
            DestroyWindow(hWnd);
        }
        break;
    case WM_KILLFOCUS:
    case WM_CAPTURECHANGED:
        DestroyWindow(hWnd);
        break;
    case WM_ERASEBKGND:
        return 1;
    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hWnd, &ps);
        RECT rcClient;
        GetClientRect(hWnd, &rcClient);

        COLORREF bgBase, bgHover, txtNormal, txtCheck, lineColor;
        if (g_useDarkTheme)
        {
            bgBase   = RGB(30,30,30);
            bgHover  = RGB(50,50,50);
            txtNormal= RGB(200,200,200);
            txtCheck = RGB(200,200,200);
            lineColor= RGB(80,80,80);
        }
        else
        {
            bgBase   = RGB(240,240,240);
            bgHover  = RGB(200,200,200);
            txtNormal= RGB(0,0,0);
            txtCheck = RGB(0,0,0);
            lineColor= RGB(160,160,160);
        }

        HDC memDC = CreateCompatibleDC(hdc);
        HBITMAP memBmp = CreateCompatibleBitmap(hdc, rcClient.right, rcClient.bottom);
        HGDIOBJ oldMemBmp = SelectObject(memDC, memBmp);

        HBRUSH bgBrush = CreateSolidBrush(bgBase);
        FillRect(memDC, &rcClient, bgBrush);
        DeleteObject(bgBrush);

        int y = 0;
        int itemH = g_tray_itemH;
        int sepH  = g_tray_sepH;

        for (int i=0; i<(int)g_menuItems.size(); i++)
        {
            auto &it = g_menuItems[i];
            if(it.separator)
            {
                int midY = y + sepH/2;
                HPEN oldPen = (HPEN)SelectObject(memDC, CreatePen(PS_SOLID,1,lineColor));
                MoveToEx(memDC, 5, midY, nullptr);
                LineTo(memDC, rcClient.right-5, midY);
                DeleteObject(SelectObject(memDC, oldPen));
                y += sepH;
            }
            else
            {
                bool hovered = (i == g_hoverIndex);
                RECT itemRc = {0, y, rcClient.right, y+itemH};
                HBRUSH itemBg = CreateSolidBrush(hovered ? bgHover : bgBase);
                FillRect(memDC, &itemRc, itemBg);
                DeleteObject(itemBg);

                if(it.checked)
                {
                    RECT cbox = { 4, y, 20, y+itemH };
                    SetTextColor(memDC, txtCheck);
                    SetBkMode(memDC, TRANSPARENT);
                    DrawTextW(memDC, L"\u2713", -1, &cbox, DT_SINGLELINE | DT_CENTER | DT_VCENTER);
                }

                SetBkMode(memDC, TRANSPARENT);
                SetTextColor(memDC, txtNormal);

                HFONT oldFnt = (HFONT)SelectObject(memDC, g_hMenuFont);
                RECT textRc = { 24, y, rcClient.right-5, y+itemH };
                DrawTextW(memDC, it.text.c_str(), -1, &textRc, DT_SINGLELINE | DT_VCENTER | DT_LEFT);
                SelectObject(memDC, oldFnt);

                y += itemH;
            }
        }

        BitBlt(hdc, 0,0, rcClient.right, rcClient.bottom, memDC, 0,0, SRCCOPY);

        SelectObject(memDC, oldMemBmp);
        DeleteObject(memBmp);
        DeleteDC(memDC);

        EndPaint(hWnd, &ps);
        return 0;
    }
    case WM_MOUSEMOVE:
    {
        int xPos = GET_X_LPARAM(lParam);
        int yPos = GET_Y_LPARAM(lParam);
        int itemH = g_tray_itemH, sepH = g_tray_sepH;
        int curY = 0, hover = -1;
        for(int i=0; i<(int)g_menuItems.size(); i++)
        {
            auto &it = g_menuItems[i];
            int h = it.separator ? sepH : itemH;
            if(!it.separator && yPos>=curY && yPos<(curY+h)) {
                hover = i;
                break;
            }
            curY += h;
        }
        if(hover != g_hoverIndex){
            g_hoverIndex = hover;
            InvalidateRect(hWnd, nullptr, FALSE);
        }
        SetCursor(LoadCursor(nullptr, hover!=-1 ? IDC_HAND : IDC_ARROW));
        break;
    }
    case WM_LBUTTONUP:
    {
        POINT pt; GetCursorPos(&pt);
        RECT rc; GetWindowRect(hWnd, &rc);
        bool inside = PtInRect(&rc, pt);

        if(g_hMouseHook) {
            UnhookWindowsHookEx(g_hMouseHook);
            g_hMouseHook = nullptr;
        }
        if(inside && g_hoverIndex >= 0 && g_hoverIndex < (int)g_menuItems.size())
        {
            auto &it = g_menuItems[g_hoverIndex];
            if (!it.separator)
            {
                PostMessage(g_hWnd, WM_COMMAND, it.id, 0);
            }
        }
        DestroyWindow(hWnd);
        break;
    }
    case WM_DESTROY:
        g_hoverIndex = -1;
        if (g_hMouseHook) {
            UnhookWindowsHookEx(g_hMouseHook);
            g_hMouseHook = nullptr;
        }
        ReleaseCapture();
        break;
    }
    return DefWindowProc(hWnd, msg, wParam, lParam);
}

void TogglePictureInPicture(HWND hWnd, bool enable)
{
    LONG style = GetWindowLong(hWnd, GWL_STYLE);
    if(enable) {
        g_alwaysOnTop = true;
        style &= ~WS_CAPTION;
        SetWindowLong(hWnd, GWL_STYLE, style);
        SetWindowPos(hWnd, HWND_TOPMOST,0,0,0,0, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_FRAMECHANGED);
    } else {
        g_alwaysOnTop = false;
        style |= WS_CAPTION;
        SetWindowLong(hWnd, GWL_STYLE, style);
        SetWindowPos(hWnd, HWND_NOTOPMOST,0,0,0,0, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_FRAMECHANGED);
    }
    g_isPipMode = enable;

    if(g_webview) {
        nlohmann::json j;
        if(enable)
            SendToJS("showPictureInPicture", j);
        else
            SendToJS("hidePictureInPicture", j);
    }
}
