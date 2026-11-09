#!/bin/sh
# Compiles the fusion library with the stub Arduino.h and runs the tests on the laptop.
set -e
cd "$(dirname "$0")"
SRC=../../src
c++ -std=c++17 -Wall -Wextra -I. -I$SRC -o test_fusion \
    test_fusion.cpp $SRC/CameraLink.cpp $SRC/FireFusion.cpp $SRC/LoraPayload.cpp
./test_fusion
