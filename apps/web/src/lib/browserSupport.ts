/** The browser features NXT Web Studio relies on. */
export interface BrowserSupport {
  /** WebUSB, the primary way to talk to the brick. */
  usb: boolean;
  /** Web Serial, used for Bluetooth (OS-paired serial port). */
  serial: boolean;
}

/**
 * Checks which brick connection APIs the browser exposes.
 * Takes the navigator as an argument so it can be tested without a browser.
 */
export function checkBrowserSupport(nav: object | undefined): BrowserSupport {
  return {
    usb: nav !== undefined && 'usb' in nav,
    serial: nav !== undefined && 'serial' in nav,
  };
}
