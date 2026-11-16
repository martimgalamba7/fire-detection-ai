// Builds "AI Design Document" (.docx) for the Fire Detection System.
// Usage: npm install docx && node docs/design/build_design_doc.js <repo-root> <output.docx>
// Diagrams: plantuml -tpng -Sdpi=200 docs/design/0*.puml
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, ExternalHyperlink, PageBreak, TableOfContents,
  LevelFormat, Header, Footer, PageNumber, VerticalAlign,
} = require("docx");

const REPO = process.argv[2];
const OUT = process.argv[3];
const DIAG = path.join(REPO, "docs", "design");
const GH = "https://github.com/martimgalamba7/fire-detection-ai";
const BLUE = "1F4E79";
const HEAD_FILL = "BDD7EE";
const COL_FILL = "DEEAF6";
const CONTENT_W = 9026; // A4 minus 2 x 1" margins (DXA)

// ---------- helpers ----------
// Inline markup: **bold**, `code`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: "Courier New", size: 18, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text, opts = {}) =>
  new Paragraph({ children: runs(text), spacing: { after: 120, line: 276 }, alignment: AlignmentType.JUSTIFIED, ...opts });
const H1 = (t, newPage = true) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: newPage, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const bullet = (t, level = 0) =>
  new Paragraph({ numbering: { reference: "bullets", level }, children: runs(t), spacing: { after: 60 } });
const numbered = (t) =>
  new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: runs(t), spacing: { after: 60 } });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const link = (text, url) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: "Hyperlink" })] })],
  });

function caption(text) {
  return new Paragraph({
    children: runs(text, { italics: true, size: 19, color: "404040" }),
    spacing: { before: 60, after: 240 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function image(name, maxW = 600, maxH = 820) {
  const file = path.join(DIAG, name);
  const { w, h } = pngSize(file);
  const s = Math.min(maxW / w, maxH / h);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: Math.round(w * s), height: Math.round(h * s) },
      altText: { title: name, description: name, name } })],
  });
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
const borders = { top: border, bottom: border, left: border, right: border };
// rows: array of arrays of strings. widths in DXA must sum to CONTENT_W.
function table(header, rows, widths, { firstColShade = true, fontSize = 18 } = {}) {
  const cell = (text, w, { head = false, shade } = {}) =>
    new TableCell({
      borders, width: { size: w, type: WidthType.DXA },
      shading: shade ? { fill: shade, type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      verticalAlign: VerticalAlign.TOP,
      children: String(text).split("\n").map((line) =>
        new Paragraph({ children: runs(line, { size: fontSize, bold: head || undefined }), spacing: { after: 40 } })),
    });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, widths[i], { head: true, shade: HEAD_FILL })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) =>
        cell(c, widths[i], { shade: i === 0 && firstColShade ? COL_FILL : undefined, head: i === 0 && firstColShade })) })),
    ],
  });
}
const gap = () => new Paragraph({ children: [], spacing: { after: 120 } });

// ---------- content ----------
const body = [];
const add = (...xs) => body.push(...xs);

// Title block (same structure as the Challenge 2 design)
add(
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 240 },
    children: [new TextRun({ text: "AI DESIGN DOCUMENT", bold: true, size: 44, color: BLUE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1600 },
    children: [new TextRun({ text: "On-device smoke and fire recognition and gas + camera fusion", size: 26, color: "404040" })] }),
  new Paragraph({ children: runs("**Name:** Martim Ferreira Galamba") }),
  new Paragraph({ children: runs("**Class:** EN01") }),
  new Paragraph({ children: runs("**Role:** AI part (image classifier, decision logic, model pipeline)") }),
  new Paragraph({ children: runs("**Date:** 16 November 2026") }),
  new Paragraph({ children: runs("**Version:** 0.1"), spacing: { after: 240 } }),
  new Paragraph({ children: [new TextRun("Repository and PlantUML code of all diagrams: "),
    new ExternalHyperlink({ link: GH, children: [new TextRun({ text: GH, style: "Hyperlink" })] })] }),
  pageBreak(),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: "Table of contents", bold: true, size: 32 })] }),
  new TableOfContents("Table of contents", { hyperlink: true, headingStyleRange: "1-2" }),
  P("(Right-click the table and choose “Update field” in Word to refresh the page numbers.)", { alignment: AlignmentType.LEFT }),
);

