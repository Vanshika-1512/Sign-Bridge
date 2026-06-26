/**
 * asl-hints.js
 * ------------
 * Exact ASL gesture descriptions matching the
 * Gerard Aflague Collection ASL Alphabet chart.
 * Used by practice mode and translator reference grid.
 */

window.ASL_HINTS = {
  A: "Fist — thumb rests on the SIDE of index finger (not over fingers)",
  B: "Four fingers straight up together — thumb folded flat across palm",
  C: "Curve all fingers and thumb into a C shape — like holding a cup",
  D: "Index finger points UP — other fingers curl down to touch thumb tip",
  E: "All fingers hook/bend down toward palm — thumb tucked underneath",
  F: "Index finger and thumb touch to form a circle — other 3 fingers spread up",
  G: "Index finger points SIDEWAYS (horizontal) — thumb parallel below it",
  H: "Index AND middle finger point SIDEWAYS together horizontally",
  I: "ONLY pinky finger points straight UP — all others in a fist",
  J: "Draw letter J in the air with pinky (motion gesture)",
  K: "Index points UP, middle angled out, thumb points up between them",
  L: "Index points UP, thumb points OUT to the side — makes an L shape",
  M: "Fold THREE fingers (index + middle + ring) DOWN over the thumb",
  N: "Fold TWO fingers (index + middle) DOWN over the thumb",
  O: "All fingers and thumb curved to form a round O circle",
  P: "Index and middle fingers point DOWNWARD — thumb points out",
  Q: "Index finger and thumb both point DOWNWARD toward the floor",
  R: "Index and middle fingers crossed/intertwined over each other",
  S: "Fist — thumb crosses OVER the front of all four fingers",
  T: "Fist — thumb pokes UP between index and middle fingers",
  U: "Index AND middle fingers point straight UP close together (side by side)",
  V: "Index AND middle fingers point UP spread apart — peace/victory sign",
  W: "Index + middle + ring all point UP spread apart — three fingers",
  X: "Index finger bent/hooked like a hook shape — not fully extended",
  Y: "Thumb OUT to side + ONLY pinky UP — shaka / hang loose sign",
  Z: "Draw letter Z in the air with index finger (motion gesture)",
};

window.ASL_SIMILAR_GROUPS = [
  {
    title: "Fist variations — look carefully at thumb position",
    letters: ['A','E','M','N','S','T'],
    tips: [
      "A = thumb on SIDE of fist",
      "E = fingers hooked, thumb UNDER fingers",
      "M = THREE fingers over thumb",
      "N = TWO fingers over thumb",
      "S = thumb ACROSS the front",
      "T = thumb BETWEEN index and middle",
    ]
  },
  {
    title: "Two fingers up — look at spread and direction",
    letters: ['U','V','R','K','H'],
    tips: [
      "U = index + middle UP, CLOSE together",
      "V = index + middle UP, SPREAD apart",
      "R = index + middle CROSSED over each other",
      "K = index + middle up, thumb between them",
      "H = index + middle pointing SIDEWAYS",
    ]
  },
  {
    title: "Single finger gestures",
    letters: ['D','G','L','X','I'],
    tips: [
      "D = index UP, others curl to thumb",
      "G = index pointing SIDEWAYS",
      "L = index UP + thumb OUT sideways",
      "X = index HOOKED/bent not straight",
      "I = ONLY pinky up",
    ]
  },
];
