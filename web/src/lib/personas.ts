/** "Who are you?" quick-starts: starter questions for each kind of person, Nigeria and Africa first. */
export interface Persona {
  id: string;
  label: string;
  why: string;
  questions: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: "farmer",
    label: "Farmer",
    why: "Rain, heat and plant growth where you farm, compared with decades of NASA records.",
    questions: [
      "Is it getting drier where I farm, near Abuja?",
      "Is the rainy season in Kano getting wetter or drier?",
      "Was this month hotter than normal in Kaduna?",
    ],
  },
  {
    id: "student",
    label: "Student",
    why: "Real NASA data, explained simply, with the evidence for every answer.",
    questions: ["Is Lake Chad region losing water?", "Is Nigeria getting hotter?", "Is Greenland losing ice?"],
  },
  {
    id: "researcher",
    label: "Researcher",
    why: "Tested trends with 95 % ranges, sources, and data you can download and re-check.",
    questions: [
      "Where in West Africa is plant greenness proven to be falling?",
      "Is water stored in the land falling in northern Nigeria?",
      "Where is rainfall trending in opposite directions in Africa?",
    ],
  },
  {
    id: "journalist",
    label: "Journalist",
    why: "Check a claim before you publish it: what's proven, what's only observed, what's uncertain.",
    questions: [
      "Is Lagos really losing its green spaces?",
      "What changed on the ground around Abuja since 2018?",
      "Are there active fires in Nigeria right now?",
    ],
  },
  {
    id: "policymaker",
    label: "Policymaker",
    why: "Evidence by place: which changes are real and how big they are.",
    questions: [
      "Which parts of northern Nigeria are proven to be warming?",
      "Is Maiduguri getting drier?",
      "What changed around Lagos since 2018, and is it real?",
    ],
  },
];

export const STARTERS = [
  "Is it getting drier where I farm, near Abuja?",
  "Is Lagos really losing its green spaces?",
  "Is it getting hotter in Kano?",
];
