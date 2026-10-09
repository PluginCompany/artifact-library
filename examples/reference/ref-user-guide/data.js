/* ==========================================================================
   ref-user-guide: ALL content lives here. app.js only renders it.

   Texts are { en, nl } (or a plain string for English only). A missing language
   falls back to English. Add a language: add it to GUIDE.langs and give strings
   that key; the language buttons appear by themselves.

   roles      who a topic is for; the role filter in the top bar hides the rest.
   areas[]    { id, title, intro, roles, topics[] }
   topic      { id, title, summary, where?, before[]?,
                steps[]?    { text, shot?, pin? }       shot = id in shots.js (capture.py),
                                                        pin = a pin of that shot
                screen?     { shot, points: [[text, pin|null], …] }
                diagram?    "loop" | "saved"            (drawn in app.js)
                compare?    { before: { shot, label }, after: { shot, label } }
                rules[]?    "Good to know"
                inside?     { title, text[] }           "How it works inside"
                faq[]?      [[question, answer], …]
                related[]?  topic ids,  roles? (defaults to the area's) }
   processes[] { id, title, intro, roles, steps: [{ topic?, title, text }] }

   Ids are stable: feedback is saved per topic id (answer.helpful.<topic>.<person>,
   comments.topic.<topic>) and links use #/t/<topic>. Don't rename them casually.
   ========================================================================== */