// Introduction
add(
  H1("Introduction"),
  P("This document describes the design of the artificial-intelligence part of the Fire Detection System. It builds on the research, analysis and advice of the previous weeks and on the designs of the other parts in this report: the bench prototype (Device Design), the security design, the website design and the network and cloud infrastructure design."),
  P("The AI part decides whether what the node sees is an early fire. It runs entirely on the node: an image classifier on the **ESP32-CAM** and a decision (fusion) layer on the **Arduino MKR WAN 1300**. Only a label, a confidence and a vote count leave the camera, never the image, so the result fits in a LoRaWAN message of 12 bytes."),
  P("The design is not only on paper. A first version is implemented and tested on a laptop (dataset tools, three trained models, camera firmware that compiles for the ESP32-CAM, a fusion library with 53 unit tests). Where the document gives numbers, they are measured; where hardware tests are still open, this is stated."),
);

// 1. Purpose and scope
add(
  H1("1. Purpose and Scope", false),
  H2("1.1 Purpose"),
  P("The AI part must recognise early smoke and flames in camera images, filter false triggers that fool gas sensors (fog, steam, dust, shadows, clouds), and combine this with the gas and flame sensors into one trustworthy alarm decision that is sent to the dashboard."),
  H2("1.2 In scope"),
  bullet("On-device image classification into **smoke**, **fire** and **normal** with a confidence score (FR02–FR04)."),
  bullet("Sensor-triggered activation of the camera (FR01) and the alert threshold (FR05)."),
  bullet("The UART protocol between the MKR and the camera, including a checksum (SEC8)."),
  bullet("The fusion state machine on the MKR (IDLE / SUSPECT / ALARM) and the 12-byte LoRa payload layout (R11, R15)."),
  bullet("The machine-learning pipeline: dataset, training, evaluation and deployment of the model."),
  bullet("Tools to measure false alarms during tests (R12) and a test plan."),
  H2("1.3 Out of scope"),
  bullet("Reading the sensors and setting the gas thresholds (R9/R10) – sensor firmware (Csaba Verba)."),
  bullet("LoRaWAN join, TTN, back end, database and website – other parts of the report."),
  bullet("Video streaming: the final node does not send images (NFR04, SEC8)."),
  bullet("Object detection (where the fire is in the picture) and fire-spread prediction."),
);

// 2. Requirements
add(
  H1("2. Requirements and Traceability", false),
  P("The table maps every AI requirement to the design element that meets it and to how it is verified. Related device (R) and security (SEC) requirements from the other designs are included."),
  table(["ID", "Requirement", "Design element", "Verification"], [
    ["FR01", "Camera in standby; capture only after a sensor anomaly", "FireFusion asks for `CAPTURE` only when `gasAnomaly` is true; camera idles at 80 MHz with radios off", "Unit test “no gas → camera never asked”; current measurement (R19)"],
    ["FR02", "Recognise early fire indicators", "MobileNetV1 0.25 classifier, D-Fire data filtered to visible smoke, own camera images", "Confusion matrix on held-out test set"],
    ["FR03", "Filter fog, dust, shadows", "`normal` class contains fog, steam, vapour, sky, clouds, dust, glare; 2-of-3 frame voting", "False-alarm rate on `normal`; field tests"],
    ["FR04", "Confidence score per classification", "Softmax output; mean score of the winning label sent in `RESULT`", "Protocol test, `RESULT` lines"],
    ["FR05", "Alert only above a threshold", "Per-frame threshold 0.70 + `MIN_VOTES` 2 of 3; fusion rule before LoRa", "Threshold sweep; fusion unit tests"],
    ["NFR01", "Energy efficient on ESP32", "int8 model, 80 MHz idle, 240 MHz only during inference, no Wi-Fi", "Current measurement (R19)"],
    ["NFR02", "Fast response", "3 frames per trigger, latency to be measured on the board; MKR timeout 15 s", "`capture took … ms` on device"],
    ["NFR03", "Works in difficult light", "Data augmentation, varied own images; flame sensor covers night", "Tests at different times of day"],
    ["NFR04", "Send metadata, not video", "Only `RESULT,label,conf,votes` leaves the camera", "Protocol specification"],
    ["NFR05", "Model can be updated", "Edge Impulse versioning; model is a replaceable library; `USE_MOCK_MODEL` switch", "v1 → v2 → v3 history"],
    ["R11 / SEC6", "Alarm from two agreeing kinds of evidence", "Fusion rule gas + camera or gas + flame", "`false_alarm_count.py` gas-only vs gas+camera"],
    ["R12", "Count false alarms per hour", "`FUSION,…` log lines per episode", "`false_alarm_count.py report`"],
    ["R15", "LoRa message ≤ 12 bytes", "`LoraPayload` encoder, fixed 12 bytes", "Unit test of byte layout"],
    ["R17 / SEC7", "Regular heartbeat", "Payload with state = heartbeat every 2 h", "Back end shows last message"],
    ["SEC5", "Never wait forever", "15 s camera timeout, errors treated as “camera normal”", "Unit tests timeout and error"],
    ["SEC8", "Camera result over a wire with a checksum, Wi-Fi off", "UART2 link, `*XX` XOR checksum, Wi-Fi off in final firmware", "Unit test checksum"],
  ], [1000, 2300, 3226, 2500]),
  gap(),
);

