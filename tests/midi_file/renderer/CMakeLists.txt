cmake_minimum_required(VERSION 3.20)
project(renderer CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add BASS SDK include directories for header resolution
include_directories(bin/x64 bin/x86)

add_executable(renderer renderer.cpp)