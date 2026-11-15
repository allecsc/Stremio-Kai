#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>
#include "simkl.h"
#include "tracking.h"
#include <winhttp.h>
#include <wincred.h>
#include <bcrypt.h>
#include <wincrypt.h>
#include <shellapi.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <thread>

namespace simkl {
std::mutex LoadMutex;
namespace {
constexpr char ClientId[] = "949bac453beaa5dd4cef9d69c19c0b78168a5f63c976d98892dca02fbffb9838";
constexpr wchar_t CredentialTarget[] = L"StremioKai/Simkl/AuthV2/949bac453beaa5dd";
constexpr wchar_t Agent[] = L"StremioKai-Simkl/0.1";
std::mutex stateMutex, workMutex;
std::condition_variable workChanged, workerEnded;
std::deque<std::function<void()>> work;
std::map<int64_t, Json> bindings;
Tracking tracking;
mpv_handle* mpv = nullptr;
HWND window = nullptr;
std::thread worker, authListener;
std::atomic<bool> stopping{false};
std::atomic<uint64_t> authGeneration{0};
std::atomic<HINTERNET> activeRequest{nullptr};
bool workerDone = false, initialized = false, enabled = false, connected = false, connecting = false;
std::string message;
Json lastAccepted = Json::object();
Json tokens = Json::object(); // Owned only by the I/O worker; never sent to WebView.
std::map<std::string, Json> pending;
uint64_t sequence = 0;
std::string bootId;
std::chrono::steady_clock::time_point nextApiAttempt{};
#ifdef DEBUG_LOG
bool diagnosticOffline=false, diagnosticRefresh=false;
#endif

int64_t Now() { return std::chrono::duration_cast<std::chrono::seconds>(std::chrono::system_clock::now().time_since_epoch()).count(); }
std::wstring Wide(const std::string& text) {
    const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring result(size, 0);
    if (size) MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), result.data(), size);
    return result;
}
std::filesystem::path DataDirectory() {
    wchar_t value[32768];
    const DWORD size = GetEnvironmentVariableW(L"LOCALAPPDATA", value, 32768);
    if (!size || size >= 32768) throw std::runtime_error("Windows user-data directory unavailable");
    auto path = std::filesystem::path(value) / L"StremioKai" / L"Simkl";
    std::filesystem::create_directories(path);
    return path;
}
std::wstring SettingsPath() { return (DataDirectory() / L"settings.ini").wstring(); }