// 3. Use cases
add(
    H1("3. Use Cases"),
  image("02-use-cases.png", 600, 420),
  caption("Use case diagram of the AI subsystem. The node-side use cases (UC1–UC6) run automatically in the forest; UC7 and UC8 are the development cycle in which the AI developer collects data and trains, evaluates and deploys the model with Edge Impulse. UC4 extends UC1 at night, when the camera sees nothing but the flame sensor does."),
  H2("3.1 Use case descriptions"),
  table(["Use case", "Actors", "Trigger and main flow", "Result / alternative"], [
    ["UC1 Detect early fire or smoke", "Environment, Sensor hub", "Gas values pass a threshold → MKR sends `CAPTURE` → camera classifies 3 frames (UC2) → fusion decides", "ALARM sent (UC5); otherwise SUSPECT and re-check after 30 s"],
    ["UC2 Classify images on the camera", "ESP32-CAM", "Capture QVGA frame, crop and resize to 96x96, run the int8 model, vote over 3 frames", "`RESULT,label,conf,k/n` or `ERROR,reason`"],
    ["UC3 Filter false triggers", "Environment", "Fog, steam or dust raise the gas or look like smoke; the model labels the frames `normal`", "No alarm; episode logged as cleared"],
    ["UC4 Detect fire at night", "Environment, Sensor hub", "Camera says `normal` (dark) but the flame sensor fires", "ALARM with reason FLAME"],
    ["UC5 Send alarm with AI result", "Sensor hub, Dashboard user", "State changes → 12-byte payload with state, reason, label, confidence, votes and sensor values", "Dashboard shows alarm and AI label"],
    ["UC6 Report node health", "Sensor hub, Dashboard user", "Every 2 h a heartbeat; camera errors (timeout, checksum) are logged", "A silent or broken node is noticed"],
    ["UC7 Collect labelled camera images", "AI developer", "Collector firmware shows a live page with smoke / fire / normal buttons; each click saves a labelled JPEG", "Own dataset for training and the final test set"],
    ["UC8 Train, evaluate and deploy", "AI developer, Edge Impulse", "Prepare data → upload → transfer learning → int8 → evaluate on laptop → export Arduino library", "New model version on the camera, model card updated"],
  ], [1900, 1500, 3326, 2300]),
);

// 4. Architecture
add(
    H1("4. System Architecture & Topology"),
  link("GitHub Link – PlantUML Code", GH + "/tree/main/docs/design"),
  image("01-system-context.png", 470, 700),
  caption("System context of the AI subsystem. The forest acts on the sensors (gas, heat, infrared) and on the camera (light). The MKR WAN 1300 is the hub: it reads the sensors, triggers the ESP32-CAM over UART and runs the fusion logic. The alarm leaves the node as a 12-byte LoRaWAN payload to The Things Network, which forwards it to the back end, the database and the website dashboard that the ranger sees."),
  pageBreak(),
  image("03-architecture.png", 380, 820),
  caption("Layered architecture of the AI part on both boards. On the ESP32-CAM, the Acquisition layer (camera driver, newest frame only) feeds the Inference layer (pre-processing to 96x96 RGB and the Edge Impulse SDK running the int8 MobileNetV1), the Decision layer (multi-frame voting) and the Communication layer (protocol handler with checksum). On the MKR, the sensor layer delivers two booleans (gas anomaly, flame) to the FireFusion library, which drives the camera through CameraLink and hands the result to the 12-byte LoRa encoder."),
);

