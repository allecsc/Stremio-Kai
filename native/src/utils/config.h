#ifndef CONFIG_H
#define CONFIG_H

void LoadSettings();
void SaveSettings();
void SaveWindowPlacement(const WINDOWPLACEMENT &wp);
bool LoadWindowPlacement(WINDOWPLACEMENT &wp);
static void WriteIntToIni(const std::wstring &section, const std::wstring &key, int value, const std::wstring &iniPath);
#endif // CONFIG_H
