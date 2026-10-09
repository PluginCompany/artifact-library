/* ==========================================================================
   data.js — the ONLY place numbers and narrative live. Every page reads it.
   SAMPLE DATA: an invented bike repair workshop, internally consistent.
   Spokewise Workshop is fictional; any resemblance to a real shop is accidental.

   Vocabulary (keys kept generic so the report is easy to adapt):
     lines      the repair benches (A, B, C) — the report filters by bench
     plan/actual  repairs planned / completed per week
     jobs       bikes checked out per week (a bike usually needs ~2.4 repairs)
     lateJobs   bikes ready after the promised pick-up time
     fpy        first-time-fix rate %: repairs that did not come back within 30 days
     rework     comebacks: bikes returned with a problem from a recent repair
     mechanics  per-mechanic repairs and plan for the quarter

   Rules that keep the report consistent (app.js checks them on load and
   prints a console warning if one breaks):
     - Weekly arrays have one value per entry in `weeks` (13 = W27–W39).
     - categoryByMonth[line][month] sums to that bench's repairs for the
       weeks listed in months[month].
     - rework.byCategory and rework.reasons each sum to total comebacks, where
       weekly comebacks = round(actual × (100 − fpy) / 100).
     - mechanics[line] repairs sum to the bench's quarterly repairs.
     - absenceByReason sums to people.absenceHours.
   Derived figures (totals, KPIs, deltas, comebacks, utilisation) are computed
   in app.js, so changing a weekly number updates every page.
   ========================================================================== */