std::string Base64Url(const unsigned char* data, size_t length) {
    static constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    std::string out; unsigned buffer = 0; int bits = 0;
    for (size_t i = 0; i < length; ++i) {
        buffer = (buffer << 8) | data[i]; bits += 8;
        while (bits >= 6) { bits -= 6; out += alphabet[(buffer >> bits) & 63]; }
    }
    if (bits) out += alphabet[(buffer << (6 - bits)) & 63];
    return out;
}
std::string Random() {
    unsigned char bytes[32];
    if (BCryptGenRandom(nullptr, bytes, sizeof bytes, BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) throw std::runtime_error("Secure random generation failed");
    return Base64Url(bytes, sizeof bytes);
}
std::string Challenge(const std::string& verifier) {
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) != 0) throw std::runtime_error("PKCE hash unavailable");
    unsigned char digest[32];
    const auto status = BCryptHash(algorithm, nullptr, 0, reinterpret_cast<PUCHAR>(const_cast<char*>(verifier.data())), static_cast<ULONG>(verifier.size()), digest, sizeof digest);
    BCryptCloseAlgorithmProvider(algorithm, 0);
    if (status != 0) throw std::runtime_error("PKCE hash failed");
    return Base64Url(digest, sizeof digest);
}
std::string Encode(const std::string& text) {
    static constexpr char hex[] = "0123456789ABCDEF";
    std::string out;
    for (unsigned char c : text) {
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') out += c;
        else { out += '%'; out += hex[c >> 4]; out += hex[c & 15]; }
    }
    return out;
}
std::string Decode(const std::string& text) {
    auto digit = [](char c) { if(c >= '0' && c <= '9')return c-'0'; if(c >= 'A' && c <= 'F')return c-'A'+10; if(c >= 'a' && c <= 'f')return c-'a'+10; return -1; };
    std::string out;
    for (size_t i = 0; i < text.size(); ++i) {
        if (text[i] == '%') {
            if (i + 2 >= text.size() || digit(text[i+1]) < 0 || digit(text[i+2]) < 0) throw std::runtime_error("Malformed callback encoding");
            out += static_cast<char>(digit(text[i+1]) * 16 + digit(text[i+2])); i += 2;
        } else out += text[i] == '+' ? ' ' : text[i];
    }
    return out;
}
std::map<std::string, std::string> Query(const std::string& text) {
    std::map<std::string, std::string> result;
    size_t start = 0;
    while (start < text.size()) {
        const auto end = text.find('&', start);
        const auto pair = text.substr(start, end == std::string::npos ? end : end - start);
        const auto equal = pair.find('=');
        if (equal == std::string::npos || !result.emplace(Decode(pair.substr(0,equal)), Decode(pair.substr(equal+1))).second) throw std::runtime_error("Malformed callback parameters");
        if (end == std::string::npos) break;
        start = end + 1;
    }
    return result;
}
bool EqualState(const std::string& a, const std::string& b) {
    if (a.size() != b.size()) return false;
    unsigned difference = 0;
    for (size_t i=0;i<a.size();++i) difference |= static_cast<unsigned char>(a[i]) ^ static_cast<unsigned char>(b[i]);
    return difference == 0;
}
std::string Form(const std::map<std::string,std::string>& values) {
    std::string out;
    for (const auto& [key,value] : values) { if (!out.empty()) out += '&'; out += Encode(key) + '=' + Encode(value); }
    return out;
}

