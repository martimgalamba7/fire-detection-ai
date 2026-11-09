/*
 * esp32cam_collector.ino
 * Dataset collector for the fire / smoke / normal classifier.
 *
 * Connect the ESP32-CAM to Wi-Fi (e.g. your phone hotspot), open the IP address
 * printed on the serial monitor in a browser on your laptop, and press
 * "smoke", "fire" or "normal". The current photo is downloaded to the laptop as
 *   <label>_<YYYYMMDD-HHMMSS>_<n>.jpg
 * Move the files into data/own/<label>/ afterwards.
 *
 * The camera settings (QVGA 320x240 JPEG) are the same as in esp32cam_inference,
 * so training images look like what the model sees in the field.
 *
 * Wi-Fi credentials: copy secrets.example.h to secrets.h and fill it in (R24).
 * Board: "AI Thinker ESP32-CAM", PSRAM enabled.
 */

#include <WiFi.h>
#include <WebServer.h>
#include "esp_camera.h"
#include "camera_pins.h"
#include "secrets.h"     // WIFI_SSID, WIFI_PASSWORD (not in git)

WebServer server(80);

// The web page. Kept in flash (PROGMEM). The laptop's clock is used for the
// timestamp in the file name, because the ESP32 has no real-time clock.
static const char PAGE[] PROGMEM = R"HTML(
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32-CAM collector</title>
<style>
 body{font-family:sans-serif;text-align:center;margin:12px}
 img{width:100%;max-width:640px;border:1px solid #888}
 button{font-size:1.3em;margin:6px;padding:12px 22px;border:0;border-radius:8px;color:#fff}
 .smoke{background:#777}.fire{background:#d9480f}.normal{background:#2b8a3e}
 #log{font-family:monospace}
</style></head><body>
<h2>ESP32-CAM dataset collector</h2>
<img id="live" src="/capture">
<div>
 <button class="smoke"  onclick="save('smoke')">smoke</button>
 <button class="fire"   onclick="save('fire')">fire</button>
 <button class="normal" onclick="save('normal')">normal</button>
</div>
<p>Counts this session: <span id="log">smoke 0 | fire 0 | normal 0</span></p>
<p><small>Tip: "normal" includes fog, steam, dust, shadows, sky, clouds, glare.</small></p>
<script>
const counts={smoke:0,fire:0,normal:0};
const img=document.getElementById('live');
// Refresh the preview continuously (one frame after the other).
function refresh(){ img.src='/capture?t='+Date.now(); }
img.onload=()=>setTimeout(refresh,100);
img.onerror=()=>setTimeout(refresh,1000);
function stamp(){ const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds()); }
async function save(label){
  const r=await fetch('/capture?t='+Date.now()); const b=await r.blob();
  counts[label]++;
  const a=document.createElement('a'); a.href=URL.createObjectURL(b);
  a.download=label+'_'+stamp()+'_'+counts[label]+'.jpg'; a.click();
  document.getElementById('log').textContent=
    'smoke '+counts.smoke+' | fire '+counts.fire+' | normal '+counts.normal;
}
</script></body></html>
)HTML";

bool initCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;  c.pin_d1 = Y3_GPIO_NUM;  c.pin_d2 = Y4_GPIO_NUM;  c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;  c.pin_d5 = Y7_GPIO_NUM;  c.pin_d6 = Y8_GPIO_NUM;  c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM;  c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM;  c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_QVGA;   // same as the inference sketch
  c.jpeg_quality = 12;
  c.fb_count = 1;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  return esp_camera_init(&c) == ESP_OK;
}

void handleRoot() { server.send_P(200, "text/html", PAGE); }

// Returns one JPEG frame.
void handleCapture() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) { server.send(500, "text/plain", "capture failed"); return; }
  server.sendHeader("Cache-Control", "no-store");
  server.send_P(200, "image/jpeg", (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void setup() {
  Serial.begin(115200);
  if (!initCamera()) {
    Serial.println("Camera init failed - check the ribbon cable and power");
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print('.'); }
  Serial.println();
  Serial.print("Open in your browser: http://");
  Serial.println(WiFi.localIP());

  server.on("/", handleRoot);
  server.on("/capture", handleCapture);
  server.begin();
}

void loop() {
  server.handleClient();
}
