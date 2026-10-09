/* ==========================================================================
   PROTOTYPE — three clickable variants of the artifact version toolbar.
   app.js renders the controls, the mock page and the variant details from here;
   the toolbar mock-ups themselves are built in app.js (TOOLBARS) and styled in
   style.css (.tb-a, .tb-b, .tb-c).

   variants[]   { id, letter, name, tagline, rationale, pros[], cons[],
                  f2 (phone coverage), f3 (dark mode), effort, touches }
   page         content of the fake artifact shown inside the device frame
   versions     the version list every variant offers

   Saved data (read with: artifact feedback ref-prototype-variants)
     answer.pick.<person>   { choice, choiceLabel, note, author }   one per reader
     comments.variant-<id>  comment thread per variant
   ========================================================================== */
window.PROTO = {
  meta: {
    title: "Toolbar redesign: three variants",
    intro: "The injected version toolbar covers content on phones (F2) and ignores dark mode (F3). Here are three ways to fix it. Each one is clickable: open the menus, switch versions, collapse it, then try it on a phone and on a dark page.",
    findings: [
      { id: "F2", text: "Toolbar covers content, most of all on phones" },
      { id: "F3", text: "Library and toolbar ignore dark mode" },
    ],
  },
  variants: [
    {
      id: "a", letter: "A", name: "Pill", tagline: "A small pill that expands into a card",
      rationale: "Keep today’s floating position but start small. The pill shows only the version; tapping it opens everything the dock has today. On phones the card opens as a bottom sheet.",
      pros: ["Smallest footprint of the three", "Closest to today, so the least to relearn", "Works the same on every page layout"],
      cons: ["Still floats over a corner of the page", "Copy link takes two taps"],
      f2: "Covers a 40 × 28 px corner instead of two full rows.",
      f3: "Follows the page’s colour scheme, with its own dark token set.",
      effort: "S", touches: "src/notice.ts (dock markup and styles)",
    },
    {
      id: "b", letter: "B", name: "Top bar", tagline: "A slim bar that pushes the page down",
      rationale: "Give the toolbar its own 36 px strip above the page instead of floating over it. Nothing is ever covered; the cost is a little vertical space and a change in how artifacts start.",
      pros: ["Never covers content", "All actions visible on desktop", "Looks like browser chrome, so it reads as “not the artifact”"],
      cons: ["Shifts every page down by 36 px", "Pages with their own sticky header get two bars", "Biggest change from today"],
      f2: "Nothing is covered; on phones the bar keeps one row with a menu.",
      f3: "Matches the page scheme; the strip uses the dark tokens on dark pages.",
      effort: "M", touches: "src/notice.ts, src/serving.ts (injected spacing)",
    },
    {
      id: "c", letter: "C", name: "Edge tab", tagline: "A tab on the edge that slides out a panel",
      rationale: "Park the toolbar as a thin tab on the right edge. Tapping it slides out a panel with versions and actions; on phones the panel rises from the bottom.",
      pros: ["Only a 22 px sliver is visible", "Room for a full version history in the panel"],
      cons: ["Easy to miss for new readers", "Edge swipes can clash with browser gestures"],
      f2: "Covers a 22 × 64 px sliver at mid-height, away from content edges.",
      f3: "Follows the page scheme like A.",
      effort: "M", touches: "src/notice.ts (new panel)",
    },
  ],
  versions: [
    { n: 3, date: "9 Oct, 14:20", message: "Added October numbers", latest: true },
    { n: 2, date: "2 Oct, 09:05", message: "Fixed the quality chart" },
    { n: 1, date: "28 Sep, 16:40", message: "First version" },
  ],
  page: {
    title: "Q3 workshop report",
    eyebrow: "Spokewise Workshop · Q3 2026",
    lead: "Repairs rose 7.8% while comebacks fell. The e-bike bench is up to speed and Saturdays are now the constraint.",
    stats: [["3,953", "Repairs completed"], ["96.0%", "First-time fix"], ["96.1%", "Ready on time"]],
    sections: [
      { h: "Throughput", p: "Weekly repairs climbed from 283 to 329. The dip in week 34 matches the four-day holiday week on every bench." },
      { h: "Quality", p: "The first-time-fix rate rose 0.8 points. Brake rub is still the top comeback reason, mostly on e-bikes with heavy loads." },
      { h: "People", p: "Scheduled hours were met in 11 of 13 weeks. Absence peaked in August; Saturdays ran short-staffed for three weeks." },
      { h: "Next quarter", p: "Cross-train two Saturday mechanics on suspension and e-bike motors, and add a second torque tester to Bench B." },
    ],
  },
};
