#ifndef HELPERS_H
#define HELPERS_H

#include <windows.h>
#include <string>
#include <vector>
#include <filesystem>

std::string WStringToUtf8(const std::wstring &wstr);
std::wstring Utf8ToWstring(const std::string& utf8Str);
std::string ToLowerStr(std::string s);
std::string decodeURIComponent(const std::string& encoded);
std::wstring GetExeDirectory();
std::wstring GetFirstReachableUrl();
std::wstring MakeInjectCssScript(const std::wstring& idSafe, const std::string& cssUtf8);
std::wstring MakeInjectJsScript(const std::wstring& idSafe, const std::string& jsUtf8);
bool FileExists(const std::wstring& path);
bool DirectoryExists(const std::wstring& dirPath);
bool IsDuplicateProcessRunning(const std::vector<std::wstring>& targetProcesses);
bool isSubtitle(const std::wstring& filePath);
bool URLContainsAny(const std::wstring& url);
bool FetchAndParseWhitelist();
void ScaleWithDPI();
bool ReadFileUtf8(const std::wstring& path, std::string& out);

#endif // HELPERS_H
