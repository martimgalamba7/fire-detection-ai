// Arduino.h - minimal stand-in for the Arduino API, so the fusion library can be
// compiled and tested on a laptop (no board needed). Only what the library uses.
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <deque>

// Fake clock: tests move time forward with advanceMillis().
extern unsigned long g_fakeMillis;
inline unsigned long millis() { return g_fakeMillis; }
inline void advanceMillis(unsigned long ms) { g_fakeMillis += ms; }

template <class T> T constrain(T v, T lo, T hi) { return v < lo ? lo : (v > hi ? hi : v); }
template <class T> T min(T a, T b) { return a < b ? a : b; }

class Print {
public:
  virtual ~Print() {}
  virtual void write(const char *s) = 0;
  void print(const char *s) { write(s); }
  void print(char c) { char b[2] = {c, 0}; write(b); }
  void print(int v) { write(std::to_string(v).c_str()); }
  void print(unsigned v) { write(std::to_string(v).c_str()); }
  void print(unsigned long v) { write(std::to_string(v).c_str()); }
  void print(float v, int digits) { char b[32]; snprintf(b, sizeof b, "%.*f", digits, v); write(b); }
  void println(int v) { print(v); write("\n"); }
  void println(const char *s) { write(s); write("\n"); }
};

class Stream : public Print {
public:
  virtual int available() = 0;
  virtual int read() = 0;
};

// Captures everything written; tests can inject incoming bytes.
class FakeSerial : public Stream {
public:
  std::string out;            // what the library sent
  std::deque<char> in;        // what the library will receive
  void write(const char *s) override { out += s; }
  int available() override { return (int)in.size(); }
  int read() override { if (in.empty()) return -1; char c = in.front(); in.pop_front(); return c; }
  void inject(const std::string &s) { for (char c : s) in.push_back(c); }
};

class Uart : public FakeSerial {};   // only so CameraSerial.h compiles
extern FakeSerial Serial;