void Publish() {
    Json status;
    { std::lock_guard lock(stateMutex); status = {{"connected",connected},{"enabled",enabled},{"connecting",connecting},{"message",message},{"lastAccepted",lastAccepted}}; }
    { std::lock_guard lock(workMutex); status["pending"] = pending.size(); }
    auto payload = new Json(std::move(status));
    if (!window || !PostMessageW(window, StatusMessage, 0, reinterpret_cast<LPARAM>(payload))) delete payload;
}
void SetMessage(const std::string& value) { { std::lock_guard lock(stateMutex); message = value; } Publish(); }
void Accepted(const std::string& action,const Json& body,const Json& response) {
    Json record={{"event",action},{"requested",body}};
    if(response.is_object()) {
        for(const auto* key:{"action","progress"}) if(response.contains(key)) record[key]=response[key];
        for(const auto* kind:{"movie","show","anime","episode"}) {
            if(!response.contains(kind) || !response[kind].is_object())continue;
            for(const auto* key:{"title","ids","season","number"}) if(response[kind].contains(key)) record["resolved"][kind][key]=response[kind][key];
        }
    }
    {std::lock_guard lock(stateMutex);lastAccepted=record;}
#ifdef DEBUG_LOG
    std::cout<<"[SIMKL ACCEPTED]: "<<record.dump()<<std::endl;
#endif
}
void Enqueue(std::function<void()> job) {
    { std::lock_guard lock(workMutex); if (stopping) return; work.push_back(std::move(job)); }
    workChanged.notify_one();
}
void SavePendingLocked() {
    Json values = Json::array();
    for (const auto& [key,value] : pending) values.push_back(value);
    const auto plain = values.dump();
    DATA_BLOB input{static_cast<DWORD>(plain.size()), reinterpret_cast<BYTE*>(const_cast<char*>(plain.data()))}, encrypted{};
    if (!CryptProtectData(&input, L"Kai Simkl pending playback", nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &encrypted)) throw std::runtime_error("Pending playback encryption failed");
    const auto target = DataDirectory() / L"pending.bin";
    const auto temp = DataDirectory() / L"pending.tmp";
    { std::ofstream file(temp, std::ios::binary|std::ios::trunc); file.write(reinterpret_cast<char*>(encrypted.pbData), encrypted.cbData); if (!file) { LocalFree(encrypted.pbData); throw std::runtime_error("Pending playback save failed"); } }
    LocalFree(encrypted.pbData);
    if (!MoveFileExW(temp.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)) throw std::runtime_error("Pending playback replace failed");
}
void LoadPending() {
    std::ifstream file(DataDirectory() / L"pending.bin", std::ios::binary);
    std::string bytes((std::istreambuf_iterator<char>(file)), {});
    if (bytes.empty() || bytes.size() > 16*1024*1024) return;
    DATA_BLOB input{static_cast<DWORD>(bytes.size()), reinterpret_cast<BYTE*>(bytes.data())}, plain{};
    if (!CryptUnprotectData(&input, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &plain)) return;
    const auto data = Json::parse(plain.pbData, plain.pbData + plain.cbData, nullptr, false);
    SecureZeroMemory(plain.pbData, plain.cbData); LocalFree(plain.pbData);
    if (!data.is_array()) return;
    for (const auto& value : data) {
        if (value.is_object() && value.contains("key") && value["key"].is_string() && value.contains("body") &&
            value.contains("action") && (value["action"] == "pause" || value["action"] == "stop")) pending[value["key"].get<std::string>()] = value;
    }
}
void StoreTokens() {
    auto plain = tokens.dump();
    CREDENTIALW credential{};
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = const_cast<LPWSTR>(CredentialTarget);
    credential.CredentialBlobSize = static_cast<DWORD>(plain.size());
    credential.CredentialBlob = reinterpret_cast<LPBYTE>(plain.data());
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE; // Per Windows user, across this user's logins.
    const bool saved = CredWriteW(&credential, 0) != FALSE;
    SecureZeroMemory(plain.data(), plain.size());
    if (!saved) throw std::runtime_error("Windows Credential Manager could not save Simkl sign-in");
}
void LoadTokens() {
    PCREDENTIALW credential = nullptr;
    if (!CredReadW(CredentialTarget, CRED_TYPE_GENERIC, 0, &credential)) return;
    tokens = Json::parse(credential->CredentialBlob, credential->CredentialBlob + credential->CredentialBlobSize, nullptr, false);
    CredFree(credential);
    if (!tokens.is_object() || !tokens.contains("access_token") || !tokens.contains("refresh_token") || !tokens.contains("connection")) tokens = Json::object();
}

