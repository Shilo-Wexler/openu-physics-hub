/** The console's sections: one list for the bottom bar, the desktop header and the routes.
    Every admin level sees every section; what a level may not do is left out inside the screens. */

export type SectionId = "inquiries" | "chat" | "announcements" | "stats" | "more";

export interface Section {
  id: SectionId;
  label: string;
  /** The section's root path. Screens inside it (/inquiries/12) keep it highlighted. */
  path: string;
  /** SVG path data on a 24x24 grid, drawn as a stroke. */
  icon: string[];
}

export const SECTIONS: Section[] = [
  {
    id: "inquiries",
    label: "פניות",
    path: "/inquiries",
    icon: [
      "M22 12h-6l-2 3h-4l-2-3H2",
      "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
    ],
  },
  {
    id: "chat",
    label: "צ'אט",
    path: "/chat",
    icon: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  },
  {
    id: "announcements",
    label: "הכרזות",
    path: "/announcements",
    icon: ["m3 11 18-5v12L3 14v-3z", "M11.6 16.8a3 3 0 1 1-5.8-1.6"],
  },
  {
    id: "stats",
    label: "נתונים",
    path: "/stats",
    icon: ["M3 3v18h18", "M18 17V9", "M13 17V5", "M8 17v-3"],
  },
  {
    id: "more",
    label: "עוד",
    path: "/more",
    icon: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0", "M8 12h.01", "M12 12h.01", "M16 12h.01"],
  },
];