// 5. Tech stack
add(
    H1("5. Tech Stack Comparison and Selection"),
  table(["Component Layer", "Options", "Chosen Solution", "Downside of Alternatives"], [
    ["Where inference runs", "On the ESP32-CAM (edge); on the server (send image); on the MKR", "**On the ESP32-CAM**", "LoRaWAN carries a few bytes, not images (a QVGA JPEG is about 5 kB = hundreds of messages); sending images also breaks SEC8 and privacy. The SAMD21 on the MKR has 32 kB RAM, too little for a CNN."],
    ["ML platform", "Edge Impulse; TensorFlow/Keras + TFLite Micro by hand; Google Teachable Machine", "**Edge Impulse**", "Hand-made Keras + TFLite Micro needs manual quantisation, memory planning and C++ glue; Teachable Machine has no int8 export for ESP32 and no versioning or on-device estimates."],
    ["Task type", "Image classification; object detection (YOLO, FOMO); colour rules", "**Image classification (3 classes)**", "Detection models need bounding-box labels and more memory and only add “where”, which we do not need; colour rules cannot tell smoke from fog, steam or clouds (FR03)."],
    ["Model architecture", "MobileNetV1 0.1 / 0.25; MobileNetV2 0.35; EfficientNet / ResNet", "**MobileNetV1 0.25 (96x96 RGB)**", "MobileNetV2 0.35 was tried (v3): best in float32 but drops to 66 % after int8 and needs ~1.5 s per frame; V1 0.1 has less capacity; EfficientNet/ResNet do not fit the ESP32 memory."],
    ["Numeric format", "int8 quantised; float32", "**int8**", "float32 is about 4x larger and much slower on an ESP32 without AI accelerator; v2 lost only about 1 % accuracy in int8."],
    ["Training data", "D-Fire (public); other public sets (FireNet, Kaggle); only own images", "**D-Fire subset + own ESP32-CAM images**", "Only public data gives a domain gap (better cameras); only own images are too few and cannot contain real wildfires; D-Fire has 21,527 labelled images including smoke-only and negatives."],
    ["Decision over frames", "Single frame; 2-of-3 voting; moving average", "**2-of-3 voting, threshold 0.70**", "A single frame is sensitive to noise, motion and glare; a moving average needs a continuous stream, which conflicts with FR01 standby."],
    ["Camera ↔ MKR link", "UART; I2C; SPI; Wi-Fi", "**UART (ESP32 UART2 ↔ SAMD21 SERCOM0)**", "I2C/SPI slave mode on the ESP32-CAM is awkward and the camera already uses the SCCB/I2C pins; Wi-Fi is the largest attack surface (SEC8) and costs power."],
    ["Protocol format", "Text lines with checksum; binary frames; JSON", "**Text lines + XX checksum**", "Binary frames are hard to debug in a serial monitor; JSON is too heavy for the SAMD21 and the LoRa payload anyway."],
    ["Evaluation tooling", "Edge Impulse UI only; own Python scripts", "**Both (own scripts as reference)**", "The Edge Impulse test score counts “uncertain” as wrong and its test set had stale samples; own scripts reproduce the device pre-processing exactly and give threshold sweeps and false-alarm counts."],
  ], [1700, 2300, 1900, 3126]),
);

// 6. Inference pipeline
add(
    H1("6. On-Device Inference Pipeline"),
  image("04-inference-activity.png", 600, 760),
  caption("Activity diagram of one `CAPTURE` on the ESP32-CAM, split into three swimlanes. Command handling validates the checksum and the command and raises the CPU clock; the inference loop grabs the newest frame, pre-processes it exactly as during training and runs the int8 model three times; the voting lane turns three sets of scores into one `RESULT` line. Every failure path ends in a specific `ERROR` reason, so the MKR never waits blindly."),
  H2("6.1 Configuration parameters"),
  table(["Parameter (config.h)", "Value", "Why"], [
    ["`NUM_FRAMES`", "3", "Enough to outvote one bad frame; keeps the response under a few seconds"],
    ["`MIN_VOTES`", "2", "Majority of 3 frames"],
    ["`CONFIDENCE_THRESHOLD`", "0.70", "Threshold sweep: 0.60 → 77 % recall / 23 % false alarms, 0.70 → 69 % / 13 %, 0.80 → 56 % / 7 % (per frame)"],
    ["`FRAME_INTERVAL_MS`", "150 ms", "Smoke moves between frames, so votes are not three copies of one image"],
    ["Frame size", "QVGA 320x240 JPEG", "Same as the collector, so training and field images match"],
    ["Model input", "96x96 RGB, centre crop", "Same “Fit shortest axis” resize as in Edge Impulse (a mismatch cost v1 accuracy)"],
    ["`USE_MOCK_MODEL`", "0 (real) / 1 (mock)", "Mock mode lets the UART protocol and fusion be tested before a model exists"],
  ], [2500, 1900, 4626]),
);

