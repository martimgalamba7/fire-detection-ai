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

// ---------- content (short version, max 8 pages) ----------
const body = [];
const add = (...xs) => body.push(...xs);

// Title block, same structure as the Challenge 2 design
add(
  new Paragraph({ children: runs("**Name:** Martim Ferreira Galamba    **Class:** EN01    **Date:** 16 November 2026    **Version:** 0.2") }),
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun("GitHub – code and PlantUML sources: "),
    new ExternalHyperlink({ link: GH, children: [new TextRun({ text: GH, style: "Hyperlink" })] })] }),

  H1("1. Purpose and Scope", false),
  P("The AI part decides whether what the node sees is an early fire. An image classifier on the **ESP32-CAM** labels camera frames as **smoke**, **fire** or **normal**; a decision (fusion) layer on the **Arduino MKR WAN 1300** combines this with the gas and flame sensors into one alarm. Only a label, a confidence and a vote count leave the camera – never the image – so the alarm fits in a 12-byte LoRaWAN message (NFR04, R15, SEC8)."),
  P("**In scope:** on-device classification with confidence (FR02–FR04), sensor-triggered capture (FR01), the alert threshold (FR05), the camera–MKR protocol, the fusion logic, the LoRa payload layout and the ML pipeline. **Out of scope:** reading the sensors and gas thresholds (sensor firmware), LoRaWAN/TTN, back end and website (other chapters)."),

  H2("1.1 Use cases"),
  image("02-use-cases.png", 560, 290),
  caption("Use case diagram. UC1–UC6 run automatically on the node; UC7–UC8 are the development cycle (collect data, train, evaluate and deploy the model with Edge Impulse). UC4 extends UC1 at night, when only the flame sensor sees the fire."),

  H1("2. System Architecture & Topology"),
  link("GitHub Link – PlantUML Code", GH + "/tree/main/docs/design"),
  image("01-system-context.png", 400, 600),
  caption("System context. The MKR WAN 1300 reads the sensors and, only after a gas anomaly, triggers the ESP32-CAM over UART (GPIO13/14 ↔ D2/D3, 115200 baud, 3.3 V). The camera runs a MobileNetV1 int8 model and answers with a text result; the MKR fuses it with the flame sensor and sends a 12-byte payload over LoRaWAN to The Things Network, the back end and the dashboard."),
);

add(
  H1("3. Tech Stack Comparison and Selection"),
  table(["Component Layer", "Options", "Chosen Solution", "Downside of Alternatives"], [
    ["Where inference runs", "ESP32-CAM; server; MKR", "**On the ESP32-CAM**", "LoRa carries bytes, not images (a 5 kB JPEG = hundreds of messages) and sending images breaks SEC8; the MKR has only 32 kB RAM."],
    ["ML platform", "Edge Impulse; Keras + TFLite Micro by hand; Teachable Machine", "**Edge Impulse**", "Hand-made TFLite Micro needs manual quantisation and C++ glue; Teachable Machine has no int8 ESP32 export or versioning."],
    ["Task / model", "Classification (MobileNetV1 0.25, MobileNetV2 0.35); detection (YOLO, FOMO); colour rules", "**Classification, MobileNetV1 0.25, 96x96 RGB, int8**", "MobileNetV2 (tested as v3) drops to 66 % after int8 and is slower; detection needs box labels and memory; colour rules cannot tell smoke from fog."],
    ["Training data", "D-Fire; other public sets; own images only", "**D-Fire subset + own ESP32-CAM images**", "Public data alone has a domain gap (better cameras); own images alone are too few and contain no real wildfires."],
    ["Decision over frames", "Single frame; 2-of-3 voting; moving average", "**2-of-3 voting, threshold 0.70**", "One frame is sensitive to noise and glare; a moving average needs a continuous stream, against FR01 standby."],
    ["Camera ↔ MKR link", "UART; I2C/SPI; Wi-Fi", "**UART with text lines + XX checksum**", "I2C/SPI slave on the ESP32-CAM is awkward and its pins are taken by the camera; Wi-Fi is the largest attack surface (SEC8)."],
  ], [1600, 2200, 1900, 3326], { fontSize: 17 }),
);

add(
  H1("4. Communication Protocols & Data Flow"),
  link("Sequence Diagram – PlantUML Code", GH + "/blob/main/docs/design/05-sequence.puml"),
  image("05-sequence.png", 470, 600),
  caption("Event-driven data flow in four scenarios: (1) gas anomaly confirmed by the camera → immediate alarm; (2) gas anomaly with only fog in view → SUSPECT and re-check after 30 s; (3) a silent camera or a corrupted line never blocks the node (SEC5); (4) heartbeat every 2 h (R17, SEC7)."),
  table(["Direction", "Message (every line ends in *XX = XOR checksum, SEC8)", "Meaning"], [
    ["MKR → CAM", "`CAPTURE*44` / `PING*10`", "Classify 3 frames / link check"],
    ["CAM → MKR", "`READY*4B` / `PONG*16`", "Camera booted / answer to PING"],
    ["CAM → MKR", "`RESULT,smoke,0.87,2/3*XX`", "Label after voting, confidence 0–1, 2 of 3 frames agree"],
    ["CAM → MKR", "`ERROR,<reason>*XX`", "camera_init, capture_failed, decode_failed, inference_failed, bad_checksum, …"],
    ["MKR only", "`timeout` (15 s), `bad_checksum`", "Treated as “camera normal”, so a broken camera never silences the node"],
  ], [1400, 3800, 3826], { fontSize: 17 }),
  P("**LoRa payload (12 bytes):** byte 0 flags (state, camera label, flame, gas, reason) · byte 1 confidence x100 · byte 2 votes k/n · bytes 3–8 MQ-7, MQ-135, CO2 · byte 9 temperature · bytes 10–11 battery mV. Example alarm confirmed by the camera: `6A 57 23 …`. Layout to be confirmed with the sensor and back-end owners."),
);

