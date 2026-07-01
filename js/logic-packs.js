/* ═══════════════════════════════════════════
   Logic Grid — Story Packs
   A theme groups related packs and holds the shared flavor banks that
   drive per-game variation. Each pack provides a self-contained
   scenario: a cast, themed categories (≥5 values each, ordinal last),
   one or more premise framings, base character sketches, and the
   "tell" that identifies the culprit.

   VARIATION
   At generation time the engine picks one premise framing at random and
   draws a distinct "aside" for each cast member from the theme's bank,
   so the prose reads differently every game. Those choices are baked
   into the puzzle (and saved), so they stay stable across re-renders
   and reloads. Asides are character-agnostic by design — they read
   sensibly attached to anyone and never reference a category value, so
   they can't spoil the randomly-assigned solution.

   TEMPLATING — REQUIRED
   Premises and questions must reference the suspects via {cast} and
   {count}/{Count} placeholders, never by literal names or a literal
   count: easy/medium play with a rotating 4-person slice of the cast,
   so hard-coded prose would name someone who isn't in the puzzle.
   (Sketches are per-character and may of course use their own name.)

   WHODUNIT CONTRACT
   Each pack names a culprit by a single { category, value } tell —
   e.g. whoever the Thieves sponsor set the fire. Solving the grid
   matches one cast member to that value, so the grid literally answers
   "who did it." The tell's category MUST sit within the first three
   categories so it is always present, even at Easy (which uses only
   the first three). On a win the verdict names the guilty party.
═══════════════════════════════════════════ */

const LOGIC_THEMES = {
  'high-fantasy': {
    id: 'high-fantasy',
    name: 'High Fantasy',
    icon: '⚔️',
    /* Generic gossip beats — dry, character-agnostic, no category tells.
       One distinct line is appended to each cast member's sketch per game. */
    asides: [
      'Rumor at the tavern is they cheat at dice — cheerfully, and badly.',
      'Has not stopped reading the omens since the moon turned red.',
      'Arrived owing money in at least two kingdoms.',
      'Swears the old prophecy is about them. The prophecy is vague.',
      'Travels with a ferret that nobody has agreed to acknowledge.',
      'Was last seen arguing, at length, with a horse.',
      'Claims to have died once. Will not elaborate.',
      'Keeps a grudge the way other people keep gardens.',
      'Insists the ale here is cursed. Drinks it anyway.',
      'Has a tattoo they refuse to explain and cannot quite cover.',
      'Brought a sword for luck and a second sword for the first sword.',
      'Tells the same heroic story every night with a different ending.',
      'Trusted by animals and almost no one else.',
      'Has strong, unsolicited opinions about everyone else’s footwear.',
      'Sleeps with one eye open and the other on their coin purse.',
      'Pretends not to know the words to the festival songs. Knows them.',
      'Once won a staring contest with a statue, allegedly.',
      'Carries a lucky coin they have lost and "found" four times.',
    ],
  },
};

