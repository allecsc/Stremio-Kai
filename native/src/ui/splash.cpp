#include "splash.h"
#include <gdiplus.h>
#include <iostream>

#include "../core/globals.h"
#include "../utils/crashlog.h"
#include "../resource.h"

LRESULT CALLBACK SplashWndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam)
{
    switch(message)
    {
    case WM_TIMER:
    {
        const float baseStep = 0.01f;
        const float splashSpeed = 1.1f;
        float actualStep = baseStep * splashSpeed;
        g_splashOpacity += actualStep * g_pulseDirection;
        if(g_splashOpacity <= 0.3f) {
            g_splashOpacity = 0.3f;
            g_pulseDirection = 1;
        } else if(g_splashOpacity >= 1.0f) {
            g_splashOpacity = 1.0f;
            g_pulseDirection = -1;
        }
        InvalidateRect(hWnd, nullptr, FALSE);
        break;
    }
    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hWnd, &ps);
        RECT rc; GetClientRect(hWnd, &rc);
        int winW = rc.right - rc.left;
        int winH = rc.bottom - rc.top;

        HDC memDC = CreateCompatibleDC(hdc);
        HBITMAP memBmp = CreateCompatibleBitmap(hdc, winW, winH);
        HGDIOBJ oldMemBmp = SelectObject(memDC, memBmp);

        HBRUSH bgBrush = CreateSolidBrush(RGB(12, 11, 17));
        FillRect(memDC, &rc, bgBrush);
        DeleteObject(bgBrush);

        if(g_hSplashImage)
        {
            BITMAP bm;
            GetObject(g_hSplashImage, sizeof(bm), &bm);
            int imgWidth = bm.bmWidth;
            int imgHeight= bm.bmHeight;
            int destX = (winW - imgWidth)/2;
            int destY = (winH - imgHeight)/2;

            HDC imgDC = CreateCompatibleDC(memDC);
            HGDIOBJ oldImgBmp = SelectObject(imgDC, g_hSplashImage);

            BLENDFUNCTION blend = {};
            blend.BlendOp = AC_SRC_OVER;
            blend.SourceConstantAlpha = (BYTE)(g_splashOpacity * 255);
            blend.AlphaFormat = AC_SRC_ALPHA;

            HBITMAP tempBmp = CreateCompatibleBitmap(memDC, imgWidth, imgHeight);
            HDC tempDC = CreateCompatibleDC(memDC);
            HGDIOBJ oldTempBmp = SelectObject(tempDC, tempBmp);

            BitBlt(tempDC, 0, 0, imgWidth, imgHeight, imgDC, 0, 0, SRCCOPY);
            AlphaBlend(memDC, destX, destY, imgWidth, imgHeight, tempDC, 0, 0, imgWidth, imgHeight, blend);

            SelectObject(tempDC, oldTempBmp);
            DeleteObject(tempBmp);
            DeleteDC(tempDC);

            SelectObject(imgDC, oldImgBmp);
            DeleteDC(imgDC);
        }

        BitBlt(hdc, 0,0, winW, winH, memDC, 0,0, SRCCOPY);

        SelectObject(memDC, oldMemBmp);
        DeleteObject(memBmp);
        DeleteDC(memDC);
        EndPaint(hWnd, &ps);
        break;
    }
    case WM_DESTROY:
        KillTimer(hWnd, 1);
        break;
    default:
        return DefWindowProc(hWnd, message, wParam, lParam);
    }
    return 0;
}

void CreateSplashScreen(HWND parent)
{
    WNDCLASSEXW splashWcex = {0};
    splashWcex.cbSize        = sizeof(WNDCLASSEXW);
    splashWcex.lpfnWndProc   = SplashWndProc;
    splashWcex.hInstance     = g_hInst;
    splashWcex.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    splashWcex.lpszClassName = L"SplashScreenClass";
    RegisterClassExW(&splashWcex);

    RECT rcClient;
    GetClientRect(parent, &rcClient);
    int width  = rcClient.right - rcClient.left;
    int height = rcClient.bottom - rcClient.top;

    g_hSplash = CreateWindowExW(
        0,
        L"SplashScreenClass",
        nullptr,
        WS_CHILD | WS_VISIBLE,
        0, 0, width, height,
        parent,
        nullptr,
        g_hInst,
        nullptr
    );
    if(!g_hSplash) {
        DWORD errorCode = GetLastError();
        std::string errorMessage = "[SPLASH]: Failed to create splash. Error=" + std::to_string(errorCode);
        std::cerr << errorMessage << "\n";
        AppendToCrashLog(errorMessage);
        return;
    }

    HRSRC   hRes   = FindResource(g_hInst, MAKEINTRESOURCE(IDR_SPLASH_PNG), RT_RCDATA);
    if(!hRes) {
        std::cerr << "Could not find PNG resource.\n";
    } else {
        HGLOBAL hData = LoadResource(g_hInst, hRes);
        DWORD   size  = SizeofResource(g_hInst, hRes);
        void*   pData = LockResource(hData);
        if(!pData) {
            std::cerr << "LockResource returned null.\n";
        } else {
            IStream* pStream = nullptr;
            if(CreateStreamOnHGlobal(nullptr, TRUE, &pStream) == S_OK)
            {
                ULONG written = 0;
                pStream->Write(pData, size, &written);
                LARGE_INTEGER liZero = {};
                pStream->Seek(liZero, STREAM_SEEK_SET, nullptr);

                Gdiplus::Bitmap bitmap(pStream);
                if(bitmap.GetLastStatus()==Gdiplus::Ok)
                {
                    HBITMAP hBmp = NULL;
                    if(bitmap.GetHBITMAP(Gdiplus::Color(0,0,0,0), &hBmp) == Gdiplus::Ok) {
                        g_hSplashImage = hBmp;
                    } else {
                        std::cerr << "Failed to create HBITMAP from embedded PNG.\n";
                    }
                } else {
                    std::cerr << "Failed to decode embedded PNG data.\n";
                }
                pStream->Release();
            }
        }
    }

    SetTimer(g_hSplash, 1, 4, nullptr);

    SetWindowPos(g_hSplash, HWND_TOP, 0, 0, width, height, SWP_SHOWWINDOW);
    InvalidateRect(g_hSplash, nullptr, TRUE);
}

void HideSplash()
{
    if(g_hSplash) {
        KillTimer(g_hSplash, 1);
        DestroyWindow(g_hSplash);
        g_hSplash = nullptr;
    }
    if(g_hSplashImage) {
        DeleteObject(g_hSplashImage);
        g_hSplashImage = nullptr;
    }
}