add(
  H1("5. Decision Logic: Inference and Fusion", false),
  P("**On the camera**, every `CAPTURE` takes 3 QVGA frames. Each frame is centre-cropped to 96x96 (the same “Fit shortest axis” as in training) and classified. A frame is a hazard vote when max(P(fire), P(smoke)) ≥ 0.70; with 2 or more votes the answer is fire or smoke, otherwise normal. All values are in `config.h`."),
  image("06-fusion-state.png", 520, 330),
  caption("Fusion state machine on the MKR. The camera is only asked after a gas anomaly (FR01). Camera confirmation or flame gives an immediate ALARM; otherwise SUSPECT and a re-check after 30 s. An alarm is latched until gas and flame are clear for 60 s."),
  table(["Gas", "Camera", "Flame", "Decision (reason)"], [
    ["No", "not asked", "any", "IDLE"],
    ["Yes", "smoke / fire", "any", "ALARM (CAMERA)"],
    ["Yes", "normal / error", "Yes", "ALARM (FLAME) – covers night"],
    ["Yes", "normal / error", "No", "SUSPECT → re-check after 30 s; gas gone → IDLE (false trigger filtered); gas still there → ALARM (GAS_PERSIST, configurable)"],
  ], [1100, 1700, 1000, 5226], { fontSize: 17 }),
  P("**Design decision.** A gas anomaly that lasts 30 s while the camera sees nothing is probably a fire out of view; missing it costs more than one extra alarm, so it escalates with its own reason code. Setting `escalateOnPersistentGas = false` gives the strict two-source rule of SEC6."),
);

add(
  H1("6. Machine Learning Pipeline & Model"),
  image("08-ml-pipeline.png", 470, 470),
  caption("ML pipeline: D-Fire and own ESP32-CAM photos are cleaned and split on the laptop, trained and quantised in Edge Impulse, evaluated again on the laptop with the device pre-processing, and only then deployed. Each model is versioned."),
  P("**Data.** D-Fire (21,527 images, YOLO boxes) is converted to classes: any fire box → fire, only smoke → smoke, none → normal. Smoke covering < 5 % of the image is removed (too small at 96x96) and near-duplicates are dropped. `normal` also holds hard negatives: fog, steam, vape/shisha clouds, grey clouds, sunsets. The **final test set uses only own camera images**; until they exist, 575 held-out D-Fire images are the interim test set."),
  table(["Version", "Change", "Accuracy", "Hazard recall @0.70", "False alarms @0.70"], [
    ["v1", "MobileNetV1 0.25, all D-Fire, resize mismatch", "58 %", "46 %", "8 %"],
    ["**v2 (chosen)**", "Tiny smoke removed, crop resize, 50 epochs", "**73 %**", "**69 %**", "14 %"],
    ["v3", "MobileNetV2 0.35 (loses accuracy in int8)", "66 %", "53 %", "11 %"],
  ], [1400, 3826, 1200, 1300, 1300], { fontSize: 17 }),
  P("Per-frame results on the interim test set; voting and fusion lower false alarms further. The v2 model is about 300 kB; the camera firmware uses 41 % of flash and 20 % of RAM. Threshold sweep: 0.60 → 77 % recall / 23 % false alarms, 0.70 → 69 % / 13 %, 0.80 → 56 % / 7 %."),
);

add(
  H1("7. Requirements, Tests and Open Points", false),
  table(["Requirement", "Met by", "Verified / status"], [
    ["FR01 sensor-triggered capture", "Fusion sends CAPTURE only after a gas anomaly; camera idles at 80 MHz, radios off", "Unit tests ✔; current (R19) open"],
    ["FR02–FR04 recognise, filter, confidence", "MobileNetV1 int8, normal class with hard negatives, softmax score", "Interim test set ✔; own test set open"],
    ["FR05 threshold", "0.70 per frame + 2-of-3 voting + fusion", "Threshold sweep ✔"],
    ["NFR01/NFR02 energy, speed", "int8 model, 240 MHz only during inference, 15 s timeout", "Latency and current on board open"],
    ["R11/R12, SEC6 two sources, false alarms", "Fusion rule; FUSION log → false_alarm_count.py", "53 unit tests ✔; field test open"],
    ["SEC5, SEC7, SEC8", "Timeout and fail-safe, 2 h heartbeat, checksum and Wi-Fi off", "Unit tests ✔"],
  ], [2700, 3626, 2700], { fontSize: 17 }),
  gap(),
  P("**Alignment with the other designs.** The dashboard wireframe shows a “Live Feed”, but the node sends no images; this area should show the AI label, confidence and votes. The 12-byte payload and the camera pins (D2/D3) still need to be agreed with the sensor-firmware and back-end owners."),
  P("**Sources.** D-Fire dataset, Venâncio et al. (2022), github.com/gaiasd/DFireDataset · Howard et al. (2017), MobileNets, arXiv:1704.04861 · Edge Impulse documentation, docs.edgeimpulse.com · Espressif esp32-camera · Arduino MKR WAN 1300 documentation.", { alignment: AlignmentType.LEFT }),
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
