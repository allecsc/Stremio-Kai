#include "updater.h"
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/sha.h>
#include <curl/curl.h>
#include "../core/globals.h"
#include "../utils/crashlog.h"
#include "../utils/helpers.h"
#include "../node/server.h"
#include <fstream>
#include <sstream>
#include <iomanip>
#include <iostream>

static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp)
{
    std::string* s = reinterpret_cast<std::string*>(userp);
    s->append(reinterpret_cast<char*>(contents), size * nmemb);
    return size * nmemb;
}

// Download to string
static bool DownloadString(const std::string& url, std::string& outData)
{
    CURL* curl = curl_easy_init();
    if(!curl) return false;
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &outData);
    CURLcode res = curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    return res == CURLE_OK;
}

// Download to file
static bool DownloadFile(const std::string& url, const std::filesystem::path& dest)
{
    CURL* curl = curl_easy_init();
    if(!curl) return false;
    FILE* fp = _wfopen(dest.c_str(), L"wb");
    if(!fp){
        curl_easy_cleanup(curl);
        return false;
    }
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, fp);

    CURLcode res = curl_easy_perform(curl);
    fclose(fp);
    curl_easy_cleanup(curl);
    return (res == CURLE_OK);
}

// Compute sha256
static std::string FileChecksum(const std::filesystem::path& filepath)
{
    std::ifstream file(filepath, std::ios::binary);
    if(!file) return "";
    SHA256_CTX ctx;
    SHA256_Init(&ctx);
    char buf[4096];
    while(file.read(buf, sizeof(buf))) {
        SHA256_Update(&ctx, buf, file.gcount());
    }
    if(file.gcount()>0) {
        SHA256_Update(&ctx, buf, file.gcount());
    }
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_Final(hash, &ctx);
    std::ostringstream oss;
    for(int i=0; i<SHA256_DIGEST_LENGTH; ++i)
        oss << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
    return oss.str();
}

static bool VerifySignature(const std::string& data, const std::string& signatureBase64)
{
    // Load public key from embedded PEM
    BIO* bio = BIO_new_mem_buf(public_key_pem, -1);
    EVP_PKEY* pubKey = PEM_read_bio_PUBKEY(bio, nullptr, nullptr, nullptr);
    BIO_free(bio);
    if(!pubKey) return false;

    // remove whitespace
    std::string cleanedSig;
    for(char c : signatureBase64){
        if(!isspace((unsigned char)c)) {
            cleanedSig.push_back(c);
        }
    }
    // base64 decode
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    BIO* bmem = BIO_new_mem_buf(cleanedSig.data(), (int)cleanedSig.size());
    bmem = BIO_push(b64, bmem);

    std::vector<unsigned char> signature(512);
    int sig_len = BIO_read(bmem, signature.data(), (int)signature.size());
    BIO_free_all(bmem);
    if(sig_len <= 0) {
        EVP_PKEY_free(pubKey);
        return false;
    }

    EVP_MD_CTX* ctx = EVP_MD_CTX_new();
    EVP_PKEY_CTX* pctx = nullptr;
    bool result = false;
    if(EVP_DigestVerifyInit(ctx, &pctx, EVP_sha256(), NULL, pubKey)==1){
        if(EVP_DigestVerifyUpdate(ctx, data.data(), data.size())==1){
            result = (EVP_DigestVerifyFinal(ctx, signature.data(), sig_len)==1);
        }
    }
    EVP_MD_CTX_free(ctx);
    EVP_PKEY_free(pubKey);
    return result;
}

