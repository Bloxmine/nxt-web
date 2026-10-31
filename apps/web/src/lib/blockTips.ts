import type { Block } from '@nxt/blocks';

/** Practical tips per block kind, shown in Little Help under the block's description. */
export const BLOCK_TIPS: Partial<Record<Block['kind'], string[]>> = {
  move: [
    'Steering 0 drives straight; 100 or −100 spins on the spot; 50 turns around one wheel.',
    'Use Tools → Distance and turn calculator to find the degrees for a distance or a turn.',
    '"Unlimited" keeps driving while the next blocks run: follow it with a Wait.',
  ],
  motor: [
    'Use Motor for one motor (an arm, a gripper); use Move to drive with two.',
    'Untick Wait to start the motor and carry on with the next block straight away.',
  ],
  sound: [
    'Turn Wait off to keep driving while the sound plays.',
    'Sound files come from the brick: make your own with Tools → Sound recorder.',
  ],
  display: [
    'The screen is 100 × 64 pixels; text lines 1–8 are 8 pixels high.',
    'Draw your own pictures with Tools → Picture editor, or turn a GIF into an animation.',
    'Without a Wait after it, a program that ends right away goes back to the brick menu.',
  ],
  wait: [
    'Waits block only their own beam; a parallel beam keeps running.',
    'Use Tools → Calibrate sensor to set a light or sound threshold from real readings.',
  ],
  loop: [
    'A Loop runs the blocks inside it again and again: forever, a number of times, or until something happens.',
    'Show the counter plug to wire the pass number into other blocks.',
  ],
  switch: [
    'A Switch picks one of two beams, depending on a sensor or a wired value.',
    'Put it inside a Loop to keep checking, for example to follow a line.',
  ],
  stop: ['Stops the whole program, including parallel beams, and turns the motors off.'],
  resetRotation: ['Sets a motor’s rotation counter back to 0, for measuring a new distance.'],
  resetTimer: ['Starts a timer again from 0; read it with a Timer sensor or Wait.'],
  colorLamp: ['Lights the colour sensor’s lamp red, green or blue; off saves battery.'],
  variable: [
    'Variables keep a number, logic value or text while the program runs.',
    'Set them in one place and read them in another, even on another beam.',
  ],
  math: ['Wire numbers into A and B; the result comes out of the hub.'],
  compare: ['Gives a yes/no that a Switch or Loop can use.'],
  logic: ['Combine yes/no values: And, Or, Xor, Not.'],
  range: ['Checks whether a value lies between Low and High (or outside them).'],
  random: ['Gives a whole number between Min and Max each time the block runs.'],
  numberToText: ['Turn a number into text to show it with a Display block.'],
  text: ['Joins up to three pieces of text, for example "Distance: " and a number.'],
  file: ['Files are kept on the brick: read them back later, or see them in Tools → Files.'],
  sendMessage: [
    'Bricks must be paired first (Bluetooth menu on the brick). The master sends on connection 1–3, a slave on 0.',
    'Try two bricks in the simulator: Bluetooth messages → Second brick.',
  ],
  receiveMessage: ['Messages wait in the mailbox (1–10) until read; up to five are kept.'],
  sensor: ['Reads a sensor without waiting; wire the value or the yes/no into other blocks.'],
  myBlock: ['Double-click to open it. Edit a My Block once and every copy changes.'],
};
