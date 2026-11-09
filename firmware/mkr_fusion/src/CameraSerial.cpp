#include "CameraSerial.h"
#include "wiring_private.h"   // pinPeripheral()

// Uart(sercom, rxPin, txPin, rxPad, txPad)
Uart CameraSerial(&sercom0, CAMERA_RX_PIN, CAMERA_TX_PIN, SERCOM_RX_PAD_3, UART_TX_PAD_2);

void cameraSerialBegin(unsigned long baud) {
  CameraSerial.begin(baud);
  // Route the pins to SERCOM0 (must be done after begin()).
  pinPeripheral(CAMERA_TX_PIN, PIO_SERCOM);
  pinPeripheral(CAMERA_RX_PIN, PIO_SERCOM);
}

// Interrupt handler: passes received bytes to the Uart object.
void SERCOM0_Handler() {
  CameraSerial.IrqHandler();
}
