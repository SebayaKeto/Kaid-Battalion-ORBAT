// The sections linked from the landing page, in order.
// To add one, add an entry here. The grid makes room on its own.
//   status "live": the button opens `href`
//   status "soon": the card shows IN DEVELOPMENT and a locked COMING SOON button
export const PORTAL_LINKS = [
  {
    key: "orbat",
    terminal: "TERMINAL 01 · PERSONNEL",
    title: "ORBAT",
    status: "live",
    href: "#orbat",
    cta: "OPEN THE ORBAT",
    blurb: "The 41st's order of battle. See who holds which billet in every platoon and squad, and track attendance points, qualifications, awards and assets.",
    inside: [
      ["ORBAT", "Platoons, squads, billets"],
      ["TROOPERS", "Service records & awards"],
      ["POINTS", "Weekly attendance"],
      ["ASSETS", "Gained & lost per platoon"],
    ],
    foot: "OPEN TO ALL · STAFF SIGN IN FOR TOOLS",
  },
  {
    key: "codex",
    terminal: "TERMINAL 02 · ARCHIVES",
    title: "CODEX",
    status: "live",
    href: "#codex",
    cta: "OPEN THE CODEX",
    blurb: "The unit's regulations and reference. Points, ranks, quals, billet kit and uniform rules, word for word from the Codex, and searchable.",
    inside: [
      ["POINTS", "Milestones & what counts"],
      ["RANKS", "Insignia & requirements"],
      ["ARMOURY", "Billet kits & rules"],
      ["UNIFORMS", "Custom armour rules"],
    ],
    foot: "OPEN TO ALL · NO SIGN IN NEEDED",
  },
];
