#ifndef SPLASH_H
#define SPLASH_H

#include <windows.h>

void CreateSplashScreen(HWND parent);
void HideSplash();

LRESULT CALLBACK SplashWndProc(HWND, UINT, WPARAM, LPARAM);

#endif // SPLASH_H