window.REPORT = {
  meta: {
    department: "Spokewise Workshop",
    title: "Q3 2026 Workshop Report",
    period: "29 Jun – 27 Sep 2026",
    quarter: "Q3 2026",
    published: "2 Oct 2026",
    owner: "Workshop lead",
    source: "Booking system exports, repair tickets and the staff rota",
    sample: true,
  },

  weeks: ["W27", "W28", "W29", "W30", "W31", "W32", "W33", "W34", "W35", "W36", "W37", "W38", "W39"],
  // Weeks are assigned to the month their Monday falls in (majority of days).
  months: {
    Jul: ["W27", "W28", "W29", "W30", "W31"],
    Aug: ["W32", "W33", "W34", "W35"],
    Sep: ["W36", "W37", "W38", "W39"],
  },
  // W34 includes a public holiday: plan and hours are 4 days.
  notes: { W34: "Public holiday, 4-day week" },

  lines: [
    { id: "A", name: "Bench A", mechanics: 4, focus: "Road and gravel bikes" },
    { id: "B", name: "Bench B", mechanics: 4, focus: "City, cargo and kids’ bikes" },
    { id: "C", name: "Bench C", mechanics: 3, focus: "E-bikes (second stand opened this quarter)" },
  ],

  /* ---- Throughput: repairs per week ---- */
  plan: {
    A: [120, 120, 120, 120, 120, 120, 120, 96, 120, 120, 120, 120, 120],
    B: [110, 110, 110, 110, 110, 110, 110, 88, 110, 110, 110, 110, 110],
    C: [70, 70, 70, 70, 85, 85, 85, 68, 85, 85, 85, 85, 85],
  },
  actual: {
    A: [112, 115, 116, 116, 119, 120, 121, 98, 122, 123, 123, 125, 126],
    B: [107, 109, 110, 109, 94, 106, 111, 89, 111, 112, 110, 113, 114],
    C: [64, 67, 69, 71, 80, 83, 85, 69, 86, 87, 84, 88, 89],
  },
  // Bikes checked out per week, and how many were ready after the promised pick-up time.
  jobs: {
    A: [47, 48, 48, 48, 50, 50, 50, 41, 51, 51, 51, 52, 52],
    B: [45, 45, 46, 45, 39, 44, 46, 37, 46, 47, 46, 47, 48],
    C: [27, 28, 29, 30, 33, 35, 35, 29, 36, 36, 35, 37, 37],
  },
  lateJobs: {
    A: [2, 1, 2, 1, 1, 1, 0, 2, 1, 0, 1, 0, 1],
    B: [2, 2, 1, 2, 7, 3, 1, 2, 1, 1, 0, 1, 1],
    C: [3, 3, 2, 2, 2, 1, 1, 2, 1, 1, 6, 2, 1],
  },
  lateRiskOpenAtClose: 7,

  categories: ["Tune-ups", "Brakes", "Wheels", "E-bikes"],
  // [Tune-ups, Brakes (incl. drivetrain), Wheels (incl. tyres), E-bikes] per bench and month
  categoryByMonth: {
    A: { Jul: [231, 173, 145, 29], Aug: [185, 138, 115, 23], Sep: [199, 149, 124, 25] },
    B: { Jul: [185, 159, 159, 26], Aug: [146, 125, 125, 21], Sep: [157, 135, 135, 22] },
    C: { Jul: [35, 70, 53, 193], Aug: [32, 65, 48, 178], Sep: [35, 70, 52, 191] },
  },

  // Mechanics: quarterly repairs and plan
  mechanics: [
    { id: "Robin", line: "A", type: "Road builds", repairs: 415, plan: 399, fpy: 96.9 },
    { id: "Sasha", line: "A", type: "Suspension", repairs: 399, plan: 400, fpy: 97.3 },
    { id: "Theo", line: "A", type: "Wheel building", repairs: 369, plan: 384, fpy: 96.6 },
    { id: "Mira", line: "A", type: "Gravel & touring", repairs: 353, plan: 353, fpy: 97.0 },
    { id: "Jonas", line: "B", type: "City bikes", repairs: 376, plan: 365, fpy: 95.9 },
    { id: "Priya", line: "B", type: "Cargo bikes", repairs: 349, plan: 352, fpy: 95.3 },
    { id: "Leo", line: "B", type: "Brakes", repairs: 349, plan: 367, fpy: 96.0 },
    { id: "Ana", line: "B", type: "Kids & folding", repairs: 321, plan: 324, fpy: 95.5 },
    { id: "Kai", line: "C", type: "Bosch drives", repairs: 368, plan: 356, fpy: 95.6 },
    { id: "Noor", line: "C", type: "Shimano drives", repairs: 307, plan: 308, fpy: 94.4 },
    { id: "Felix", line: "C", type: "Diagnostics", repairs: 347, plan: 364, fpy: 95.4 },
  ],

  /* ---- Quality ---- */
  // First-time-fix rate %: repairs that did not come back within 30 days
  fpy: {
    A: [96.1, 96.4, 96.2, 96.6, 96.8, 96.9, 97.0, 96.7, 97.2, 97.1, 97.3, 97.4, 97.5],
    B: [95.4, 95.6, 95.2, 95.5, 92.6, 95.0, 95.8, 95.9, 96.1, 96.0, 96.3, 96.2, 96.4],
    C: [93.8, 94.2, 94.6, 94.9, 95.1, 95.4, 95.6, 95.3, 95.8, 95.0, 94.1, 95.9, 96.1],
  },
  rework: {
    reasons: [
      { reason: "Brake rub or squeal", count: 43 },
      { reason: "Gears out of adjustment", count: 35 },
      { reason: "Loose bolts or wrong torque", count: 27 },
      { reason: "E-bike error code", count: 22 },
      { reason: "Wheel out of true", count: 19 },
      { reason: "Other", count: 13 },
    ],
    // comebacks per category, same order as `categories`
    byCategory: [32, 55, 24, 48],
  },
  incidents: [
    {
      week: "W31", line: "B", severity: "bad", label: "Incident",
      title: "Torque wrench out of calibration on Bench B",
      body: "A torque wrench that had drifted 15% low left stems and thru-axles under-tightened for two days before a customer came back with a creaking cockpit. Bench B’s first-time-fix rate fell to 92.6% and 7 bikes were ready late while every affected bike was rechecked.",
      impact: "−16 repairs vs plan · 7 late bikes",
      action: "Torque wrenches are now checked against the reference tester every Monday.",
    },
    {
      week: "W33", line: "All", severity: "warn", label: "Near miss",
      title: "Online booking calendar stopped syncing for 2 h 40 min",
      body: "A changed field in the booking form stopped new bookings reaching the workshop board. The front desk entered six drop-offs by hand, so no bench ran out of work.",
      impact: "No repairs lost",
      action: "The board now warns the front desk after 15 minutes without a new booking.",
    },
    {
      week: "W37", line: "C", severity: "bad", label: "Incident",
      title: "Faulty batch of e-bike brake pads",
      body: "Pads from a new supplier glazed on heavy e-bikes and squealed within days. Five bikes came back within a week and Bench C’s first-time-fix rate dropped to 94.1%.",
      impact: "6 late bikes · first-time fix −0.9 pt",
      action: "Returned the batch; e-bike pads now come from the previous supplier only.",
    },
  ],

  /* ---- People & capacity (all benches, hours per week) ---- */
  people: {
    scheduledHours: [418, 418, 418, 418, 418, 418, 418, 334, 418, 418, 418, 418, 418],
    absenceHours: [28, 33, 37, 42, 44, 49, 39, 26, 35, 21, 19, 23, 26],
    // Hours with a bike on the stand (value-adding), from repair tickets
    benchHours: [308, 304, 300, 297, 295, 298, 305, 249, 309, 325, 327, 323, 321],
    absenceByReason: [
      { reason: "Holiday", hours: 220 },
      { reason: "Sick leave", hours: 114 },
      { reason: "Training", hours: 63 },
      { reason: "Other", hours: 25 },
    ],
    shifts: ["Opening", "Closing", "Saturday"],
    // Bench hours ÷ worked hours, % by shift and month
    utilisation: { Jul: [83.0, 79.5, 71.0], Aug: [84.5, 81.0, 73.5], Sep: [85.5, 82.5, 75.0] },
    skills: ["Hydraulic brakes", "Suspension service", "Wheel truing & builds", "E-bike motors", "E-bike diagnostics", "Tubeless setup", "Frame & fork checks", "Final safety check"],
    // Qualified mechanics rostered per shift, same order as `skills`
    coverage: {
      Opening: [4, 3, 3, 2, 2, 4, 3, 5],
      Closing: [3, 2, 2, 2, 2, 3, 2, 4],
      Saturday: [2, 1, 1, 1, 1, 2, 1, 3],
    },
    coverageTarget: 2,
  },

  /* ---- Previous quarter, for deltas ---- */
  previous: {
    label: "Q2",
    repairs: 3667,
    planAttainment: 96.1,
    fpy: 95.2,
    onTime: 93.9,
    utilisation: 78.6,
    lateRiskOpenAtClose: 12,
  },

  /* ---- Narrative: headline and takeaways shown on the summary page ---- */
  narrative: {
    headline: "Repairs up <em>7.8%</em> with fewer comebacks",
    lead: "The workshop completed 3,953 repairs in Q3, 99.5% of plan, and the first-time-fix rate rose to 96.0%. The new e-bike stand on Bench C is fully up to speed. Saturdays are now the constraint.",
    takeaways: [
      {
        title: "The e-bike bench is up to speed",
        body: "Bench C went from 64 to 89 repairs a week and met its raised plan of 85 in six of the nine weeks since the second stand opened in W31. The last four weeks averaged 28% more than the first four.",
        href: "throughput.html",
      },
      {
        title: "Two incidents caused 13 late bikes",
        body: "A torque wrench out of calibration on Bench B (W31) and a faulty batch of e-bike brake pads (W37) account for 13 of the quarter’s 64 late bikes. Both causes are fixed.",
        href: "quality.html",
      },
      {
        title: "Saturdays are the constraint",
        body: "Saturday utilisation runs 11 points below the opening shift, and only one mechanic per Saturday can service suspension, build wheels or diagnose e-bike motors. Cross-train two mechanics in Q4.",
        href: "people.html",
      },
    ],
  },
};
