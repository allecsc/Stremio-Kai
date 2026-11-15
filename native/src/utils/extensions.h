#ifndef EXTENSIONS_H
#define EXTENSIONS_H

#include <string>

bool HandleExtensions(const std::wstring& finalUri);
bool HandlePremidLogin(const std::wstring& finalUri);
bool HandleStylusUsoInstall(const std::wstring& finalUri);

#endif //EXTENSIONS_H
