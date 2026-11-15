#pragma once
#include <cstdint>
#include <mutex>
#include <string>
#include <vector>
#include <windows.h>
#include <nlohmann/json.hpp>
#include <mpv/client.h>

namespace simkl {
inline constexpr UINT StatusMessage = WM_APP + 101;
inline constexpr uint64_t Observer = 0x53494d4b4c;
// Serializes only replacement loads and their metadata binding, not normal playback.
extern std::mutex LoadMutex;
void Initialize(HWND window);
#ifdef DEBUG_LOG
void ConfigureDiagnostics(bool unavailableNetwork, bool expireAccessToken);
#endif
void Shutdown();
void Command(const std::string& name, const std::vector<std::string>& args);
void BeforeLoad();
void BindEntry(int64_t entry, const nlohmann::json& media);
void Observe(mpv_handle* player);
void MpvEvent(mpv_handle* player, mpv_event* event);
}