struct Response { DWORD status = 0; Json body; unsigned retryAfter = 0; };
Response Request(const wchar_t* method, const std::string& endpoint, const std::string& body = "", const std::string& bearer = "", bool form = false) {
    Response result;
    DWORD proxyMode=WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY;
    const wchar_t* proxyName=WINHTTP_NO_PROXY_NAME;
#ifdef DEBUG_LOG
    // Per-process failure injection: never changes Windows networking or proxy settings.
    if(diagnosticOffline) {proxyMode=WINHTTP_ACCESS_TYPE_NAMED_PROXY;proxyName=L"127.0.0.1:18745";}
#endif
    HINTERNET session = WinHttpOpen(Agent, proxyMode, proxyName, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) return result;
    WinHttpSetTimeouts(session, 3000, 3000, 3000, 5000);
    HINTERNET connection = WinHttpConnect(session, L"api.simkl.com", INTERNET_DEFAULT_HTTPS_PORT, 0);
    std::string path = endpoint + (endpoint.find('?') == std::string::npos ? "?" : "&") + "client_id=" + ClientId + "&app-name=stremio-kai-simkl&app-version=0.1";
    HINTERNET request = connection ? WinHttpOpenRequest(connection, method, Wide(path).c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE) : nullptr;
    if (request) {
        DWORD redirects = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
        WinHttpSetOption(request, WINHTTP_OPTION_REDIRECT_POLICY, &redirects, sizeof redirects);
        std::wstring headers = form ? L"Content-Type: application/x-www-form-urlencoded\r\n" : L"Content-Type: application/json\r\n";
        if (!bearer.empty()) headers += L"Authorization: Bearer " + Wide(bearer) + L"\r\n";
        activeRequest.store(request);
        if (WinHttpSendRequest(request, headers.c_str(), static_cast<DWORD>(headers.size()), body.empty() ? WINHTTP_NO_REQUEST_DATA : const_cast<char*>(body.data()), static_cast<DWORD>(body.size()), static_cast<DWORD>(body.size()), 0) && WinHttpReceiveResponse(request, nullptr)) {
            DWORD size = sizeof result.status;
            WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &result.status, &size, WINHTTP_NO_HEADER_INDEX);
            wchar_t retry[32]; size = sizeof retry;
            if (WinHttpQueryHeaders(request, WINHTTP_QUERY_RETRY_AFTER, WINHTTP_HEADER_NAME_BY_INDEX, retry, &size, WINHTTP_NO_HEADER_INDEX)) result.retryAfter = std::min(3600UL, wcstoul(retry,nullptr,10));
            std::string received; DWORD available = 0;
            while (WinHttpQueryDataAvailable(request,&available) && available && received.size() + available <= 2*1024*1024) {
                const auto start = received.size(); received.resize(start + available); DWORD count = 0;
                if (!WinHttpReadData(request, received.data()+start, available, &count)) break;
                received.resize(start+count);
                if (!count) break;
            }
            result.body = Json::parse(received, nullptr, false);
        }
        HINTERNET expected = request;
        if (activeRequest.compare_exchange_strong(expected, nullptr)) WinHttpCloseHandle(request);
    }
    if (connection) WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);
    return result;
}

