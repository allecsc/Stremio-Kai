cmake_minimum_required(VERSION 3.16)

project(stremio VERSION "5.0.22")

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

option(DEBUG_LOG "Allow diagnostic logs (may include stream URLs)" OFF)

# Locate MPV
if(CMAKE_SIZEOF_VOID_P EQUAL 8)
    # 64-bit architecture
    set(MPV_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/x86_64/include")
    set(MPV_LIBRARY "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/x86_64/mpv.lib")
    set(MPV_DLL "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/x86_64/libmpv-2.dll")

    set(DISCORD_LIB "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc/win64-static/lib/discord-rpc.lib")
    set(DISCORD_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc/win64-static/include")
else()
    # 32-bit architecture
    set(MPV_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/i686/include")
    set(MPV_LIBRARY "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/i686/mpv.lib")
    set(MPV_DLL "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/i686/libmpv-2.dll")

    set(DISCORD_LIB "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc/win32-static/lib/discord-rpc.lib")
    set(DISCORD_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc/win32-static/include")
endif()

set(DISCORD_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc-source")
add_library(kai_discord_rpc STATIC
    ${DISCORD_SOURCE_DIR}/src/discord_rpc.cpp
    ${DISCORD_SOURCE_DIR}/src/rpc_connection.cpp
    ${DISCORD_SOURCE_DIR}/src/serialization.cpp
    ${DISCORD_SOURCE_DIR}/src/connection_win.cpp
    ${DISCORD_SOURCE_DIR}/src/discord_register_win.cpp)
target_compile_definitions(kai_discord_rpc PRIVATE DISCORD_WINDOWS)
target_include_directories(kai_discord_rpc PUBLIC ${DISCORD_SOURCE_DIR}/include
    PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/deps/rapidjson/include")
target_link_libraries(kai_discord_rpc PRIVATE psapi advapi32)
include_directories(${MPV_INCLUDE_DIR})

find_package(OpenSSL REQUIRED)
find_package(CURL REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(unofficial-webview2 CONFIG REQUIRED)

set(SOURCES
        src/main.cpp
        stremio.rc
        src/core/globals.h
        src/core/globals.cpp
        src/utils/helpers.h
        src/utils/helpers.cpp
        src/utils/config.h
        src/utils/config.cpp
        src/utils/crashlog.h
        src/utils/crashlog.cpp
        src/mpv/player.h
        src/mpv/player.cpp
        src/node/server.cpp
        src/node/server.h
        src/tray/tray.h
        src/tray/tray.cpp
        src/ui/splash.h
        src/ui/splash.cpp
        src/updater/updater.cpp
        src/updater/updater.h
        src/webview/webview.h
        src/webview/webview.cpp
        src/ui/mainwindow.h
        src/ui/mainwindow.cpp
        src/resource.h
        src/utils/extensions.cpp
        src/utils/extensions.h
        src/utils/discord.cpp
        src/utils/discord.h
        src/simkl/simkl.cpp
        src/simkl/simkl.h
        src/simkl/tracking.h
)

add_executable(${PROJECT_NAME} WIN32 ${SOURCES})

# Give each bundled UI build its own navigation URL so a previous PWA cache
# cannot serve an older index.html after an application update.
execute_process(COMMAND git rev-parse HEAD
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    OUTPUT_VARIABLE KAI_UI_BUILD_ID OUTPUT_STRIP_TRAILING_WHITESPACE)
if(NOT KAI_UI_BUILD_ID)
    set(KAI_UI_BUILD_ID "${PROJECT_VERSION}")
endif()
target_compile_definitions(${PROJECT_NAME} PRIVATE KAI_UI_BUILD_ID="${KAI_UI_BUILD_ID}")


target_link_libraries(${PROJECT_NAME} PRIVATE
        gdiplus.lib
        dwmapi.lib
        Shcore.lib
        Msimg32.lib
        winhttp.lib
        crypt32.lib
        bcrypt.lib
        advapi32.lib
        ws2_32.lib
        shlwapi.lib
        nlohmann_json::nlohmann_json
        unofficial::webview2::webview2
        OpenSSL::SSL
        OpenSSL::Crypto
        CURL::libcurl
        ${MPV_LIBRARY}
        kai_discord_rpc
)

if(DEBUG_LOG)
    target_compile_definitions(${PROJECT_NAME} PRIVATE DEBUG_LOG)
endif()

include(CTest)
if(BUILD_TESTING)
    add_executable(simkl_tracking_test tests/tracking_test.cpp)
    target_link_libraries(simkl_tracking_test PRIVATE nlohmann_json::nlohmann_json)
    target_compile_options(simkl_tracking_test PRIVATE /UNDEBUG)
    add_test(NAME simkl_tracking COMMAND simkl_tracking_test)
    add_executable(kai_runtime_fixture tests/runtime_fixture.cpp)
    add_executable(kai_startup_test tests/startup_test.cpp src/node/server.cpp)
    target_link_libraries(kai_startup_test PRIVATE nlohmann_json::nlohmann_json
        unofficial::webview2::webview2 shell32 user32)
    add_test(NAME kai_startup COMMAND kai_startup_test "$<TARGET_FILE:kai_runtime_fixture>")
    set_tests_properties(kai_startup PROPERTIES TIMEOUT 30)
endif()

# Copy MPV DLL
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${MPV_DLL}"
        $<TARGET_FILE_DIR:${PROJECT_NAME}>
)