// 7. Communication
add(
    H1("7. Communication Protocols & Data Flow"),
  link("Sequence Diagram – PlantUML Code", GH + "/blob/main/docs/design/05-sequence.puml"),
  image("05-sequence.png", 600, 700),
  caption("Sequence diagram of the event-driven data flow between the sensors, the sensor firmware, the FireFusion library, the ESP32-CAM, LoRaWAN/TTN and the dashboard. It shows four scenarios: (1) a gas anomaly confirmed by the camera, which ends in an immediate alarm; (2) a gas anomaly where the camera only sees fog, which becomes SUSPECT and is re-checked after 30 s; (3) fault handling for a silent camera or a corrupted line, which never blocks the node (SEC5); and (4) the 2-hour heartbeat (R17, SEC7)."),
  H2("7.1 UART message specification"),
  P("Physical layer: 115200 baud, 8N1, 3.3 V on both sides, common ground. Every line is ASCII and ends with `\\n`; every line on the wire carries an XOR checksum `*XX` (SEC8)."),
  table(["Direction", "Message", "Meaning"], [
    ["MKR → CAM", "`CAPTURE*44`", "Take 3 frames, classify, vote, answer with RESULT or ERROR"],
    ["MKR → CAM", "`PING*10`", "Link check"],
    ["CAM → MKR", "`READY*4B`", "Sent once after boot when the camera works"],
    ["CAM → MKR", "`PONG*16`", "Answer to PING"],
    ["CAM → MKR", "`RESULT,<label>,<conf>,<k>/<n>*XX`", "Example `RESULT,smoke,0.87,2/3`: label after voting, confidence 0–1, k of n frames agree"],
    ["CAM → MKR", "`ERROR,<reason>*XX`", "camera_init, capture_failed, decode_failed, inference_failed, unknown_command, line_too_long, bad_checksum"],
    ["MKR only", "`timeout`, `bad_checksum`", "Generated by the MKR when the camera is silent for 15 s or a line is corrupted; treated as “camera normal”"],
  ], [1500, 3200, 4326]),
  gap(),
  H2("7.2 LoRaWAN payload (12 bytes, R15)"),
  P("The payload is sent on every state change and as a heartbeat every 2 hours. Layout proposed by the AI part, to be confirmed with the sensor firmware and back-end owners:"),
  table(["Byte", "Field", "Encoding"], [
    ["0", "Flags", "bits 0–1 state (0 idle, 1 suspect, 2 alarm, 3 heartbeat); bits 2–3 camera label (0 none, 1 normal, 2 smoke, 3 fire); bit 4 flame; bit 5 gas anomaly; bits 6–7 reason (0 none, 1 camera, 2 flame, 3 gas_persist)"],
    ["1", "Camera confidence", "round(conf x 100), 0–100"],
    ["2", "Votes", "high nibble k, low nibble n"],
    ["3–4", "MQ-7 raw", "uint16, big-endian"],
    ["5–6", "MQ-135 raw", "uint16, big-endian"],
    ["7–8", "CO2", "uint16 ppm, big-endian"],
    ["9", "Temperature", "int8 °C"],
    ["10–11", "Battery", "uint16 mV, big-endian"],
  ], [1000, 2000, 6026]),
  P("Example: an alarm confirmed by the camera (`state = 2`, label smoke, gas anomaly, reason camera) gives byte 0 = `0x6A`, byte 1 = `0x57` (0.87) and byte 2 = `0x23` (2 of 3)."),
);

// 8. Fusion
add(
    H1("8. Decision Logic: Sensor Fusion"),
  image("06-fusion-state.png", 560, 390),
  caption("State machine of the FireFusion library on the MKR. The camera is only asked in WAIT_CAMERA, after a gas anomaly (FR01). A visual confirmation or a flame gives an immediate ALARM; a gas anomaly without confirmation becomes SUSPECT and is re-checked after 30 s. An alarm is latched until gas and flame have been clear for 60 s, so one message is sent per event instead of a flood."),
  H2("8.1 Decision table"),
  table(["Gas anomaly", "Camera result", "Flame", "Decision", "Reason code"], [
    ["No", "(not asked)", "any", "IDLE", "–"],
    ["Yes", "smoke / fire", "any", "ALARM", "CAMERA"],
    ["Yes", "normal or error", "Yes", "ALARM (covers night)", "FLAME"],
    ["Yes", "normal or error", "No", "SUSPECT, re-check after 30 s", "–"],
    ["Still yes after 30 s", "smoke / fire / flame", "–", "ALARM", "CAMERA / FLAME"],
    ["Still yes after 30 s", "normal", "No", "ALARM (configurable)", "GAS_PERSIST"],
    ["Gone after 30 s", "–", "No", "IDLE (false trigger filtered)", "–"],
  ], [1700, 1800, 1000, 2826, 1700]),
  gap(),
  P("**Design decision – persistent gas.** The security design asks for two agreeing sources (SEC6). A gas anomaly that lasts 30 s with a camera that sees nothing is most likely a fire outside the field of view. Missing a real fire costs more than one extra alarm, so by default this escalates with its own reason code `GAS_PERSIST`, which the dashboard can show differently. Setting `escalateOnPersistentGas = false` gives the strict two-source rule."),
  P("**Fail-safe (SEC5).** A camera that does not answer within 15 s, or answers with a wrong checksum, is treated as “camera normal”. The node then still raises an alarm on gas + flame and re-checks a SUSPECT state, so a broken camera can never silence the node."),
);

