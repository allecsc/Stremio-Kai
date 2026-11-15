#include "../src/simkl/tracking.h"
#include <cassert>
#include <iostream>
#include <limits>

using namespace simkl;
const Json movie = {{"movie", {{"ids", {{"imdb", "tt1254207"}}}}}};
void Start(Tracking& t, int64_t id = 1) { t.Ready(true); t.Begin(id, movie); t.Duration(100); t.Loaded(); }
int main() {
    {
        Tracking t; Start(t); assert(t.Take().size() == 1);
        for (int i = 1; i < 50; ++i) t.Position(i);
        assert(t.Take().empty()); // No API heartbeat.
        t.Pause(true); t.Pause(true); auto events = t.Take();
        assert(events.size() == 1 && events[0].action == "pause" && events[0].body["progress"] == 49);
        t.Pause(false); assert(t.Take()[0].action == "start");
        t.Seeking(true); t.Position(95); assert(t.Take().empty()); t.Seeking(false);
        assert(t.Take().empty()); // Seeking never makes API calls.
        t.Seeking(true); t.Position(30); t.Seeking(false); t.Take();
        t.Finish(1, false); events = t.Take();
        assert(events.size() == 1 && events[0].action == "stop" && events[0].body["progress"] == 30);
        t.Finish(1, false); assert(t.Take().empty());
    }
    {
        Tracking t; Start(t); t.Take(); t.Position(70); t.Finish(1, true);
        assert(t.Take()[0].body["progress"] == 100);
        Start(t, 2); t.Take(); t.Finish(1, false); assert(t.session == 2 && t.Take().empty());
        t.Buffer(true); t.Buffer(true); assert(t.Take().empty());
        t.Pause(true); t.Take(); t.Buffer(false); assert(t.Take().empty());
        t.Pause(false); assert(t.Take().size() == 1);
        t.Ready(false); assert(t.Take()[0].action == "stop");
        t.Position(90); assert(t.Take().empty()); t.Ready(true); assert(t.Take()[0].body["progress"] == 90);
    }
    {
        Tracking t; t.Ready(true); t.Begin(3, movie); t.Loaded();
        t.Duration(0); t.Duration(std::numeric_limits<double>::infinity()); assert(t.Take().empty());
        t.Duration(100); assert(t.Take().size() == 1);
        t.Begin(4, Json::object()); assert(t.Take()[0].action == "stop");
        t.Duration(100); t.Loaded(); assert(t.Take().empty());
    }
    assert(ValidateMedia({{"show", {{"ids", {{"imdb", "tt0944947"}}}}}, {"episode", {{"season", 0}, {"number", 1}}}}));
    assert(ValidateMedia({{"anime", {{"ids", {{"kitsu", "12"}}}}}, {"episode", {{"number", 4}}}}));
    assert(!ValidateMedia({{"show", {{"ids", {{"imdb", "garbage"}}}}}, {"episode", {{"season", 1}, {"number", 1}}}}));
    assert(!ValidateMedia({{"anime", {{"ids", {{"mal", "21"}}}}}, {"episode", {{"season", 2}, {"number", 4}}}}));
    std::cout << "PASS: event ordering, seek percentages, pause/resume/buffering, EOF, stale episode events, enable/disable, metadata validation, and no heartbeat.\n";
}
