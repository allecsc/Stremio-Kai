#ifndef TRAY_H
#define TRAY_H

#include <windows.h>

void CreateTrayIcon(HWND hWnd);
void RemoveTrayIcon();
void ShowTrayMenu(HWND hWnd);

void LoadCustomMenuFont();

void TogglePictureInPicture(HWND hWnd, bool enable);

#endif // TRAY_H