// 9. Software design
add(
    H1("9. Software Design"),
  image("07-class-diagram.png", 600, 560),
  caption("Class diagram of the firmware. On the MKR, the FireFusion library is self-contained so the sensor firmware only calls `cameraSerialBegin()`, `fusion.update(gas, flame)` and `stateChanged()`. On the ESP32-CAM, `classifier.h` hides whether the real Edge Impulse model or the mock is used, and all tunable values live in `config.h`."),
  table(["Module", "Board", "Responsibility"], [
    ["`CameraLink`", "MKR", "Non-blocking UART client: sends commands with checksum, parses RESULT/ERROR, enforces the 15 s timeout"],
    ["`FireFusion`", "MKR", "State machine of section 8; logs every event as `FUSION,…` for false-alarm counting (R12)"],
    ["`LoraPayload`", "MKR", "Packs state, AI result and sensor values into exactly 12 bytes"],
    ["`CameraSerial`", "MKR", "Extra hardware UART on SERCOM0 (D2 TX, D3 RX), because Serial1 is used by the MH-Z19"],
    ["`esp32cam_inference.ino`", "ESP32-CAM", "Command loop, capture, voting, protocol output"],
    ["`classifier.h`", "ESP32-CAM", "JPEG decode, crop/resize, Edge Impulse call, mock model"],
    ["`esp32cam_collector.ino`", "ESP32-CAM", "Web page with smoke/fire/normal buttons for dataset collection (development only, Wi-Fi)"],
    ["Python tools", "Laptop", "Dataset conversion, cleaning, split, upload, evaluation, live webcam demo"],
  ], [2600, 1400, 5026]),
);

// 10. ML pipeline
add(
    H1("10. Machine Learning Pipeline & Model Design"),
  image("08-ml-pipeline.png", 600, 640),
  caption("Activity diagram of the machine-learning pipeline across the laptop, Edge Impulse and the ESP32-CAM. Public D-Fire data and own camera photos are cleaned and split on the laptop, trained and quantised in Edge Impulse, evaluated again on the laptop with the device pre-processing, and only then deployed. Every model is stored as a version, so the pipeline is a loop (v1 → v2 → v3)."),
  H2("10.1 Dataset design"),
  bullet("**Source:** D-Fire (Venâncio et al.), 21,527 images with YOLO boxes (class 0 smoke, class 1 fire, empty file = neither)."),
  bullet("**Labelling rule:** any fire box → `fire`; only smoke → `smoke`; no boxes → `normal`."),
  bullet("**Quality filter:** smoke covering less than 5 % of the picture (fire < 1 %) is removed – at 96x96 it is only a few pixels and taught the model noise."),
  bullet("**Cleaning:** resize to 320x240 (camera size), remove near-duplicates with a difference hash (657 removed)."),
  bullet("**Own data:** ESP32-CAM photos via the collector; hard negatives in `normal` (fog, kettle steam, vape and shisha clouds, grey clouds, sunsets, orange leaves)."),
  bullet("**Split:** train / validation from D-Fire and own images; **test set = own camera images only**, never used in training. Until these exist, a held-out D-Fire split is used as interim test set."),
  gap(),
  table(["Split (interim)", "smoke", "fire", "normal", "total"], [
    ["Train (D-Fire)", "989", "962", "742", "2,693"],
    ["Validation (D-Fire)", "211", "205", "159", "575"],
    ["Test (D-Fire, interim)", "211", "205", "159", "575"],
  ], [2826, 1550, 1550, 1550, 1550]),
  gap(),
  H2("10.2 Model iterations and results"),
  table(["Version", "Change", "Accuracy", "Hazard recall @0.70", "False alarms @0.70"], [
    ["v1", "MobileNetV1 0.25, all D-Fire images, resize mismatch (squash vs crop)", "58 %", "46 %", "8 %"],
    ["**v2 (chosen)**", "Tiny smoke removed, Fit shortest axis, 50 epochs", "**73 %**", "**69 %**", "14 %"],
    ["v3", "MobileNetV2 0.35, same data", "66 %", "53 %", "11 %"],
  ], [1400, 3826, 1200, 1300, 1300]),
  gap(),
  P("Per-class results of v2 (top class): smoke recall 0.73 / precision 0.68, fire recall 0.89 / precision 0.81. Most errors are smoke versus normal (thick clouds, haze). These are per-frame numbers on the interim test set; voting and fusion reduce false alarms further, and the final numbers on own camera images will be reported in the model card."),
  P("**Model.** MobileNetV1 with width multiplier 0.25, pre-trained on ImageNet; only the last layer is trained (transfer learning). int8 quantisation shrinks it to about 300 kB. The whole camera firmware uses 41 % of the flash and 20 % of the static RAM; image buffers are in PSRAM."),
);