void RunAutoUpdaterOnce()
{
    if (g_updateUrl.empty()) return;
    g_updaterRunning = true;
    std::cout<<"Checking for Updates.\n";

    std::string versionContent;
    if(!DownloadString(g_updateUrl, versionContent)) {
        AppendToCrashLog("[UPDATER]: Failed to download version.json");
        return;
    }
    nlohmann::json versionJson;
    try {
        versionJson = nlohmann::json::parse(versionContent);
    } catch(...) { return; }

    std::string versionDescUrl = versionJson["versionDesc"].get<std::string>();
    std::string signatureBase64 = versionJson["signature"].get<std::string>();

    // get version-details
    std::string detailsContent;
    if(!DownloadString(versionDescUrl, detailsContent)) {
        AppendToCrashLog("[UPDATER]: Failed to download version details");
        return;
    }
    if(!VerifySignature(detailsContent, signatureBase64)) {
        AppendToCrashLog("[UPDATER]: Signature verification failed");
        return;
    }
    nlohmann::json detailsJson;
    try {
        detailsJson = nlohmann::json::parse(detailsContent);
    } catch(...) { return; }

    // Compare shellVersion
    std::string remoteShellVersion = detailsJson["shellVersion"].get<std::string>();
    bool needsFullUpdate = (remoteShellVersion != APP_VERSION);

    auto files = detailsJson["files"];
    std::vector<std::string> partialUpdateKeys = { "server.js" };

    // prepare temp dir
    wchar_t buf[MAX_PATH];
    GetTempPathW(MAX_PATH, buf);
    std::filesystem::path tempDir = std::filesystem::path(buf) / L"stremio_updater";
    std::filesystem::create_directories(tempDir);

    // handle full update
    if(needsFullUpdate || g_autoupdaterForceFull) {
        bool allDownloadsSuccessful = true;
        // check architecture
        std::string key = "windows";
        SYSTEM_INFO systemInfo;
        GetNativeSystemInfo(&systemInfo);
        if(systemInfo.wProcessorArchitecture==PROCESSOR_ARCHITECTURE_AMD64){
            key = "windows-x64";
        } else if(systemInfo.wProcessorArchitecture==PROCESSOR_ARCHITECTURE_INTEL) {
            key = "windows-x86";
        }

        if(files.contains(key) && files[key].contains("url") && files[key].contains("checksum")) {
            std::string url = files[key]["url"].get<std::string>();
            std::string expectedChecksum = files[key]["checksum"].get<std::string>();
            std::string filename = url.substr(url.find_last_of('/') + 1);
            std::filesystem::path installerPath = tempDir / std::wstring(filename.begin(), filename.end());

            // Cleanup: Delete all files in tempDir except the current installer
            for (const auto& entry : std::filesystem::directory_iterator(tempDir)) {
                if (entry.path() != installerPath) {
                    try {
                        std::filesystem::remove_all(entry.path());
                    } catch (const std::exception& e) {
                        AppendToCrashLog("[UPDATER]: Cleanup failed for " + entry.path().string() + ": " + e.what());
                    }
                }
            }

            if(std::filesystem::exists(installerPath)) {
                if(FileChecksum(installerPath) != expectedChecksum) {
                    std::filesystem::remove(installerPath);
                    if(!DownloadFile(url, installerPath)) {
                        AppendToCrashLog("[UPDATER]: Failed to re-download installer");
                        allDownloadsSuccessful = false;
                    }
                }
            } else {
                if(!DownloadFile(url, installerPath)) {
                    AppendToCrashLog("[UPDATER]: Failed to download installer");
                    allDownloadsSuccessful = false;
                }
            }
            if(FileChecksum(installerPath) != expectedChecksum) {
                AppendToCrashLog("[UPDATER]: Installer file corrupted: " + installerPath.string());
                allDownloadsSuccessful = false;
            }
            if(allDownloadsSuccessful) {
                g_installerPath = installerPath;
            }
        } else {
            allDownloadsSuccessful = false;
        }

        if(allDownloadsSuccessful) {
            std::cout<<"Full update needed!\n";
            nlohmann::json j;
            j["type"] = "requestUpdate";
            g_outboundMessages.push_back(j);
            PostMessage(g_hWnd, WM_NOTIFY_FLUSH, 0, 0);
        } else {
            std::cout<<"Installer download failed. Skipping update prompt.\n";
        }
    }

    // partial update
    if(!needsFullUpdate) {
        std::wstring exeDir;
        {
            wchar_t pathBuf[MAX_PATH];
            GetModuleFileNameW(nullptr, pathBuf, MAX_PATH);
            exeDir = pathBuf;
            size_t pos = exeDir.find_last_of(L"\\/");
            if(pos!=std::wstring::npos) exeDir.erase(pos);
        }
        for(const auto& key : partialUpdateKeys) {
            if(files.contains(key) && files[key].contains("url") && files[key].contains("checksum")) {
                std::string url = files[key]["url"].get<std::string>();
                std::string expectedChecksum = files[key]["checksum"].get<std::string>();

                std::filesystem::path localFilePath = std::filesystem::path(exeDir) / std::wstring(key.begin(), key.end());
                if(std::filesystem::exists(localFilePath)) {
                    if(FileChecksum(localFilePath) == expectedChecksum) {
                        continue; // no update needed
                    }
                }
                if(!DownloadFile(url, localFilePath)) {
                    AppendToCrashLog("[UPDATER]: Failed to download partial file " + key);
                } else {
                    if(FileChecksum(localFilePath) != expectedChecksum) {
                        AppendToCrashLog("[UPDATER]: Downloaded file corrupted " + localFilePath.string());
                        continue;
                    }
                    if(key=="server.js") {
                        StopNodeServer();
                        StartNodeServer();
                    }
                }
            }
        }
    }

    std::cout<<"[UPDATER]: Update check done!\n";
}

void RunInstallerAndExit()
{
    if(g_installerPath.empty()) {
        AppendToCrashLog("[UPDATER]: Installer path not set.");
        return;
    }
    // pass /overrideInstallDir
    wchar_t exeDir[MAX_PATH];
    GetModuleFileNameW(nullptr, exeDir, MAX_PATH);
    std::wstring dir(exeDir);
    size_t pos = dir.find_last_of(L"\\/");
    if(pos!=std::wstring::npos) {
        dir.erase(pos);
    }

    std::wstring arguments = L"/overrideInstallDir=\"" + dir + L"\"";
    HINSTANCE result = ShellExecuteW(nullptr, L"open", g_installerPath.c_str(), arguments.c_str(), nullptr, SW_HIDE);
    if ((INT_PTR)result <= 32) {
        AppendToCrashLog(L"[UPDATER]: Failed to start installer via ShellExecute.");
    }

    PostQuitMessage(0);
    exit(0);
}
