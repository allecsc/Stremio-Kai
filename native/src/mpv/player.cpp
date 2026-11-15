#include "player.h"
#include <iostream>
#include <cctype>
#include "../core/globals.h"
#include "../utils/crashlog.h"
#include "../utils/helpers.h"
#include "../ui/mainwindow.h"
#include "../simkl/simkl.h"

// Helper for mpv node => JSON
static nlohmann::json mpvNodeToJson(const mpv_node* node);

static nlohmann::json mpvNodeArrayToJson(const mpv_node_list* list)
{
    using json = nlohmann::json;
    json j = json::array();
    if(!list) return j;
    for(int i=0; i<list->num; i++){
        j.push_back(mpvNodeToJson(&list->values[i]));
    }
    return j;
}

static nlohmann::json mpvNodeMapToJson(const mpv_node_list* list)
{
    using json = nlohmann::json;
    json j = json::object();
    if(!list) return j;
    for(int i=0; i<list->num; i++){
        const char* key = (list->keys && list->keys[i]) ? list->keys[i] : "";
        mpv_node &val   = list->values[i];
        j[key] = mpvNodeToJson(&val);
    }
    return j;
}

static nlohmann::json mpvNodeToJson(const mpv_node* node)
{
    using json = nlohmann::json;
    if(!node) return nullptr;

    switch(node->format)
    {
    case MPV_FORMAT_STRING:
        return node->u.string ? node->u.string : "";
    case MPV_FORMAT_INT64:
        return (long long)node->u.int64;
    case MPV_FORMAT_DOUBLE:
        return node->u.double_;
    case MPV_FORMAT_FLAG:
        return (bool)node->u.flag;
    case MPV_FORMAT_NODE_ARRAY:
        return mpvNodeArrayToJson(node->u.list);
    case MPV_FORMAT_NODE_MAP:
        return mpvNodeMapToJson(node->u.list);
    default:
        return "<unhandled mpv_node format>";
    }
}

// Helper to properly capitalize mpv error
static std::string capitalizeFirstLetter(const std::string& input) {
    if (input.empty()) return input;
    std::string result = input;
    result[0] = std::toupper(result[0]);
    return result;
}

// Forward
static void MpvWakeup(void* ctx)
{
    PostMessage((HWND)ctx, WM_MPV_WAKEUP, 0, 0);
}

void HandleMpvEvents()
{
    if(!g_mpv) return;
    while(true){
        mpv_event* ev = mpv_wait_event(g_mpv, 0);
        if(!ev || ev->event_id==MPV_EVENT_NONE) break;

        if(ev->error<0) {
            std::cerr<<"mpv event error="<<mpv_error_string(ev->error)<<"\n";
        }

        simkl::MpvEvent(g_mpv, ev);
        if (ev->event_id == MPV_EVENT_PROPERTY_CHANGE && ev->reply_userdata == simkl::Observer) continue;

        switch(ev->event_id)
        {
        case MPV_EVENT_PROPERTY_CHANGE:
        {
            mpv_event_property* prop=(mpv_event_property*)ev->data;
            if(!prop||!prop->name)break;

            json j;
            j["type"] ="mpv-prop-change";
            j["id"]   =(int64_t)ev->reply_userdata;
            j["name"] = prop->name;
            if(ev->error<0)
                j["error"]=mpv_error_string(ev->error);

            switch(prop->format)
            {
                case MPV_FORMAT_INT64:
                    if(prop->data)
                        j["data"]=(long long)(*(int64_t*)prop->data);
                    else
                        j["data"]=nullptr;
                break;
                case MPV_FORMAT_DOUBLE:
                    if(prop->data)
                        j["data"]=*(double*)prop->data;
                    else
                        j["data"]=nullptr;
                break;
                case MPV_FORMAT_FLAG:
                    if(prop->data)
                        j["data"]=(*(int*)prop->data!=0);
                    else
                        j["data"]=false;
                break;
                case MPV_FORMAT_STRING:
                    if(prop->data){
                        const char*s=*(char**)prop->data;
                        j["data"]=(s? s:"");
                    } else {
                        j["data"]="";
                    }
                break;
                case MPV_FORMAT_NODE:
                    j["data"]=mpvNodeToJson((mpv_node*)prop->data);
                break;
                default:
                    j["data"]=nullptr;
                break;
            }
            if (j["name"] == "volume" && g_initialSet) {
                g_currentVolume = j["data"];
            }
            SendToJS("mpv-prop-change", j);
            break;
        }
        case MPV_EVENT_END_FILE:
        {
            mpv_event_end_file* ef=(mpv_event_end_file*)ev->data;
            nlohmann::json j;
            j["type"]="mpv-event-ended";
            switch(ef->reason){
                case MPV_END_FILE_REASON_EOF:
                    j["reason"]="quit";
                SendToJS("mpv-event-ended", j);
                break;
                case MPV_END_FILE_REASON_ERROR: {
                    std::string errorString = mpv_error_string(ef->error);
                    std::string capitalizedErrorString = capitalizeFirstLetter(errorString);
                    j["reason"]="error";
                    if(ef->error<0)
                        j["error"]= capitalizedErrorString;
                    SendToJS("mpv-event-ended", j);
                    AppendToCrashLog("[MPV]: " + capitalizedErrorString);
                    break;
                }
                default:
                    j["reason"]="other";
                break;
            }
            break;
        }
        case MPV_EVENT_SHUTDOWN:
        {
            std::cout<<"mpv EVENT_SHUTDOWN => terminate\n";
            mpv_terminate_destroy(g_mpv);
            g_mpv=nullptr;
            break;
        }
        default:
            // ignore
            break;
        }
    }
}