// 11. Deployment
add(
    H1("11. Deployment & Hardware Integration"),
  image("09-deployment.png", 600, 560),
  caption("Deployment diagram. Two firmware artefacts run on the node: the inference firmware with the embedded model on the ESP32-CAM and the sensor sketch with the FireFusion library on the MKR. They are joined by three wires. UART0 of the camera stays free for flashing and debugging; the laptop is only needed during development."),
  table(["Signal", "ESP32-CAM", "MKR WAN 1300", "Note"], [
    ["Camera TX → MKR RX", "GPIO14 (UART2)", "D3 (SERCOM0 PAD3)", "Free microSD pin, not a strapping pin"],
    ["MKR TX → Camera RX", "GPIO13 (UART2)", "D2 (SERCOM0 PAD2)", "3.3 V both sides, no level shifter"],
    ["Ground", "GND", "GND", "Mandatory common ground"],
    ["Power", "5 V external", "5 V external", "Not from the MKR 5 V pin (camera peaks ~300 mA)"],
  ], [2200, 2000, 2200, 2626]),
  P("Pins D2/D3 are a proposal that must be confirmed with the sensor-firmware owner (D0, D11–D14 and A1–A3 are already in use). A conflict on SERCOM0 would show up as a compile error, so it cannot go unnoticed."),
);

// 12. Security & safety
add(
  H1("12. Security, Privacy and Safety", false),
  table(["Concern", "Measure in the AI design", "Link"], [
    ["Camera images visible on the network", "No images leave the camera; final firmware has Wi-Fi and Bluetooth off; only the collector (development) uses Wi-Fi", "SEC3, SEC8, NFR04"],
    ["Corrupted or injected UART data", "`*XX` checksum on every line; invalid lines rejected; strict parser with fixed maximum line length", "SEC8, SEC4"],
    ["Node hangs while waiting", "15 s timeout, explicit error codes, fail-safe treatment as “camera normal”", "SEC5"],
    ["Secrets in the repository", "`secrets.h` and `.env` (Edge Impulse key, Wi-Fi) in `.gitignore`; only templates committed", "SEC1, R24"],
    ["Silent node", "Heartbeat every 2 h in the same 12-byte format", "SEC7, R17"],
    ["Unsafe tests", "Only small controlled sources outdoors (incense, candle, screens with wildfire video); never a real fire indoors", "R23"],
  ], [2400, 4626, 2000]),
);

// 13. Test plan
add(
    H1("13. Test Plan"),
  table(["Test", "Method", "Expected result", "Req.", "Status"], [
    ["Fusion logic", "53 unit tests on the laptop with a simulated camera and clock", "All decision-table rows, timeout, checksum, payload layout pass", "R11, SEC5, R15", "Done"],
    ["Model accuracy", "`predict_tflite.py` + `confusion_matrix.py` on held-out images", "Accuracy and recall reported per version", "FR02–FR04", "Done (interim)"],
    ["Threshold choice", "`confusion_matrix.py --sweep`", "Recall / false-alarm curve justifies 0.70", "FR05", "Done (interim)"],
    ["Firmware build", "`arduino-cli compile` for both boards", "Builds, fits memory", "NFR01", "Done"],
    ["Live behaviour", "`webcam_demo.py` with the laptop camera", "Same RESULT lines as the device", "FR02–FR05", "Done"],
    ["On-device inference", "`CAPTURE` on the serial monitor", "RESULT within a few seconds; latency recorded", "NFR02", "Open (hardware)"],
    ["Camera–MKR link", "`fusion_demo`, keys p / g / f", "PONG, correct states, LORA payload", "FR01, SEC8", "Open (hardware)"],
    ["Own test set", "Own ESP32-CAM images, never trained on", "Final accuracy and false-alarm rate for the report", "FR02, FR03", "Open"],
    ["False alarms per hour", "Field test logs → `false_alarm_count.py`", "Fewer false alarms with gas + camera than gas only", "R11, R12", "Open"],
    ["Power", "Multimeter in idle and inference", "Values in the current table", "NFR01, R19", "Open"],
  ], [1600, 2400, 2526, 1300, 1200]),
  P("Every test is written down in the test log with date, setup and result (R25)."),
);

