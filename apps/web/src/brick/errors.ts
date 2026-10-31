import { NxtStatusError } from '@nxt/protocol';
import { TransportClosedError, TransportTimeoutError } from '@nxt/transport';

/**
 * Turns connection errors into short, friendly messages.
 * Returns an empty string when the user simply cancelled a picker.
 */
export function friendlyError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotFoundError':
        return error.message.includes('No device selected') ||
          error.message.includes('No port selected')
          ? ''
          : 'No brick found. Check the cable and that the brick is switched on.';
      case 'SecurityError':
      case 'NotAllowedError':
        return 'Permission denied. On Linux, install the USB permission rule (Help → Linux USB setup), then unplug and replug the brick.';
      case 'NetworkError':
      case 'InvalidStateError':
        return 'The brick is busy. Close other programs that use it (such as other browser tabs), then try again.';
      case 'AbortError':
        return '';
      default:
        return error.message;
    }
  }
  if (error instanceof TransportTimeoutError) return 'The brick did not answer. Is it switched on?';
  if (error instanceof TransportClosedError) return 'The brick is disconnected.';
  if (error instanceof NxtStatusError) return `The brick reported an error: ${error.message}.`;
  if (error instanceof Error) return error.message;
  return String(error);
}
