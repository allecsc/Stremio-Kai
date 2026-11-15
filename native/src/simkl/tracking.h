#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>
#include <regex>
#include <string>
#include <utility>
#include <vector>
#include <nlohmann/json.hpp>

namespace simkl {
using Json = nlohmann::json;

inline std::optional<Json> ValidateMedia(const Json& media) {
    if (!media.is_object()) return {};
    std::string kind;
    for (const auto* candidate : {"movie", "show", "anime"}) {
        if (media.contains(candidate)) { if (!kind.empty()) return {}; kind = candidate; }
    }
    if (kind.empty() || !media[kind].is_object() || !media[kind].contains("ids")) return {};
    const auto& ids = media[kind]["ids"];
    if (!ids.is_object() || ids.empty()) return {};
    Json cleanIds = Json::object();
    for (const auto& [key, value] : ids.items()) {
        if (key != "imdb" && key != "tmdb" && key != "tvdb" && key != "simkl" &&
            key != "mal" && key != "anilist" && key != "kitsu" && key != "anidb") return {};
        if (!value.is_string() && !value.is_number_unsigned()) return {};
        const auto text = value.is_string() ? value.get<std::string>() : std::to_string(value.get<uint64_t>());
        if (!std::regex_match(text, std::regex(key == "imdb" ? "tt[0-9]{5,12}" : "[1-9][0-9]{0,11}"))) return {};
        cleanIds[key] = text;
    }
    Json result = {{kind, {{"ids", cleanIds}}}};
    if (kind != "movie") {
        if (!media.contains("episode") || !media["episode"].is_object()) return {};
        const auto& episode = media["episode"];
        if (!episode.contains("number") || !episode["number"].is_number_integer()) return {};
        const auto number = episode["number"].get<int64_t>();
        if (number < 1 || number > 100000) return {};
        result["episode"] = {{"number", number}};
        if (kind == "show" || episode.contains("season")) {
            if (!episode.contains("season") || !episode["season"].is_number_integer()) return {};
            const auto season = episode["season"].get<int64_t>();
            if (season < 0 || season > 10000 || (kind == "anime" && season != 0)) return {};
            result["episode"]["season"] = season;
        }
    }
    return result;
}

struct Scrobble {
    std::string action;
    int64_t session;
    Json body;
};

// Deterministic event reducer. Position events update local state; they are never a heartbeat.
class Tracking {
public:
    std::vector<Scrobble> outgoing;
    int64_t session = -1;
    bool loaded = false;
    bool paused = false;
    bool seeking = false;
    bool buffering = false;
    double position = 0;
    double duration = 0;

    void Begin(int64_t entry, const Json& value) {
        Finish(session, false);
        session = entry;
        media = ValidateMedia(value);
        loaded = paused = seeking = buffering = started = false;
        position = duration = 0;
        lastAction.clear();
        lastProgress = -1;
    }
    void Ready(bool value) {
        if (ready && !value && started) Emit("stop");
        ready = value;
        if (!value) started = false;
        MaybeStart();
    }
    void Loaded() { loaded = true; MaybeStart(); }
    void Position(double value) { if (std::isfinite(value) && value >= 0) position = value; MaybeStart(); }
    void Duration(double value) { if (std::isfinite(value) && value > 0) duration = value; MaybeStart(); }
    void Pause(bool value) {
        const bool changed = paused != value;
        paused = value;
        if (changed && started) Emit(paused ? "pause" : "start");
        MaybeStart();
    }
    void Buffer(bool value) {
        buffering = value;
        MaybeStart();
    }
    void Seeking(bool value) {
        seeking = value;
        MaybeStart();
    }
    void Finish(int64_t entry, bool eof) {
        if (session < 0 || entry != session) return; // Late END_FILE from the previous episode.
        if (eof && duration > 0) position = duration;
        if (started) Emit("stop");
        session = -1;
        started = loaded = false;
        media.reset();
    }
    void Refresh() { MaybeStart(); }
    std::vector<Scrobble> Take() { auto result = std::move(outgoing); outgoing.clear(); return result; }

private:
    bool ready = false;
    bool started = false;
    std::optional<Json> media;
    std::string lastAction;
    double lastProgress = -1;
    void MaybeStart() {
        if (!started && ready && media && loaded && !seeking && !paused && !buffering && duration > 0 && session >= 0) {
            started = true;
            Emit("start");
        }
    }
    void Emit(const std::string& action) {
        if (!ready || !media || !(duration > 0) || !std::isfinite(duration) || !std::isfinite(position)) return;
        const auto progress = std::round(std::clamp(100.0 * position / duration, 0.0, 100.0) * 100.0) / 100.0;
        if (lastAction == action && lastProgress == progress) return;
        auto body = *media;
        body["progress"] = progress;
        outgoing.push_back({action, session, std::move(body)});
        lastAction = action;
        lastProgress = progress;
    }
};
}