const LOGIC_PACKS = {

  /* ── HIGH FANTASY: THE GRAND TOURNAMENT ── */
  'high-fantasy:tournament': {
    id:    'high-fantasy:tournament',
    theme: 'high-fantasy',
    name:  'The Grand Tournament',
    icon:  '🏆',

    cast: ['Aldric', 'Seraphine', 'Bramble', 'Vex', 'Lyria'],

    sketches: {
      Aldric:
        'Gruff, going grey at the temples. Has been competing for twenty years and has placed exactly as well as needed and never better. Quotes tournament rules with suspicious precision.',
      Seraphine:
        'Arrived three days early, memorized the venue, and has been quietly studying every other competitor. Seems relaxed. Is categorically not relaxed.',
      Bramble:
        "Listed his occupation on the entry form as \"observer.\" That wasn't an option. He wrote it in. Has been inexplicably helpful to everyone, which is itself suspicious.",
      Vex:
        'Extremely talented. Extremely enthusiastic. Things in his immediate vicinity have a statistically higher chance of catching fire. He is working on this.',
      Lyria:
        "Has already composed a victory anthem for someone at this tournament. Won't say who. The song is finished. She hums it when she thinks no one is listening.",
    },

    /* Ordered: the tell (Sponsor) sits in the first three so it survives
       every difficulty slice; ordinal (Rank) stays last for comparative clues.
       Easy → Weapon, Sponsor, Kingdom · Medium adds Mount · Hard/Expert add Rank. */
    categories: [
      { name: 'Weapon',  values: ['Longbow', 'Greatsword', 'Daggers', 'Staff', 'Warhammer'] },
      { name: 'Sponsor', values: ['The Crown', 'Merchants', 'Templars', 'Thieves', 'Legion'] },
      { name: 'Kingdom', values: ['Thornmere', 'Ashfeld', 'Duskhollow', 'Irongate', 'Seawatch'] },
      { name: 'Mount',   values: ['Destrier', 'Griffin', 'Elk', 'Nightmare', 'Hippogriff'] },
      { name: 'Rank', ordinal: true, values: ['1st', '2nd', '3rd', '4th', '5th'] },
    ],

    /* {count}/{Count} and {cast} are filled in at generation time with the
       ACTUAL suspects — lower difficulties play with a 4-person cast, so
       hard-coding "five" and all five names would accuse an absent suspect. */
    premises: [
      "The Grand Tournament of Thornmere draws champions from across the Five Kingdoms every decade, and this year's field is thin on legends and heavy on personality. The night before the joust, someone torched the stables — and the saboteur was acting on the coin of the Thieves' Guild. {Count} competitors remain under suspicion: {cast}.",
      "Smoke still hangs over Thornmere. The tournament stables burned to the ground in the dark hours before the opening joust, and it was no stray lantern — the arsonist was paid in Thieves' Guild silver. The marshals have confined the {count} remaining champions to the grounds: {cast}. None of them did it, to hear them tell it.",
      "Once a decade the Five Kingdoms send their finest to the Grand Tournament of Thornmere. This year the field has come down to {count} — {cast} — and one of them is on the Thieves' Guild payroll. That one set fire to the stables the night before the joust. The trophy can wait; the marshals want a name first.",
    ],

    /* the tell: whoever the Thieves sponsor set the fire */
    culprit: { category: 'Sponsor', value: 'Thieves' },
    question:
      "One of these {count} fights on the secret coin of the Thieves' Guild — and that's who burned the stables. Work out each champion's weapon and kingdom until their sponsor is pinned down, and the arsonist names themselves. So — who set the fire?",
    verdict: '{name} was riding on Thieves’ coin. The stable arsonist, caught.',
  },

  /* ── HIGH FANTASY: THE FALLEN GUILD ── */
  'high-fantasy:guild': {
    id:    'high-fantasy:guild',
    theme: 'high-fantasy',
    name:  'The Fallen Guild',
    icon:  '🏛️',

    cast: ['Orin', 'Thessaly', 'Greymantle', 'Cinder', 'Wren'],

    sketches: {
      Orin:
        'Notices everything and says nothing. Keeps a running mental list of who was where and when, backed by notebooks going back nine years. Claims this is just a hobby.',
      Thessaly:
        "Light-fingered as a matter of instinct, not malice. Borrowed things constantly and always returned them — until the one time she didn't. She maintains she still will.",
      Greymantle:
        "The oldest member of the group. Strong opinions about proper procedure and stronger opinions about people who don't follow it. Has been writing a formal complaint for three days.",
      Cinder:
        'Came to the guild from the forest and never quite left it behind. Brings plants into the tower. The plants are doing better than most of the members.',
      Wren:
        "Has been at the guild for eleven years and has never once been caught doing anything wrong. Whether that's admirable or suspicious depends entirely on who you ask.",
    },

    /* Ordered: the tell (Relic) sits in the first three; ordinal (Tower Floor) last.
       Easy → Guild Role, Relic, District · Medium adds Familiar · Hard/Expert add Floor. */
    categories: [
      { name: 'Guild Role',  values: ['Wizard', 'Rogue', 'Paladin', 'Druid', 'Monk'] },
      { name: 'Relic',       values: ['Spellbook', 'Lockpick', 'Seal', 'Amulet', 'Wraps'] },
      { name: 'District',    values: ['Arcane', 'Thornside', 'Temple', 'Harbor', 'Crossway'] },
      { name: 'Familiar',    values: ['Raven', 'Cat', 'Toad', 'Fox', 'Owl'] },
      { name: 'Tower Floor', ordinal: true, values: ['1st', '2nd', '3rd', '4th', '5th'] },
    ],

    premises: [
      "The Adventurers' Guild of Ironhaven has a problem: the Vault of Relics was full on Monday night and stood empty by Tuesday morning. There was no forced entry — whoever emptied it walked out carrying the master Lockpick that opens every door in the tower. The Guildmaster has sealed the doors. {Count} members were inside that night: {cast}.",
      "No alarm, no broken lock, no broken window — and yet by Tuesday dawn the Vault of Relics at Ironhaven stood bare. Only the master Lockpick could have opened it so quietly, and only one of the {count} members trapped in the tower was holding it: {cast}. The Guildmaster wants the thief before anyone eats breakfast.",
      "Ironhaven's proudest boast was that its Vault of Relics had never been robbed. That boast lasted until Tuesday morning. The thief left no mark on the door because they didn't need to — they had the master Lockpick. {Count} members had the run of the tower that night: {cast}. One of them is lying.",
    ],

    /* the tell: whoever was carrying the Lockpick robbed the vault */
    culprit: { category: 'Relic', value: 'Lockpick' },
    question:
      "Only the thief left the vault holding the master Lockpick. Pin down each member's guild role and district until you know who carried which relic, and the culprit drops out of the grid. So — who robbed the vault?",
    verdict: '{name} walked out with the Lockpick. The vault thief, unmasked.',
  },

};