void HandleMpvCommand(const std::vector<std::string>& args)
{
    if (!args.empty() && args[0] == "loadfile") {
        HandleMpvLoad(args, nlohmann::json::object());
        return;
    }
    std::thread([args](){
        if(!g_mpv || args.empty()) return;
        std::vector<const char*> cargs;
        for(auto &s: args) {
            cargs.push_back(s.c_str());
        }
        cargs.push_back(nullptr);
        mpv_command(g_mpv, cargs.data());
    }).detach();
}

void HandleMpvLoad(const std::vector<std::string>& args, const nlohmann::json& media)
{
    std::thread([args, media] {
        std::lock_guard loadLock(simkl::LoadMutex);
        if (!g_mpv || args.size() < 2 || args[0] != "loadfile") return;
        simkl::BeforeLoad();
        std::vector<const char*> command;
        for (const auto& arg : args) command.push_back(arg.c_str());
        command.push_back(nullptr);
        if (mpv_command(g_mpv, command.data()) >= 0) {
            int64_t entry = -1;
            if (mpv_get_property(g_mpv, "playlist/0/id", MPV_FORMAT_INT64, &entry) >= 0) simkl::BindEntry(entry, media);
        }
    }).detach();
}

void HandleMpvSetProp(const std::vector<std::string>& args)
{
    std::thread([args](){
        if(!g_mpv || args.size()<2) return;
        std::string val=args[1];
        if(val=="true")  val="yes";
        if(val=="false") val="no";
        mpv_set_property_string(g_mpv, args[0].c_str(), val.c_str());
    }).detach();
}

void HandleMpvObserveProp(const std::vector<std::string>& args)
{
    std::thread([args](){
        if(!g_mpv || args.empty()) return;
        std::string pname=args[0];
        g_observedProps.insert(pname);
        mpv_observe_property(g_mpv,0,pname.c_str(),MPV_FORMAT_NODE);
        std::cout<<"Observing prop="<<pname<<"\n";
    }).detach();
}

void pauseMPV(bool allowed)
{
    if(!allowed) return;
    std::vector<std::string> pauseArgs = { "pause", "true" };
    HandleMpvSetProp(pauseArgs);
}

bool InitMPV(HWND hwnd)
{
    g_mpv = mpv_create();
    if(!g_mpv){
        std::cerr<<"mpv_create failed\n";
        AppendToCrashLog("[MPV]: Create failed");
        return false;
    }

    // portable_config
    std::wstring exeDir = GetExeDirectory();
    std::wstring cfg    = exeDir + L"\\portable_config";
    CreateDirectoryW(cfg.c_str(), nullptr);

    // Convert config path to UTF-8
    int needed = WideCharToMultiByte(CP_UTF8, 0, cfg.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string utf8(needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, cfg.c_str(), -1, &utf8[0], needed, nullptr, nullptr);

    mpv_set_option_string(g_mpv, "config-dir", utf8.c_str());
    mpv_set_option_string(g_mpv, "load-scripts","yes");
    mpv_set_option_string(g_mpv, "config","yes");
    mpv_set_option_string(g_mpv, "terminal","yes");
    mpv_set_option_string(g_mpv, "msg-level","all=v");

    int64_t wid=(int64_t)hwnd;
    mpv_set_option(g_mpv,"wid", MPV_FORMAT_INT64, &wid);
    mpv_set_wakeup_callback(g_mpv, MpvWakeup, hwnd);

    if(mpv_initialize(g_mpv)<0){
        std::cerr<<"mpv_initialize failed\n";
        AppendToCrashLog("[MPV]: Initialize failed");
        return false;
    }

    // Set VO
    mpv_set_option_string(g_mpv,"vo","gpu-next");

    // demux/caching
    mpv_set_property_string(g_mpv,"demuxer-lavf-probesize",     "524288");
    mpv_set_property_string(g_mpv,"demuxer-lavf-analyzeduration","0.5");
    mpv_set_property_string(g_mpv,"demuxer-max-bytes","300000000");
    mpv_set_property_string(g_mpv,"demuxer-max-packets","150000000");
    mpv_set_property_string(g_mpv,"cache","yes");
    mpv_set_property_string(g_mpv,"cache-pause","no");
    mpv_set_property_string(g_mpv,"cache-secs","60");
    mpv_set_property_string(g_mpv,"vd-lavc-threads","0");
    mpv_set_property_string(g_mpv,"ad-lavc-threads","0");
    mpv_set_property_string(g_mpv,"audio-fallback-to-null","yes");
    mpv_set_property_string(g_mpv,"audio-client-name",APP_NAME);
    mpv_set_property_string(g_mpv,"title",APP_NAME);

    simkl::Observe(g_mpv);
    return true;
}

void CleanupMPV()
{
    if(g_mpv){
        mpv_terminate_destroy(g_mpv);
        g_mpv=nullptr;
    }
}
