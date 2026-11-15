#ifndef CRASHLOG_H
#define CRASHLOG_H

#include <string>

void AppendToCrashLog(const std::wstring& message);
void AppendToCrashLog(const std::string& message);
void Cleanup();

#endif // CRASHLOG_H