void Submit(Scrobble event);
void Drain() { for (auto& event : tracking.Take()) Submit(std::move(event)); }
void SetConnection(bool value, const std::string& text) {
    { std::lock_guard lock(stateMutex); connected = value; connecting = false; message = text; tracking.Ready(enabled && connected); Drain(); }
    Publish();
}
bool Adopt(const Response& response, bool fresh) {
    if (response.status != 200 || !response.body.is_object()) return false;
    const auto& body = response.body;
    if (!body.contains("access_token") || !body["access_token"].is_string() || !body.contains("refresh_token") || !body["refresh_token"].is_string() || !body.contains("expires_in") || !body["expires_in"].is_number_integer()) return false;
    const auto scope = body.value("scope", std::string());
    bool writable = false;
    std::istringstream scopes(scope); std::string word;
    while (scopes >> word) if (word == "media:write") writable = true;
    if (!writable) { SetConnection(false, "Simkl did not grant write access. Reconnect with media:write permission."); return false; }
    const auto connectionId = fresh ? Random() : tokens.value("connection", Random());
    Json next = {{"access_token",body["access_token"]},{"refresh_token",body["refresh_token"]},{"scope",scope},{"expires_at",Now()+body["expires_in"].get<int64_t>()},{"connection",connectionId}};
    auto previous = tokens;
    tokens = std::move(next);
    try { StoreTokens(); } catch (...) { tokens = std::move(previous); throw; }
    if (fresh) { std::lock_guard lock(workMutex); pending.clear(); SavePendingLocked(); }
    SetConnection(true, "Connected to Simkl");
    return true;
}
bool RefreshToken() {
    if (!tokens.contains("refresh_token")) return false;
    const auto response = Request(L"POST", "/oauth2/token", Form({{"grant_type","refresh_token"},{"client_id",ClientId},{"refresh_token",tokens["refresh_token"].get<std::string>()}}), "", true);
    if (Adopt(response,false)) {
#ifdef DEBUG_LOG
        std::cout<<"[SIMKL AUTH]: Access token refreshed successfully"<<std::endl;
#endif
        return true;
    }
    if (response.status == 400 || response.status == 401) SetConnection(false,"Simkl sign-in expired or was revoked. Reconnect to continue.");
    return false;
}
Response Api(const std::string& endpoint, const Json& body) {
    if (std::chrono::steady_clock::now() < nextApiAttempt) return {429,Json::object(),0};
    if (!tokens.contains("access_token")) return {};
    if (tokens.value("expires_at", int64_t(0)) <= Now()+60 && !RefreshToken()) return {};
    auto response = Request(L"POST", endpoint, body.dump(), tokens["access_token"].get<std::string>());
    if (response.status == 401 && RefreshToken()) response = Request(L"POST", endpoint, body.dump(), tokens["access_token"].get<std::string>());
    if (response.status == 429 || (response.status == 400 && response.body.dump().find("RATE_LIMIT") != std::string::npos)) {
        nextApiAttempt=std::chrono::steady_clock::now()+std::chrono::seconds(response.retryAfter ? response.retryAfter : 20);
    }
    return response;
}
bool FlushPending() {
    for (;;) {
        Json event;
        { std::lock_guard lock(workMutex); if (pending.empty() || stopping) return pending.empty();
          const auto oldest=std::min_element(pending.begin(),pending.end(),[](const auto& a,const auto& b){return a.second.value("created",int64_t(0)) < b.second.value("created",int64_t(0));});
          event = oldest->second; }
        if (event.value("connection",std::string()) != tokens.value("connection",std::string())) {
            std::lock_guard lock(workMutex); pending.erase(event["key"].get<std::string>()); SavePendingLocked(); continue;
        }
        const auto response = Api("/scrobble/"+event["action"].get<std::string>(),event["body"]);
        const bool success = response.status >= 200 && response.status < 300;
        const bool duplicate = response.status == 409 && event["action"] == "stop";
        const bool invalid = response.status >= 400 && response.status < 500 && response.status != 401 && response.status != 408 && response.status != 429 && !(response.status == 400 && response.body.dump().find("RATE_LIMIT") != std::string::npos);
        if (success || duplicate || invalid) {
            if(success) Accepted(event["action"].get<std::string>(),event["body"],response.body);
            { std::lock_guard lock(workMutex); const auto key = event["key"].get<std::string>(); auto it=pending.find(key); if(it!=pending.end() && it->second["sequence"]==event["sequence"]) pending.erase(it); SavePendingLocked(); }
            if (invalid) SetMessage("Simkl rejected this title or permission (HTTP "+std::to_string(response.status)+"). Playback is unaffected.");
            else if (event["action"] == "stop") SetMessage(duplicate || (response.body.is_object() && response.body.value("action",std::string()) == "scrobble") ? "Recorded as watched on Simkl" : "Saved playback progress on Simkl");
        } else {
            SetMessage("Simkl is unavailable. Playback progress is saved securely for retry.");
            // Retry only on the next real playback event or app launch, never in a timer loop.
            return false;
        }
    }
}
void Submit(Scrobble event) {
    // Called with stateMutex held. Connection identity is captured by the worker,
    // with all credential changes ordered on that same worker.
    Enqueue([event=std::move(event)] {
        if (!tokens.contains("connection")) return;
        if (event.action != "start") {
            const std::string key = tokens["connection"].get<std::string>()+"/"+bootId+"/"+std::to_string(event.session);
            const auto created=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
            Json saved={{"key",key},{"connection",tokens["connection"]},{"created",created},{"sequence",++sequence},{"action",event.action},{"body",event.body}};
            { std::lock_guard lock(workMutex); pending[key]=std::move(saved); SavePendingLocked(); }
            FlushPending();
        } else if (!stopping && FlushPending()) {
            const auto response=Api("/scrobble/start",event.body);
            if(response.status >= 200 && response.status < 300) {Accepted("start",event.body,response.body);SetMessage("Scrobbling to Simkl");}
            else SetMessage("Simkl is unavailable. Tracking will retry on the next playback event.");
        }
        Publish();
    });
}
void BrowserReply(SOCKET socket, bool okay) {
    const std::string body = okay ? "Simkl sign-in received. You can return to Stremio Kai." : "This sign-in request was not accepted. Return to Stremio Kai and try again.";
    const std::string response="HTTP/1.1 "+std::string(okay?"200 OK":"400 Bad Request")+"\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: "+std::to_string(body.size())+"\r\n\r\n"+body;
    send(socket,response.data(),static_cast<int>(response.size()),0);
}
void StartAuth() {
    const auto generation=++authGeneration;
    if(authListener.joinable()) authListener.join();
    const auto verifier=Random(), state=Random(), challenge=Challenge(verifier);
    const SOCKET listener=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);
    if(listener==INVALID_SOCKET) throw std::runtime_error("Cannot open sign-in callback");
    BOOL exclusive=TRUE; setsockopt(listener,SOL_SOCKET,SO_EXCLUSIVEADDRUSE,reinterpret_cast<char*>(&exclusive),sizeof exclusive);
    sockaddr_in address{}; address.sin_family=AF_INET; address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    if(bind(listener,reinterpret_cast<sockaddr*>(&address),sizeof address)==SOCKET_ERROR || listen(listener,4)==SOCKET_ERROR) { closesocket(listener); throw std::runtime_error("Cannot bind sign-in callback"); }
    int addressSize=sizeof address; getsockname(listener,reinterpret_cast<sockaddr*>(&address),&addressSize);
    const std::string redirect="http://127.0.0.1:"+std::to_string(ntohs(address.sin_port))+"/auth/simkl";
    const auto authorize="https://simkl.com/oauth2/authorize?"+Form({{"client_id",ClientId},{"redirect_uri",redirect},{"response_type","code"},{"scope","media:read media:write"},{"state",state},{"code_challenge",challenge},{"code_challenge_method","S256"}});
    authListener=std::thread([listener,generation,verifier,state,redirect] {
        const auto deadline=std::chrono::steady_clock::now()+std::chrono::minutes(5);
        bool received=false;
        while(!stopping && generation==authGeneration && std::chrono::steady_clock::now()<deadline) {
            fd_set readSet; FD_ZERO(&readSet); FD_SET(listener,&readSet); timeval timeout{0,200000};
            if(select(0,&readSet,nullptr,nullptr,&timeout)<=0) continue;
            const SOCKET client=accept(listener,nullptr,nullptr); if(client==INVALID_SOCKET) continue;
            DWORD receiveTimeout=1000; setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,reinterpret_cast<char*>(&receiveTimeout),sizeof receiveTimeout);
            char buffer[8193]; const int count=recv(client,buffer,8192,0);
            try {
                if(count<=0) throw std::runtime_error("Empty callback");
                const std::string request(buffer,count);
                const auto space=request.find(' ',4);
                if(request.rfind("GET ",0)!=0 || space==std::string::npos) throw std::runtime_error("Invalid callback method");
                const auto target=request.substr(4,space-4);
                if(target.rfind("/auth/simkl?",0)!=0) throw std::runtime_error("Invalid callback path");
                const auto parameters=Query(target.substr(12));
                if(!parameters.contains("state") || !EqualState(parameters.at("state"),state) || !parameters.contains("iss") || parameters.at("iss")!="https://simkl.com") throw std::runtime_error("Invalid callback state or issuer");
                BrowserReply(client,true); closesocket(client); received=true;
                if(parameters.contains("error")) Enqueue([generation]{ if(generation==authGeneration) SetConnection(false,"Simkl sign-in was cancelled. You can connect again."); });
                else if(parameters.contains("code") && !parameters.at("code").empty()) Enqueue([generation,code=parameters.at("code"),verifier,redirect] {
                    if(generation!=authGeneration) return;
                    const auto response=Request(L"POST","/oauth2/token",Form({{"grant_type","authorization_code"},{"client_id",ClientId},{"code",code},{"redirect_uri",redirect},{"code_verifier",verifier}}),"",true);
                    if(generation!=authGeneration) return;
                    if(!Adopt(response,true)) SetConnection(false,"Simkl sign-in could not be completed. Connect again; authorization codes are single-use.");
                });
                else Enqueue([]{SetConnection(false,"Simkl did not return an authorization code. Connect again.");});
                break;
            } catch(...) { BrowserReply(client,false); closesocket(client); }
        }
        closesocket(listener);
        if(!received && !stopping && generation==authGeneration) Enqueue([]{SetConnection(false,"Simkl sign-in timed out. Connect again.");});
    });
    if(reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr,L"open",Wide(authorize).c_str(),nullptr,nullptr,SW_SHOWNORMAL))<=32) {
        ++authGeneration; throw std::runtime_error("Could not open the sign-in browser");
    }
    SetMessage("Finish Simkl sign-in in your browser");
}
void Snapshot(mpv_handle* player) {
    double value=0;
    if(mpv_get_property(player,"time-pos",MPV_FORMAT_DOUBLE,&value)>=0) tracking.Position(value);
    if(mpv_get_property(player,"duration",MPV_FORMAT_DOUBLE,&value)>=0) tracking.Duration(value);
}
} // namespace