window.GUIDE = {
  product: "Artifact Library",
  langs: { en: "EN", nl: "NL" },
  roles: {
    reader: { en: "Readers", nl: "Lezers" },
    reviewer: { en: "Reviewers", nl: "Beoordelaars" },
    maintainer: { en: "Maintainers", nl: "Beheerders" },
  },
  order: ["basics", "read", "answer", "follow", "maintain"],

  ui: {
    brand: { en: "Artifact Library user guide", nl: "Handleiding Artifact Library" },
    brandShort: { en: "User guide", nl: "Handleiding" },
    nav: { en: "Contents", nl: "Inhoud" },
    search: { en: "Search the guide", nl: "Zoeken in de handleiding" },
    noResults: { en: "Nothing found for “{q}”. Try a shorter word.", nl: "Niets gevonden voor “{q}”. Probeer een korter woord." },
    home: { en: "Start", nl: "Start" },
    areas: { en: "Areas", nl: "Onderdelen" },
    overview: { en: "All topics", nl: "Alle onderwerpen" },
    topics: { en: "{n} topics", nl: "{n} onderwerpen" },
    steps: { en: "{n} steps", nl: "{n} stappen" },
    readMore: { en: "Details: {title}", nl: "Meer: {title}" },
    where: { en: "Where", nl: "Waar" },
    before: { en: "Before you start", nl: "Voordat je begint" },
    diagram: { en: "Diagram", nl: "Schema" },
    compare: { en: "Compare", nl: "Vergelijken" },
    compareAria: { en: "Drag to compare the two screenshots", nl: "Sleep om de twee schermafbeeldingen te vergelijken" },
    eyebrow: { en: "Artifact Library · User guide", nl: "Artifact Library · Handleiding" },
    title: { en: "User guide", nl: "Handleiding" },
    lead: {
      en: "How to find, read, share and answer the pages that agents and colleagues publish for you. Search for a task, follow a process from start to finish, or open an area.",
      nl: "Hoe je de pagina’s vindt, leest, deelt en beantwoordt die agents en collega’s voor je publiceren. Zoek een taak, volg een proces van begin tot eind, of open een onderdeel.",
    },
    quick: {
      en: ["link", "version", "comment", "approve", "phone", "download", "dark", "live page"],
      nl: ["link", "versie", "reactie", "goedkeuren", "telefoon", "downloaden", "donker", "live pagina"],
    },
    flows: { en: "Processes", nl: "Processen" },
    flowsText: { en: "How the common jobs run from start to finish, step by step.", nl: "Hoe de gewone taken van begin tot eind verlopen, stap voor stap." },
    flowLabel: { en: "Process", nl: "Proces" },
    howTo: { en: "Step by step", nl: "Stap voor stap" },
    screen: { en: "The screen explained", nl: "Het scherm uitgelegd" },
    know: { en: "Good to know", nl: "Goed om te weten" },
    inside: { en: "How it works inside", nl: "Hoe het van binnen werkt" },
    insideOpen: { en: "Show the details", nl: "Toon de details" },
    faq: { en: "If something is unclear", nl: "Als iets niet duidelijk is" },
    related: { en: "Related", nl: "Verwant" },
    prev: { en: "Previous", nl: "Vorige" },
    next: { en: "Next", nl: "Volgende" },
    print: { en: "Print", nl: "Afdrukken" },
    printAll: { en: "Print the whole guide", nl: "De hele handleiding afdrukken" },
    printHint: { en: "In the print dialog you can also save as PDF.", nl: "In het afdrukvenster kun je ook als pdf opslaan." },
    everything: { en: "Everything", nl: "Alles" },
    filterAria: { en: "Show topics for", nl: "Toon onderwerpen voor" },
    full: { en: "Full screen", nl: "Volledig scherm" },
    shotPending: { en: "Screenshot not captured yet (run capture.py).", nl: "Schermafbeelding nog niet gemaakt (voer capture.py uit)." },
    helpfulQ: { en: "Did this answer your question?", nl: "Heb je hiermee je antwoord?" },
    yes: { en: "Yes", nl: "Ja" },
    notQuite: { en: "Not quite", nl: "Niet helemaal" },
    missing: { en: "What was missing or unclear? (optional)", nl: "Wat ontbrak of was onduidelijk? (optioneel)" },
    send: { en: "Send", nl: "Versturen" },
    thanks: { en: "Thanks. The maintainers of this guide can see this.", nl: "Bedankt. De beheerders van deze handleiding zien dit." },
    tally: { en: "{y} of {n} readers found this helpful", nl: "{y} van {n} lezers vonden dit nuttig" },
    ask: { en: "Ask the maintainers about this topic", nl: "Stel de beheerders een vraag over dit onderwerp" },
    askTitle: { en: "Questions", nl: "Vragen" },
    askPlaceholder: { en: "Ask a question or suggest a better step…", nl: "Stel een vraag of stel een betere stap voor…" },
    feedback: { en: "Feedback", nl: "Feedback" },
    /* Diagram labels */
    dLoop: {
      en: [["Agent publishes", "a plan, review or report"], ["You read", "at a stable link"], ["You answer", "on the page"], ["Agent reads back", "artifact feedback"], ["New version", "same link, history kept"]],
      nl: [["Agent publiceert", "plan, review of rapport"], ["Jij leest", "op een vaste link"], ["Jij antwoordt", "op de pagina"], ["Agent leest terug", "artifact feedback"], ["Nieuwe versie", "op dezelfde link"]],
    },
    dLoopKicker: { en: "ONE LOOP, ONE LINK", nl: "EEN RONDE, EEN LINK" },
    dLoopAria: { en: "The loop: an agent publishes, you read and answer, the agent reads back and publishes a new version.", nl: "De ronde: een agent publiceert, jij leest en antwoordt, de agent leest terug en publiceert een nieuwe versie." },
    dSaved: {
      en: ["Versions never change", "Saved beside the artifact", "answers · comments · verdicts", "Every version shows them"],
      nl: ["Versies veranderen nooit", "Opgeslagen naast het artifact", "antwoorden · reacties · oordelen", "Elke versie toont ze"],
    },
    dSavedAria: { en: "Versions 1 to 3 are fixed; answers and comments are saved beside the artifact and shown on every version.", nl: "Versie 1 tot 3 liggen vast; antwoorden en reacties staan naast het artifact en zijn op elke versie te zien." },
  },

  /* ======================================================================== */
  areas: [
    /* ---------------------------------------------------------------- */
    {
      id: "basics",
      title: { en: "Getting started", nl: "Aan de slag" },
      intro: { en: "What artifacts are, where to find them, and how the page knows who you are.", nl: "Wat artifacts zijn, waar je ze vindt en hoe de pagina weet wie je bent." },
      roles: ["reader", "reviewer", "maintainer"],
      topics: [
        {
          id: "basics-what",
          title: { en: "What an artifact is", nl: "Wat een artifact is" },
          summary: {
            en: "An artifact is a web page (or a few) that an agent or a colleague published on this server: a plan, a progress page, a review, a report. It has a stable link and every version is kept.",
            nl: "Een artifact is een webpagina (of een paar) die een agent of collega op deze server heeft gepubliceerd: een plan, een voortgangspagina, een review, een rapport. Hij heeft een vaste link en elke versie blijft bewaard.",
          },
          diagram: "loop",
          rules: [
            { en: "You never need an account. Anyone who can reach the server can read every artifact and answer on it.", nl: "Je hebt nooit een account nodig. Iedereen die de server kan bereiken, kan elk artifact lezen en erop antwoorden." },
            { en: "You cannot change the page itself. You answer and comment; the owner publishes a new version.", nl: "Je kunt de pagina zelf niet wijzigen. Jij antwoordt en reageert; de eigenaar publiceert een nieuwe versie." },
            { en: "Answers you give are saved for everyone: other readers see them and the agent reads them back.", nl: "Je antwoorden worden voor iedereen opgeslagen: andere lezers zien ze en de agent leest ze terug." },
          ],
          faq: [
            [{ en: "Who makes artifacts?", nl: "Wie maakt artifacts?" }, { en: "Mostly coding agents such as Claude Code, Codex and OpenCode, when someone asks them for a plan, a review or a report. People can publish them too.", nl: "Meestal coding agents zoals Claude Code, Codex en OpenCode, als iemand ze om een plan, review of rapport vraagt. Mensen kunnen ze ook publiceren." }],
          ],
          related: ["basics-library", "basics-saved", "follow-agent"],
        },
        {
          id: "basics-library",
          title: { en: "The library", nl: "De bibliotheek" },
          summary: { en: "The server’s home page lists every artifact, newest first, with a preview of its first screen.", nl: "De startpagina van de server toont alle artifacts, nieuwste eerst, met een voorbeeld van het eerste scherm." },
          where: { en: "The server’s address, or Library in the toolbar of any artifact", nl: "Het adres van de server, of Library in de werkbalk van elk artifact" },
          screen: {
            shot: "library",
            points: [
              [{ en: "Search: matches titles, descriptions and slugs. Every word must match.", nl: "Zoeken: zoekt in titels, beschrijvingen en slugs. Elk woord moet voorkomen." }, "search"],
              [{ en: "Sort: recently updated, recently created, or title A–Z.", nl: "Sorteren: laatst bijgewerkt, laatst gemaakt, of titel A–Z." }, "sort"],
              [{ en: "Time filter: any time, or the last 24 hours, 7 or 30 days.", nl: "Periode: altijd, of de laatste 24 uur, 7 of 30 dagen." }, "since"],
              [{ en: "Grid shows previews; List adds the description.", nl: "Raster toont voorbeelden; Lijst voegt de beschrijving toe." }, "views"],
              [{ en: "A card: preview, title, slug, last update and the newest version. Click it to open the artifact.", nl: "Een kaart: voorbeeld, titel, slug, laatste update en de nieuwste versie. Klik om het artifact te openen." }, "card"],
            ],
          },
          rules: [
            { en: "Archived artifacts are not listed. Their links show a page saying the artifact was archived.", nl: "Gearchiveerde artifacts staan niet in de lijst. Hun links tonen een pagina die zegt dat het artifact is gearchiveerd." },
            { en: "The library remembers grid or list for this browser.", nl: "De bibliotheek onthoudt raster of lijst voor deze browser." },
          ],
          related: ["basics-find", "basics-list", "read-toolbar"],
        },
        {
          id: "basics-find",
          title: { en: "Find an artifact", nl: "Een artifact vinden" },
          summary: { en: "Search, sort and filter until you see the page you need.", nl: "Zoek, sorteer en filter tot je de pagina ziet die je zoekt." },
          where: { en: "Library", nl: "Bibliotheek" },
          steps: [
            { text: { en: "Type a few words from the title, description or slug. The list updates while you type.", nl: "Typ een paar woorden uit de titel, beschrijving of slug. De lijst verandert terwijl je typt." }, shot: "library-search", pin: "search" },
            { text: { en: "Still too many? Choose a sort order, for example Title A–Z.", nl: "Nog te veel? Kies een sortering, bijvoorbeeld Title A–Z." }, shot: "library", pin: "sort" },
            { text: { en: "Or limit it in time: Last 24 hours, 7 days or 30 days.", nl: "Of beperk het in de tijd: Last 24 hours, 7 days of 30 days." }, shot: "library", pin: "since" },
            { text: { en: "Click a card. It opens the newest version of that artifact.", nl: "Klik op een kaart. Je opent de nieuwste versie van dat artifact." }, shot: "library", pin: "card" },
          ],
          rules: [
            { en: "Every word has to match, so fewer words find more.", nl: "Elk woord moet voorkomen, dus minder woorden vinden meer." },
            { en: "The search and filters are kept in the address, so you can share a filtered library.", nl: "Zoekopdracht en filters staan in het adres, dus je kunt een gefilterde bibliotheek delen." },
          ],
          faq: [
            [{ en: "I know it exists but cannot find it.", nl: "Ik weet dat hij bestaat, maar ik vind hem niet." }, { en: "Set the time filter to Any time and use one word. If it still does not show, it may be archived: ask whoever published it.", nl: "Zet de periode op Any time en gebruik één woord. Staat hij er nog niet, dan is hij misschien gearchiveerd: vraag het aan wie hem publiceerde." }],
          ],
          related: ["basics-library", "basics-list"],
        },
        {
          id: "basics-list",
          title: { en: "List view and the card menu", nl: "Lijstweergave en het kaartmenu" },
          summary: { en: "The list shows each artifact’s description; the ⋯ on a card copies its link or downloads it without opening it.", nl: "De lijst toont de beschrijving van elk artifact; met ⋯ op een kaart kopieer of download je hem zonder te openen." },
          where: { en: "Library", nl: "Bibliotheek" },
          steps: [
            { text: { en: "Click List. Every artifact gets a row with its description.", nl: "Klik op List. Elk artifact krijgt een regel met de beschrijving." }, shot: "list", pin: "views" },
            { text: { en: "Read the description to see what the artifact is for before you open it.", nl: "Lees de beschrijving om te zien waar het artifact voor is voordat je het opent." }, shot: "list", pin: "desc" },
            { text: { en: "Click ⋯ on a card for its menu.", nl: "Klik op ⋯ op een kaart voor het menu." }, shot: "card-menu", pin: "menu" },
            { text: { en: "Copy latest link copies the stable link; Download latest saves the newest version.", nl: "Copy latest link kopieert de vaste link; Download latest bewaart de nieuwste versie." }, shot: "card-menu", pin: "copy" },
          ],
          related: ["read-share", "read-download"],
        },
        {
          id: "basics-name",
          title: { en: "Tell the page who you are", nl: "Laat de pagina weten wie je bent" },
          summary: { en: "The first time you save something, the page asks for your name, so the agent and others know who said it.", nl: "De eerste keer dat je iets opslaat, vraagt de pagina je naam, zodat de agent en anderen weten wie het zei." },
          where: { en: "Any artifact you can answer on", nl: "Elk artifact waarop je kunt antwoorden" },
          screen: {
            shot: "name",
            points: [
              [{ en: "Type the name you want others to see.", nl: "Typ de naam die anderen moeten zien." }, "input"],
              [{ en: "Continue (or Enter) saves your answer with your name.", nl: "Continue (of Enter) slaat je antwoord op met je naam." }, "go"],
              [{ en: "Skip saves it without a name. The page will not ask again in this browser.", nl: "Skip slaat het op zonder naam. De pagina vraagt het niet opnieuw in deze browser." }, "skip"],
            ],
          },
          rules: [
            { en: "Your name is remembered for every artifact on this server, in this browser.", nl: "Je naam wordt onthouden voor alle artifacts op deze server, in deze browser." },
            { en: "To change it, click your name next to a Comment button.", nl: "Wijzigen? Klik op je naam naast een knop Comment." },
            { en: "There is no login. A name is a label, not a password.", nl: "Er is geen login. Een naam is een label, geen wachtwoord." },
          ],
          related: ["basics-saved", "answer-comment"],
        },
        {
          id: "basics-saved",
          title: { en: "Where your answers are saved", nl: "Waar je antwoorden worden opgeslagen" },
          summary: { en: "What you save is kept on the server beside the artifact, for everyone, and the top bar tells you it worked.", nl: "Wat je opslaat staat op de server naast het artifact, voor iedereen, en de bovenbalk laat zien dat het gelukt is." },
          screen: {
            shot: "saved",
            points: [[{ en: "All changes saved: everything you did is on the server. Saving… while it works; Couldn’t save if it failed.", nl: "All changes saved: alles staat op de server. Saving… terwijl het bezig is; Couldn’t save als het mislukte." }, "status"]],
          },
          diagram: "saved",
          rules: [
            { en: "Saved in this browser only means the page was opened from a file or the server is out of reach. Agents cannot see those answers.", nl: "Saved in this browser only betekent dat de pagina uit een bestand is geopend of dat de server onbereikbaar is. Agents zien die antwoorden niet." },
            { en: "Answers belong to the artifact, not to a version: every version shows the same discussion.", nl: "Antwoorden horen bij het artifact, niet bij een versie: elke versie toont dezelfde discussie." },
          ],
          inside: {
            title: { en: "What is stored", nl: "Wat er wordt opgeslagen" },
            text: [
              { en: "Each answer, comment thread or verdict is a small document next to the artifact, for example answer.dark-mode or comments.finding-F1, with your name and the time.", nl: "Elk antwoord, elke reactiedraad of elk oordeel is een klein document naast het artifact, bijvoorbeeld answer.dark-mode of comments.finding-F1, met je naam en de tijd." },
              { en: "The published files never change. That is why a new version keeps every answer.", nl: "De gepubliceerde bestanden veranderen nooit. Daarom houdt een nieuwe versie alle antwoorden." },
            ],
          },
          related: ["follow-agent", "basics-name"],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: "read",
      title: { en: "Reading and sharing", nl: "Lezen en delen" },
      intro: { en: "One toolbar on every artifact: versions, links, downloads, and how pages look on your screen.", nl: "Eén werkbalk op elk artifact: versies, links, downloads, en hoe pagina’s eruitzien op je scherm." },
      roles: ["reader", "reviewer", "maintainer"],
      topics: [
        {
          id: "read-toolbar",
          title: { en: "The toolbar on every artifact", nl: "De werkbalk op elk artifact" },
          summary: { en: "Every artifact has the same small toolbar in the bottom-right corner. It belongs to the server, not to the page.", nl: "Elk artifact heeft rechtsonder dezelfde kleine werkbalk. Hij hoort bij de server, niet bij de pagina." },
          where: { en: "Bottom right of every artifact", nl: "Rechtsonder op elk artifact" },
          screen: {
            shot: "toolbar",
            points: [
              [{ en: "Library: back to all artifacts.", nl: "Library: terug naar alle artifacts." }, "library"],
              [{ en: "The artifact’s name. Point at it to read its description.", nl: "De naam van het artifact. Wijs hem aan om de beschrijving te lezen." }, "title"],
              [{ en: "The version you are reading. Open the list to switch.", nl: "De versie die je leest. Open de lijst om te wisselen." }, "version"],
              [{ en: "Copy link copies the address you are on.", nl: "Copy link kopieert het adres waar je bent." }, "copy"],
              [{ en: "⋯ opens more: two kinds of links, a download, and Collapse toolbar.", nl: "⋯ opent meer: twee soorten links, een download en Collapse toolbar." }, "more"],
            ],
          },
          related: ["read-versions", "read-share", "read-phone"],
        },
        {
          id: "read-versions",
          title: { en: "Look at an earlier version", nl: "Een eerdere versie bekijken" },
          summary: { en: "Nothing published is overwritten. Every update is a new version you can go back to.", nl: "Niets wat gepubliceerd is wordt overschreven. Elke update is een nieuwe versie waar je naar terug kunt." },
          where: { en: "Toolbar > version list", nl: "Werkbalk > versielijst" },
          steps: [
            { text: { en: "Open the version list in the toolbar. The newest says — Latest; each line shows when it was published and why.", nl: "Open de versielijst in de werkbalk. De nieuwste heet — Latest; elke regel toont wanneer en waarom hij gepubliceerd is." }, shot: "toolbar", pin: "version" },
            { text: { en: "Pick a version. The address changes to …/_versions/2/, a snapshot that never changes.", nl: "Kies een versie. Het adres wordt …/_versions/2/, een momentopname die nooit verandert." } },
            { text: { en: "To go back to the newest, pick the line marked Latest, or click Library and open the card again.", nl: "Terug naar de nieuwste? Kies de regel met Latest, of klik op Library en open de kaart opnieuw." }, shot: "toolbar", pin: "library" },
          ],
          rules: [
            { en: "Comments and answers show on every version, so the discussion keeps its history.", nl: "Reacties en antwoorden staan op elke versie, dus de discussie houdt haar geschiedenis." },
          ],
          related: ["read-new", "read-share"],
        },
        {
          id: "read-new",
          title: { en: "Catch up with a new version", nl: "Bijblijven met een nieuwe versie" },
          summary: { en: "Pages never reload by themselves. When something newer is published, the toolbar tells you.", nl: "Pagina’s laden nooit vanzelf opnieuw. Wordt er iets nieuwers gepubliceerd, dan zegt de werkbalk het." },
          where: { en: "Toolbar", nl: "Werkbalk" },
          screen: {
            shot: "update",
            points: [
              [{ en: "Version 2 available: a newer version was published while you were reading.", nl: "Version 2 available: er is een nieuwere versie gepubliceerd terwijl je las." }, "notice"],
              [{ en: "Open latest takes you there, to the same page and place.", nl: "Open latest brengt je erheen, naar dezelfde pagina en plek." }, "open"],
              [{ en: "Dismiss hides the notice until an even newer version arrives.", nl: "Dismiss verbergt de melding tot er een nog nieuwere versie is." }, "dismiss"],
            ],
          },
          rules: [{ en: "Nothing you typed is lost when you switch: answers and comments are already saved.", nl: "Wat je hebt ingevuld gaat niet verloren als je wisselt: antwoorden en reacties zijn al opgeslagen." }],
          related: ["read-versions", "follow-agent"],
        },
        {
          id: "read-share",
          title: { en: "Share the right link", nl: "De juiste link delen" },
          summary: { en: "One link always shows the newest version; the other always shows exactly what you saw.", nl: "De ene link toont altijd de nieuwste versie; de andere precies wat jij zag." },
          where: { en: "Toolbar > Copy link, or ⋯", nl: "Werkbalk > Copy link, of ⋯" },
          steps: [
            { text: { en: "Copy link copies the address you are on right now.", nl: "Copy link kopieert het adres waar je nu bent." }, shot: "toolbar", pin: "copy" },
            { text: { en: "Copy stable latest link: always the newest version. Use it for “the plan”.", nl: "Copy stable latest link: altijd de nieuwste versie. Gebruik hem voor “het plan”." }, shot: "toolbar-menu", pin: "latest" },
            { text: { en: "Copy snapshot link: exactly this version, forever. Use it for “what I reviewed”.", nl: "Copy snapshot link: precies deze versie, voor altijd. Gebruik hem voor “wat ik heb beoordeeld”." }, shot: "toolbar-menu", pin: "snapshot" },
            { text: { en: "Paste it into a chat, ticket or email. “Link copied.” confirms it.", nl: "Plak hem in een chat, ticket of e-mail. “Link copied.” bevestigt het." } },
          ],
          rules: [{ en: "Anyone who can reach this server can open the link. There are no invitations.", nl: "Iedereen die deze server kan bereiken, kan de link openen. Er zijn geen uitnodigingen." }],
          faq: [
            [{ en: "Which link do I put in a ticket?", nl: "Welke link zet ik in een ticket?" }, { en: "The snapshot link if the ticket is about what you saw; the stable latest link if people should always see the current state.", nl: "De momentopname-link als het ticket gaat over wat jij zag; de vaste nieuwste-link als mensen altijd de actuele stand moeten zien." }],
          ],
          related: ["read-versions", "basics-list"],
        },
        {
          id: "read-download",
          title: { en: "Download a copy", nl: "Een kopie downloaden" },
          summary: { en: "Take a version offline or attach it to a ticket.", nl: "Neem een versie offline mee of voeg hem toe aan een ticket." },
          where: { en: "Toolbar > ⋯, or ⋯ on a library card", nl: "Werkbalk > ⋯, of ⋯ op een kaart in de bibliotheek" },
          steps: [
            { text: { en: "Open ⋯ in the toolbar and choose Download this version.", nl: "Open ⋯ in de werkbalk en kies Download this version." }, shot: "toolbar-menu", pin: "download" },
            { text: { en: "From the library, ⋯ on a card has Download latest.", nl: "In de bibliotheek heeft ⋯ op een kaart Download latest." }, shot: "card-menu", pin: "download" },
            { text: { en: "You get a .tar.gz with every file of that version. Unpack it and open index.html in a browser.", nl: "Je krijgt een .tar.gz met alle bestanden van die versie. Pak hem uit en open index.html in een browser." } },
          ],
          rules: [{ en: "An offline copy cannot send answers to the agent: the page says Saved in this browser only. Answer on the server.", nl: "Een offline kopie kan geen antwoorden naar de agent sturen: de pagina zegt Saved in this browser only. Antwoord op de server." }],
          related: ["basics-saved"],
        },
        {
          id: "read-phone",
          title: { en: "Read on a phone", nl: "Lezen op een telefoon" },
          summary: { en: "Artifacts work on small screens. The toolbar can be tucked away.", nl: "Artifacts werken op kleine schermen. De werkbalk kan worden weggevouwen." },
          steps: [
            { text: { en: "On a phone the toolbar takes two rows at the bottom of the screen.", nl: "Op een telefoon neemt de werkbalk onderaan twee regels in." }, shot: "phone", pin: "toolbar" },
            { text: { en: "Open ⋯ and choose Collapse toolbar.", nl: "Open ⋯ en kies Collapse toolbar." }, shot: "toolbar-menu", pin: "collapse" },
            { text: { en: "It shrinks to a small label. Tap it to bring the toolbar back. The choice is remembered.", nl: "Hij krimpt tot een klein label. Tik erop om de werkbalk terug te halen. De keuze wordt onthouden." }, shot: "toolbar-collapsed", pin: "expand" },
            { text: { en: "Long pages have a ☰ button at the top left with all sections. Wide tables scroll sideways inside their own box.", nl: "Lange pagina’s hebben linksboven een knop ☰ met alle onderdelen. Brede tabellen scrollen zijwaarts in hun eigen kader." } },
          ],
          related: ["read-toolbar", "read-theme"],
        },
        {
          id: "read-theme",
          title: { en: "Light and dark", nl: "Licht en donker" },
          summary: { en: "Pages follow your device’s light or dark setting. One button overrides it.", nl: "Pagina’s volgen de lichte of donkere stand van je apparaat. Eén knop overschrijft dat." },
          where: { en: "Top bar of most artifacts", nl: "Bovenbalk van de meeste artifacts" },
          compare: { before: { shot: "light", label: { en: "Light", nl: "Licht" } }, after: { shot: "dark", label: { en: "Dark", nl: "Donker" } } },
          steps: [
            { text: { en: "Click ◐ in the top bar to cycle system → light → dark.", nl: "Klik op ◐ in de bovenbalk om te wisselen tussen systeem → licht → donker." }, shot: "light", pin: "toggle" },
          ],
          rules: [{ en: "Your choice is remembered for every artifact on this server, in this browser.", nl: "Je keuze wordt onthouden voor alle artifacts op deze server, in deze browser." }],
          related: ["read-phone"],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: "answer",
      title: { en: "Answering and reviewing", nl: "Antwoorden en beoordelen" },
      intro: { en: "Choose, comment and decide right on the page. The agent reads it back without anyone copying text around.", nl: "Kies, reageer en beslis direct op de pagina. De agent leest het terug zonder dat iemand tekst hoeft over te typen." },
      roles: ["reviewer", "reader"],
      topics: [
        {
          id: "answer-questionnaire",
          title: { en: "Answer a questionnaire", nl: "Een vragenlijst beantwoorden" },
          summary: { en: "An agent asks several decisions at once. One click per question is enough; a note is optional.", nl: "Een agent vraagt meerdere beslissingen tegelijk. Eén klik per vraag is genoeg; een notitie is optioneel." },
          where: { en: "Questionnaire artifacts (“Questions before …”)", nl: "Vragenlijst-artifacts (“Questions before …”)" },
          steps: [
            { text: { en: "The counter shows how many questions are answered. Start with question 1, or Accept all defaults if you agree with every recommendation.", nl: "De teller toont hoeveel vragen beantwoord zijn. Begin met vraag 1, of kies Accept all defaults als je het met elke aanbeveling eens bent." }, shot: "q-hero", pin: "ring" },
            { text: { en: "Read the options. Each one lists what speaks for and against it; one is marked Recommended.", nl: "Lees de opties. Bij elke optie staat wat ervoor en ertegen pleit; één heet Recommended." }, shot: "questionnaire", pin: "recommended" },
            { text: { en: "Click an option. It is saved straight away.", nl: "Klik op een optie. Die wordt meteen opgeslagen." }, shot: "questionnaire", pin: "chosen" },
            { text: { en: "Under the options, What I’ll do says what the agent will do with your choice.", nl: "Onder de opties zegt What I’ll do wat de agent met je keuze gaat doen." }, shot: "q-note", pin: "then" },
            { text: { en: "Add a note for the agent if you want something done differently.", nl: "Voeg een notitie voor de agent toe als je iets anders wilt." }, shot: "q-note", pin: "note" },
            { text: { en: "Next question takes you on. Answered by shows who answered and when.", nl: "Next question brengt je verder. Answered by toont wie antwoordde en wanneer." }, shot: "q-note", pin: "next" },
          ],
          rules: [
            { en: "Accept all defaults fills only the questions nobody has answered yet.", nl: "Accept all defaults vult alleen de vragen in die nog niemand beantwoordde." },
            { en: "A questionnaire keeps one answer per question: the last one saved. Explain a different view in the note.", nl: "Een vragenlijst bewaart één antwoord per vraag: het laatst opgeslagene. Leg een ander standpunt uit in de notitie." },
            { en: "Done? Tell the agent “check the artifact”.", nl: "Klaar? Zeg tegen de agent “check the artifact”." },
          ],
          related: ["answer-change", "follow-agent", "basics-name"],
        },
        {
          id: "answer-comment",
          title: { en: "Comment and follow the reply", nl: "Reageren en het antwoord volgen" },
          summary: { en: "Talk about one finding, step or chapter. The agent answers in the same thread.", nl: "Praat over één bevinding, stap of hoofdstuk. De agent antwoordt in dezelfde draad." },
          where: { en: "Discussion on reviews, runbooks, walkthroughs and reports", nl: "Discussion op reviews, runbooks, walkthroughs en rapporten" },
          screen: {
            shot: "comment",
            points: [
              [{ en: "The thread. Replies from an agent are marked Agent and shaded.", nl: "De draad. Antwoorden van een agent heten Agent en zijn gekleurd." }, "thread"],
              [{ en: "Resolve marks a comment as settled; Reopen undoes it.", nl: "Resolve markeert een reactie als afgehandeld; Reopen maakt dat ongedaan." }, "resolve"],
              [{ en: "Type your comment and press Comment, or Ctrl + Enter.", nl: "Typ je reactie en druk op Comment, of Ctrl + Enter." }, "box"],
            ],
          },
          rules: [
            { en: "New replies appear within seconds; you never need to reload.", nl: "Nieuwe antwoorden verschijnen binnen enkele seconden; herladen hoeft nooit." },
            { en: "Comments stay when the agent publishes a new version.", nl: "Reacties blijven staan als de agent een nieuwe versie publiceert." },
          ],
          related: ["answer-review", "follow-agent"],
        },
        {
          id: "answer-review",
          title: { en: "Approve or request changes", nl: "Goedkeuren of wijzigingen vragen" },
          summary: { en: "Reviews end with your decision. The agent waits for it before it continues.", nl: "Reviews eindigen met jouw beslissing. De agent wacht daarop voordat hij verdergaat." },
          where: { en: "Implementation reviews > Your decision", nl: "Implementation reviews > Your decision" },
          steps: [
            { text: { en: "Read the verdict and the findings first.", nl: "Lees eerst het oordeel en de bevindingen." } },
            { text: { en: "Click Approve if the work is good to go.", nl: "Klik op Approve als het werk goed is." }, shot: "verdict", pin: "approve" },
            { text: { en: "Or click Request changes.", nl: "Of klik op Request changes." }, shot: "verdict", pin: "changes" },
            { text: { en: "Write what should change in the note and press Save note.", nl: "Schrijf in de notitie wat er moet veranderen en druk op Save note." }, shot: "verdict", pin: "note" },
          ],
          rules: [{ en: "Your decision is saved with your name and time. Click again to change it.", nl: "Je beslissing wordt opgeslagen met je naam en tijd. Klik opnieuw om hem te wijzigen." }],
          related: ["answer-chapter", "answer-comment"],
        },
        {
          id: "answer-chapter",
          title: { en: "Review a change chapter by chapter", nl: "Een wijziging per hoofdstuk beoordelen" },
          summary: { en: "Code walkthroughs ask your verdict per chapter, with a discussion beside each one.", nl: "Code-walkthroughs vragen je oordeel per hoofdstuk, met een discussie ernaast." },
          where: { en: "Code walkthroughs, at the end of each chapter", nl: "Code-walkthroughs, aan het eind van elk hoofdstuk" },
          screen: {
            shot: "chapter",
            points: [
              [{ en: "Your verdict on this chapter: Approve, Request changes or Question, with a note for the agent.", nl: "Jouw oordeel over dit hoofdstuk: Approve, Request changes of Question, met een notitie voor de agent." }, "verdicts"],
              [{ en: "Discussion about this chapter.", nl: "Discussie over dit hoofdstuk." }, "thread"],
            ],
          },
          related: ["answer-review"],
        },
        {
          id: "answer-change",
          title: { en: "Change or take back an answer", nl: "Een antwoord wijzigen of intrekken" },
          summary: { en: "Every answer can be changed until the agent acts on it; after that, say so in a comment.", nl: "Elk antwoord kun je wijzigen tot de agent ermee aan de slag gaat; daarna zeg je het in een reactie." },
          steps: [
            { text: { en: "Click another option to change your choice.", nl: "Klik een andere optie om je keuze te wijzigen." }, shot: "questionnaire", pin: "options" },
            { text: { en: "Clear answer removes it altogether.", nl: "Clear answer verwijdert het helemaal." }, shot: "q-note", pin: "clear" },
            { text: { en: "Comments cannot be deleted. Resolve them, or add a comment that corrects the first.", nl: "Reacties kun je niet verwijderen. Markeer ze als afgehandeld, of voeg een reactie toe die de eerste corrigeert." }, shot: "comment", pin: "resolve" },
          ],
          rules: [{ en: "An agent reads what is saved when it checks. If it already acted on an old answer, tell it in a comment.", nl: "Een agent leest wat er opgeslagen is op het moment dat hij kijkt. Heeft hij al iets met een oud antwoord gedaan, zeg het dan in een reactie." }],
          related: ["answer-questionnaire", "answer-comment"],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: "follow",
      title: { en: "Following the work", nl: "Het werk volgen" },
      intro: { en: "Live pages, questions an agent asks while it works, and how your answers reach it.", nl: "Live pagina’s, vragen die een agent stelt terwijl hij werkt, en hoe je antwoorden bij hem komen." },
      roles: ["reader", "reviewer", "maintainer"],
      topics: [
        {
          id: "follow-live",
          title: { en: "Follow a live page", nl: "Een live pagina volgen" },
          summary: { en: "Some pages are updated by an agent while it works. They refresh themselves.", nl: "Sommige pagina’s worden bijgewerkt door een agent terwijl hij werkt. Ze vernieuwen zichzelf." },
          where: { en: "Live run logs", nl: "Live run logs" },
          screen: {
            shot: "live",
            points: [
              [{ en: "Live · updated 6 s ago: the agent is still writing to the page. It turns into a warning when updates stop.", nl: "Live · updated 6 s ago: de agent schrijft nog naar de pagina. Het wordt een waarschuwing als de updates stoppen." }, "status"],
              [{ en: "Progress: one segment per step, filled as steps finish.", nl: "Voortgang: één segment per stap, gevuld als stappen klaar zijn." }, "steps"],
            ],
          },
          rules: [{ en: "Live updates are not new versions: the link and the version stay the same while the numbers move.", nl: "Live updates zijn geen nieuwe versies: de link en de versie blijven hetzelfde terwijl de cijfers bewegen." }],
          related: ["follow-blocked", "read-new"],
        },
        {
          id: "follow-blocked",
          title: { en: "When the agent asks you something", nl: "Als de agent je iets vraagt" },
          summary: { en: "An agent that needs a decision asks it on the page and waits. Your click lets it continue.", nl: "Een agent die een beslissing nodig heeft, vraagt het op de pagina en wacht. Jouw klik laat hem verdergaan." },
          steps: [
            { text: { en: "A highlighted question appears at the top of the live page: The agent is waiting for you.", nl: "Bovenaan de live pagina verschijnt een gemarkeerde vraag: The agent is waiting for you." } },
            { text: { en: "Pick an option, add a note if you like, and submit.", nl: "Kies een optie, voeg eventueel een notitie toe en verstuur." } },
            { text: { en: "The page shows Last answer with your name. The agent picks it up the next time it checks, usually within seconds.", nl: "De pagina toont Last answer met je naam. De agent pakt het op als hij weer kijkt, meestal binnen enkele seconden." }, shot: "live", pin: "status" },
          ],
          related: ["follow-live", "follow-agent"],
        },
        {
          id: "follow-agent",
          title: { en: "How the agent reads your answers", nl: "Hoe de agent je antwoorden leest" },
          summary: { en: "Nothing is sent anywhere. The agent reads what you saved on the server when it checks, and answers in the same threads.", nl: "Er wordt niets verstuurd. De agent leest wat je op de server opsloeg wanneer hij kijkt, en antwoordt in dezelfde draden." },
          diagram: "loop",
          steps: [
            { text: { en: "You answer, comment or decide on the page.", nl: "Je antwoordt, reageert of beslist op de pagina." } },
            { text: { en: "Tell the agent “check the artifact” (or it checks by itself while it waits).", nl: "Zeg tegen de agent “check the artifact” (of hij kijkt zelf terwijl hij wacht)." } },
            { text: { en: "It runs artifact feedback <name> and reads everything saved, with names and times.", nl: "Hij draait artifact feedback <naam> en leest alles wat is opgeslagen, met namen en tijden." } },
            { text: { en: "It replies in your thread and publishes a new version at the same link.", nl: "Hij antwoordt in je draad en publiceert een nieuwe versie op dezelfde link." } },
          ],
          inside: {
            title: { en: "What the agent sees", nl: "Wat de agent ziet" },
            text: [
              { en: "artifact feedback prints every answer, comment thread and verdict: who wrote it, when, and the readable label of the option you chose.", nl: "artifact feedback toont elk antwoord, elke reactiedraad en elk oordeel: wie het schreef, wanneer, en het leesbare label van de gekozen optie." },
              { en: "Any agent can read it: Claude Code, Codex, OpenCode, or a colleague’s. They all share one library.", nl: "Elke agent kan het lezen: Claude Code, Codex, OpenCode, of die van een collega. Ze delen allemaal één bibliotheek." },
            ],
          },
          roles: ["reviewer", "maintainer"],
          related: ["basics-saved", "maint-feedback", "read-new"],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: "maintain",
      title: { en: "For maintainers", nl: "Voor beheerders" },
      intro: { en: "Publishing, reading feedback, archiving, and keeping this guide current. Done with the artifact command-line tool.", nl: "Publiceren, feedback lezen, archiveren en deze handleiding actueel houden. Met de artifact command-line tool." },
      roles: ["maintainer"],
      topics: [
        {
          id: "maint-publish",
          title: { en: "Publish or update an artifact", nl: "Een artifact publiceren of bijwerken" },
          summary: { en: "Publish a folder with an index.html; later updates keep the link and add a version.", nl: "Publiceer een map met een index.html; latere updates houden de link en voegen een versie toe." },
          before: [
            { en: "The artifact CLI is installed (see the Artifact CLI page in the library).", nl: "De artifact CLI is geïnstalleerd (zie de pagina Artifact CLI in de bibliotheek)." },
            { en: "If the server has a write token, you have it.", nl: "Als de server een schrijftoken heeft, heb je dat." },
          ],
          steps: [
            { text: { en: "artifact publish ./my-page --slug my-page --title \"…\" --description \"…\"", nl: "artifact publish ./mijn-pagina --slug mijn-pagina --title \"…\" --description \"…\"" } },
            { text: { en: "Share the url it prints. That link always shows the newest version.", nl: "Deel de url die hij toont. Die link toont altijd de nieuwste versie." } },
            { text: { en: "Change the files, then artifact update my-page ./my-page --message \"what changed\".", nl: "Pas de bestanden aan, dan artifact update mijn-pagina ./mijn-pagina --message \"wat er veranderde\"." } },
          ],
          rules: [
            { en: "Start from a reference artifact (artifact download ref-…) instead of a blank page.", nl: "Begin met een referentie-artifact (artifact download ref-…) in plaats van een lege pagina." },
            { en: "Identical content does not create a new version.", nl: "Identieke inhoud maakt geen nieuwe versie." },
          ],
          related: ["maint-feedback", "maint-archive"],
        },
        {
          id: "maint-feedback",
          title: { en: "Read and answer what people saved", nl: "Lezen en beantwoorden wat mensen opsloegen" },
          summary: { en: "One command shows every answer, comment and verdict; another replies in a thread.", nl: "Eén commando toont elk antwoord, elke reactie en elk oordeel; een ander antwoordt in een draad." },
          steps: [
            { text: { en: "artifact feedback <slug> lists everything readers saved, newest first.", nl: "artifact feedback <slug> toont alles wat lezers opsloegen, nieuwste eerst." } },
            { text: { en: "artifact feedback <slug> --since 2h shows only what is new.", nl: "artifact feedback <slug> --since 2h toont alleen wat nieuw is." } },
            { text: { en: "artifact data append <slug> comments.<anchor> --author \"Your name\" --item '{\"text\":\"…\"}' answers in a thread.", nl: "artifact data append <slug> comments.<anker> --author \"Je naam\" --item '{\"text\":\"…\"}' antwoordt in een draad." } },
          ],
          related: ["follow-agent", "maint-publish"],
        },
        {
          id: "maint-archive",
          title: { en: "Archive, restore or remove", nl: "Archiveren, herstellen of verwijderen" },
          summary: { en: "Archive hides an artifact and can be undone; purge deletes it with all versions and comments.", nl: "Archiveren verbergt een artifact en is terug te draaien; purge verwijdert het met alle versies en reacties." },
          steps: [
            { text: { en: "artifact archive <slug> hides it from the library; its links show “archived”.", nl: "artifact archive <slug> verbergt het in de bibliotheek; de links tonen “gearchiveerd”." } },
            { text: { en: "artifact restore <slug> brings it back, with every version and comment.", nl: "artifact restore <slug> haalt het terug, met elke versie en reactie." } },
            { text: { en: "artifact purge <slug> --yes deletes it for good. This cannot be undone.", nl: "artifact purge <slug> --yes verwijdert het definitief. Dit kan niet ongedaan worden gemaakt." } },
          ],
          related: ["maint-publish"],
        },
        {
          id: "maint-guide",
          title: { en: "Keep this guide up to date", nl: "Deze handleiding actueel houden" },
          summary: { en: "All text is in data.js; the screenshots are captured from a real server by capture.py.", nl: "Alle tekst staat in data.js; de schermafbeeldingen komen van een echte server via capture.py." },
          steps: [
            { text: { en: "artifact download ref-user-guide --out ./guide", nl: "artifact download ref-user-guide --out ./guide" } },
            { text: { en: "Edit data.js: topics, steps, the screen explained, good to know, questions. Each text has an English and a Dutch version.", nl: "Pas data.js aan: onderwerpen, stappen, het scherm uitgelegd, goed om te weten, vragen. Elke tekst heeft een Engelse en een Nederlandse versie." } },
            { text: { en: "ORIGIN=https://your-server python3 capture.py retakes every screenshot and its pins.", nl: "ORIGIN=https://jouw-server python3 capture.py maakt alle schermafbeeldingen en pins opnieuw." } },
            { text: { en: "Read the “Not quite” notes and questions with artifact feedback ref-user-guide, then artifact update.", nl: "Lees de “Niet helemaal”-notities en vragen met artifact feedback ref-user-guide, en dan artifact update." } },
          ],
          related: ["maint-feedback"],
        },
      ],
    },
  ],

  /* ======================================================================== */
  processes: [
    {
      id: "first-visit",
      title: { en: "Your first visit", nl: "Je eerste bezoek" },
      intro: { en: "From the library to your first saved answer.", nl: "Van de bibliotheek tot je eerste opgeslagen antwoord." },
      roles: ["reader", "reviewer"],
      steps: [
        { topic: "basics-library", title: { en: "Open the library", nl: "Open de bibliotheek" }, text: { en: "The server’s home page lists every artifact.", nl: "De startpagina van de server toont alle artifacts." } },
        { topic: "basics-find", title: { en: "Find the one you need", nl: "Vind degene die je nodig hebt" }, text: { en: "Search by a word from the title, or sort and filter.", nl: "Zoek op een woord uit de titel, of sorteer en filter." } },
        { topic: "read-toolbar", title: { en: "Get to know the toolbar", nl: "Leer de werkbalk kennen" }, text: { en: "Versions, links and downloads live in the bottom-right corner.", nl: "Versies, links en downloads zitten rechtsonder." } },
        { topic: "basics-name", title: { en: "Tell the page who you are", nl: "Laat weten wie je bent" }, text: { en: "Asked once, remembered for every artifact.", nl: "Eén keer gevraagd, onthouden voor elk artifact." } },
        { topic: "basics-saved", title: { en: "Check that it is saved", nl: "Controleer dat het is opgeslagen" }, text: { en: "All changes saved means the agent can read it.", nl: "All changes saved betekent dat de agent het kan lezen." } },
      ],
    },
    {
      id: "decision-loop",
      title: { en: "From an agent’s question to its next version", nl: "Van de vraag van een agent tot de volgende versie" },
      intro: { en: "How a decision travels: the agent asks on a page, you answer, it reads back and publishes.", nl: "Hoe een beslissing reist: de agent vraagt op een pagina, jij antwoordt, hij leest terug en publiceert." },
      roles: ["reviewer", "reader"],
      steps: [
        { topic: "basics-what", title: { en: "The agent publishes its questions", nl: "De agent publiceert zijn vragen" }, text: { en: "You get a link to a questionnaire.", nl: "Je krijgt een link naar een vragenlijst." } },
        { topic: "answer-questionnaire", title: { en: "You answer, one click per question", nl: "Jij antwoordt, één klik per vraag" }, text: { en: "Add a note where you want something different.", nl: "Voeg een notitie toe waar je iets anders wilt." } },
        { topic: "answer-comment", title: { en: "You ask what is unclear", nl: "Je vraagt wat onduidelijk is" }, text: { en: "A comment on the page, not in a chat.", nl: "Een reactie op de pagina, niet in een chat." } },
        { topic: "follow-agent", title: { en: "The agent reads it back", nl: "De agent leest het terug" }, text: { en: "artifact feedback shows every answer with your name.", nl: "artifact feedback toont elk antwoord met je naam." } },
        { topic: "read-new", title: { en: "A new version appears", nl: "Er verschijnt een nieuwe versie" }, text: { en: "Same link; the toolbar says Version 2 available.", nl: "Zelfde link; de werkbalk zegt Version 2 available." } },
      ],
    },
    {
      id: "review-work",
      title: { en: "Review finished work", nl: "Afgerond werk beoordelen" },
      intro: { en: "From the review link to a recorded decision and a link to what you approved.", nl: "Van de reviewlink tot een vastgelegde beslissing en een link naar wat je goedkeurde." },
      roles: ["reviewer"],
      steps: [
        { topic: "answer-comment", title: { en: "Discuss the findings", nl: "Bespreek de bevindingen" }, text: { en: "Comment on the finding itself, so the reply lands there too.", nl: "Reageer op de bevinding zelf, zodat het antwoord daar ook komt." } },
        { topic: "answer-chapter", title: { en: "Judge each chapter", nl: "Beoordeel elk hoofdstuk" }, text: { en: "Walkthroughs ask per chapter.", nl: "Walkthroughs vragen het per hoofdstuk." } },
        { topic: "answer-review", title: { en: "Record your decision", nl: "Leg je beslissing vast" }, text: { en: "Approve, or request changes with a note.", nl: "Keur goed, of vraag wijzigingen met een notitie." } },
        { topic: "read-share", title: { en: "Link to what you approved", nl: "Link naar wat je goedkeurde" }, text: { en: "The snapshot link always shows that exact version.", nl: "De momentopname-link toont altijd precies die versie." } },
      ],
    },
    {
      id: "follow-task",
      title: { en: "Follow a long agent task", nl: "Een lange taak van een agent volgen" },
      intro: { en: "Keep a page open, answer when the agent is stuck, and catch the result.", nl: "Houd een pagina open, antwoord als de agent vastzit, en zie het resultaat." },
      roles: ["reader", "reviewer"],
      steps: [
        { topic: "follow-live", title: { en: "Open the live page", nl: "Open de live pagina" }, text: { en: "It updates itself while the agent works.", nl: "Hij werkt zichzelf bij terwijl de agent werkt." } },
        { topic: "follow-blocked", title: { en: "Answer when it asks", nl: "Antwoord als hij iets vraagt" }, text: { en: "The question appears at the top; your click lets it continue.", nl: "De vraag verschijnt bovenaan; jouw klik laat hem verdergaan." } },
        { topic: "read-new", title: { en: "Open the result", nl: "Open het resultaat" }, text: { en: "Reports and reviews arrive as new artifacts or versions.", nl: "Rapporten en reviews komen als nieuwe artifacts of versies." } },
      ],
    },
    {
      id: "maintain-loop",
      title: { en: "Run the loop as a maintainer", nl: "De ronde draaien als beheerder" },
      intro: { en: "Publish, read what came back, answer, update, and tidy up.", nl: "Publiceer, lees wat terugkwam, antwoord, werk bij en ruim op." },
      roles: ["maintainer"],
      steps: [
        { topic: "maint-publish", title: { en: "Publish", nl: "Publiceer" }, text: { en: "One command; share the url it prints.", nl: "Eén commando; deel de url die hij toont." } },
        { topic: "maint-feedback", title: { en: "Read and reply", nl: "Lees en antwoord" }, text: { en: "artifact feedback, then answer in the threads.", nl: "artifact feedback, en antwoord in de draden." } },
        { topic: "maint-publish", title: { en: "Update at the same link", nl: "Werk bij op dezelfde link" }, text: { en: "artifact update adds a version; readers get a notice.", nl: "artifact update voegt een versie toe; lezers krijgen een melding." } },
        { topic: "maint-archive", title: { en: "Archive when it is done", nl: "Archiveer als het klaar is" }, text: { en: "Hidden but recoverable, with every comment.", nl: "Verborgen maar terug te halen, met alle reacties." } },
      ],
    },
  ],
};