// 14. Risks
add(
  H1("14. Risks and Mitigations", false),
  table(["Risk", "Impact", "Mitigation"], [
    ["Domain gap: model trained on better cameras performs worse on the ESP32-CAM", "High", "Collect own images, retrain (v4), test only on own images"],
    ["Smoke far away is too small at 96x96", "Medium", "Gas sensors trigger first; tiny smoke removed from training; documented limitation"],
    ["Thick clouds, fog or steam classified as smoke", "Medium", "Hard negatives in `normal`; voting; fusion needs gas as well"],
    ["Darkness at night", "Medium", "Flame sensor path (UC4) in the fusion rule"],
    ["Inference too slow or too much power", "Medium", "int8, smallest MobileNet, 80 MHz idle; NUM_FRAMES configurable"],
    ["Pin conflict with the sensor firmware", "Low", "Pins marked as proposal; compile-time check on SERCOM0"],
    ["Edge Impulse free-plan limits (training time)", "Low", "Small model; 50 epochs fit; models and library stored in the repository"],
  ], [3800, 1100, 4126]),
);

// 15. Alignment with the other designs
add(
  H1("15. Alignment with the Other Designs", false),
  P("While writing this design, the AI part was checked against the other chapters of the report:"),
  bullet("**Security design (SEC7, SEC8):** the heartbeat interval was changed from 15 minutes to 2 hours and a checksum was added to the camera link, so the implementation now follows the security requirements."),
  bullet("**Website design:** the dashboard wireframe shows a “Live Feed”. The node does not send images (NFR04, SEC8), so this area should show the **AI label, confidence and vote count** of the last capture instead of a video. To be agreed with the website authors."),
  bullet("**Device design and network design:** the 12-byte payload (section 7.2) defines what the back end must decode; the field layout must be agreed with the sensor-firmware and back-end owners."),
);

// Sources
add(
  pageBreak(),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: "Sources", bold: true, size: 32 })] }),
  P("de Venâncio, P. V. A. B., Lisboa, A. C., & Barbosa, A. V. (2022). An automatic fire detection system based on deep convolutional neural networks for low-power, resource-constrained devices. Neural Computing and Applications. D-Fire dataset: https://github.com/gaiasd/DFireDataset", { alignment: AlignmentType.LEFT }),
  P("Howard, A. G., et al. (2017). MobileNets: Efficient Convolutional Neural Networks for Mobile Vision Applications. arXiv:1704.04861.", { alignment: AlignmentType.LEFT }),
  P("Edge Impulse documentation – Transfer learning (images), EON compiler, Arduino library deployment: https://docs.edgeimpulse.com", { alignment: AlignmentType.LEFT }),
  P("Espressif – esp32-camera driver and ESP32 technical reference: https://github.com/espressif/esp32-camera", { alignment: AlignmentType.LEFT }),
  P("Arduino – MKR WAN 1300 documentation and SAMD21 SERCOM “Adding more serial interfaces”: https://docs.arduino.cc", { alignment: AlignmentType.LEFT }),
  P("Fire Detection System group report, Challenge 3 (Device Design, Security Design, Website Design, Network & Cloud Infrastructure Design), Fontys ICT, 2026.", { alignment: AlignmentType.LEFT }),
  P("Project repository with code, model card and PlantUML sources: " + GH, { alignment: AlignmentType.LEFT }),
);

// ---------- document ----------
const doc = new Document({
  creator: "Martim Ferreira Galamba",
  title: "AI Design Document – Fire Detection System",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Arial", size: 34, color: BLUE }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Arial", size: 26, color: BLUE, bold: true }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Arial", size: 23, bold: true }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: { config: [
    { reference: "bullets", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } } ] },
    { reference: "numbers", levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } } ] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [
      new Paragraph({ children: [new TextRun({ text: "ICT Semester 1 | Challenge 3", size: 18, color: "595959" })] }),
      new Paragraph({ children: [new TextRun({ text: "Project Design: Fire Detection System – AI Design", size: 18, color: "595959" })] }) ] }) },
    footers: { default: new Footer({ children: [ new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })] }) ] }) },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("written", OUT); });