#ifdef DEBUG_LOG
void ConfigureDiagnostics(bool unavailableNetwork,bool expireAccessToken) {
    diagnosticOffline=unavailableNetwork;diagnosticRefresh=expireAccessToken;
}
#endif

void Initialize(HWND target) {
    if(initialized) return;
    initialized=true; window=target;
    bootId=Random();
    WSADATA data{}; if(WSAStartup(MAKEWORD(2,2),&data)!=0) throw std::runtime_error("Windows networking unavailable");
    enabled=GetPrivateProfileIntW(L"Simkl",L"Enabled",0,SettingsPath().c_str())!=0;
    worker=std::thread([] {
        try { LoadTokens();
#ifdef DEBUG_LOG
            if(diagnosticRefresh && tokens.contains("refresh_token")) tokens["expires_at"]=0;
#endif
            LoadPending(); SetConnection(tokens.contains("refresh_token"),tokens.contains("refresh_token") ? "Connected to Simkl" : "Not connected to Simkl"); if(!tokens.empty()) FlushPending(); }
        catch(...) { SetConnection(false,"Stored Simkl sign-in could not be loaded securely. Connect again."); }
        for(;;) {
            std::function<void()> job;
            { std::unique_lock lock(workMutex);
              workChanged.wait(lock,[]{return stopping || !work.empty();});
              if(stopping && work.empty()) break;
              if(!work.empty()) {job=std::move(work.front());work.pop_front();}
            }
            try { job(); } catch(...) { SetMessage("Simkl could not save or sync this update. Playback is unaffected."); }
            if(stopping) { std::lock_guard lock(workMutex); if(work.empty()) break; }
        }
        {std::lock_guard lock(workMutex);workerDone=true;} workerEnded.notify_all();
    });
}
void Command(const std::string& name,const std::vector<std::string>& args) {
    if(!initialized || stopping) return;
    if(name=="simkl-status") { Publish(); Enqueue([] { if(!tokens.empty()) FlushPending(); }); }
    else if(name=="simkl-connect") {
        {std::lock_guard lock(stateMutex); if(connecting) return;connecting=true;message="Opening Simkl sign-in";}
        Publish(); Enqueue([]{try{StartAuth();}catch(...){SetConnection(false,"Could not start Simkl sign-in. Try connecting again.");}});
    } else if(name=="simkl-enable" && args.size()==1) {
        {std::lock_guard lock(stateMutex); enabled=args[0]=="true"; WritePrivateProfileStringW(L"Simkl",L"Enabled",enabled?L"1":L"0",SettingsPath().c_str()); tracking.Ready(enabled&&connected);Drain();}
        Publish();
    } else if(name=="simkl-disconnect") {
        ++authGeneration;
        {std::lock_guard lock(stateMutex);tracking.Ready(false);Drain();connected=connecting=false;message="Disconnecting from Simkl";}
        Publish(); Enqueue([] {
            if(tokens.contains("refresh_token")) Request(L"POST","/oauth2/revoke",Form({{"client_id",ClientId},{"token",tokens["refresh_token"].get<std::string>()}}),"",true);
            tokens=Json::object(); CredDeleteW(CredentialTarget,CRED_TYPE_GENERIC,0);
            {std::lock_guard lock(workMutex);pending.clear();SavePendingLocked();}
            SetConnection(false,"Disconnected from Simkl");
        });
    }
}
void Observe(mpv_handle* player) {
    mpv=player;
    for(const auto* property:{"time-pos","duration"}) mpv_observe_property(player,Observer,property,MPV_FORMAT_DOUBLE);
    for(const auto* property:{"pause","seeking","paused-for-cache"}) mpv_observe_property(player,Observer,property,MPV_FORMAT_FLAG);
}
void BeforeLoad() {
    std::lock_guard lock(stateMutex);
    if(mpv && tracking.session>=0) Snapshot(mpv);
    tracking.Finish(tracking.session,false);Drain();
}
void BindEntry(int64_t entry,const Json& media) { std::lock_guard lock(stateMutex); bindings[entry]=media; }
void MpvEvent(mpv_handle* player,mpv_event* event) {
    if(stopping) return;
    std::unique_lock loadLock(LoadMutex,std::defer_lock);
    if(event->event_id==MPV_EVENT_START_FILE) loadLock.lock();
    std::lock_guard lock(stateMutex);
    switch(event->event_id) {
    case MPV_EVENT_SHUTDOWN:
        tracking.Finish(tracking.session,false);mpv=nullptr;break;
    case MPV_EVENT_START_FILE: {
        const auto entry=static_cast<mpv_event_start_file*>(event->data)->playlist_entry_id;
        int64_t current=-1;
        if(mpv_get_property(player,"playlist/0/id",MPV_FORMAT_INT64,&current)>=0 && current!=entry) {
            bindings.erase(entry);break; // A queued START_FILE superseded by rapid episode switching.
        }
        auto found=bindings.find(entry);tracking.Begin(entry,found==bindings.end()?Json::object():found->second);
        if(found!=bindings.end()) bindings.erase(found);
        break;
    }
    case MPV_EVENT_FILE_LOADED: {
        Snapshot(player); int value=0;
        if(mpv_get_property(player,"pause",MPV_FORMAT_FLAG,&value)>=0)tracking.Pause(value!=0);
        tracking.Loaded();break;
    }
    case MPV_EVENT_PROPERTY_CHANGE:
        if(event->reply_userdata==Observer) {
            auto property=static_cast<mpv_event_property*>(event->data);
            if(!property || !property->name || !property->data)break;
            const std::string name=property->name;
            if(property->format==MPV_FORMAT_DOUBLE) {
                const double value=*static_cast<double*>(property->data);
                if(name=="time-pos")tracking.Position(value);else if(name=="duration")tracking.Duration(value);
            } else if(property->format==MPV_FORMAT_FLAG) {
                const bool value=*static_cast<int*>(property->data)!=0;
                if(name=="pause") {Snapshot(player);tracking.Pause(value);}
                else if(name=="paused-for-cache") {Snapshot(player);tracking.Buffer(value);}
                else if(name=="seeking") {if(!value)Snapshot(player);tracking.Seeking(value);}
            }
        }
        break;
    case MPV_EVENT_END_FILE: {
        const auto ended=static_cast<mpv_event_end_file*>(event->data);
        tracking.Finish(ended->playlist_entry_id,ended->reason==MPV_END_FILE_REASON_EOF);
        bindings.erase(ended->playlist_entry_id);break;
    }
    default:break;
    }
    Drain();
}
void Shutdown() {
    if(!initialized || stopping) return;
    BeforeLoad(); ++authGeneration;
    {std::lock_guard lock(workMutex);stopping=true;} workChanged.notify_all();
    if(authListener.joinable())authListener.join();
    {std::unique_lock lock(workMutex); if(!workerEnded.wait_for(lock,std::chrono::seconds(3),[]{return workerDone;})) {
        if(const auto request=activeRequest.exchange(nullptr))WinHttpCloseHandle(request);
    }}
    if(worker.joinable())worker.join();
    WSACleanup();mpv=nullptr;
}
} // namespace simkl
