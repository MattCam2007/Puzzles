/* ═══════════════════════════════════════════
   Logic Grid — Story Packs
   A theme groups related packs. Each pack provides a self-contained
   narrative scenario: a cast, themed categories (≥5 values each,
   ordinal category last), a premise, character sketches, and the
   "tell" that identifies the culprit.

   WHODUNIT CONTRACT
   Each pack names a culprit by a single { category, value } tell —
   e.g. whoever the Thieves sponsor set the fire. Solving the grid
   matches one cast member to that value, so the grid literally answers
   "who did it." The tell's category MUST sit within the first three
   categories so it is always present, even at Easy (which uses only
   the first three). On a win the verdict names the guilty party.

   Sketches describe personality only — never the specific category
   values, so they don't spoil the randomly-assigned solution.
═══════════════════════════════════════════ */

const LOGIC_THEMES = {
  'high-fantasy': { id: 'high-fantasy', name: 'High Fantasy', icon: '⚔️' },
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

    premise:
      "The Grand Tournament of Thornmere draws champions from across the Five Kingdoms every decade. This year's field is thin on legends and heavy on personality: Aldric, whose tournament record is legend (according to Aldric); Seraphine, who has been here three days and already knows more about this tournament than the organizers; Bramble, who definitely has a good reason for being here; Vex, who is not responsible for the stable fire (probably); and Lyria, who has already written the victory song. The night before the joust, someone torched the stables — and the saboteur was acting on the coin of the Thieves' Guild.",

    /* the tell: whoever the Thieves sponsor set the fire */
    culprit: { category: 'Sponsor', value: 'Thieves' },
    question:
      "One of these five fights on the secret coin of the Thieves' Guild — and that's who burned the stables. Work out each champion's weapon and kingdom until their sponsor is pinned down, and the arsonist names themselves. So — who set the fire?",
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

    premise:
      "The Adventurers' Guild of Ironhaven has a problem: the Vault of Relics was full on Monday night and stood empty by Tuesday morning. There was no forced entry — whoever emptied it walked out carrying the master Lockpick that opens every door in the tower. The Guildmaster has locked everyone in until the relics surface. Five members were in the building that night: Orin, Thessaly, Greymantle, Cinder, and Wren, each with a perfectly reasonable explanation for why it wasn't them.",

    /* the tell: whoever was carrying the Lockpick robbed the vault */
    culprit: { category: 'Relic', value: 'Lockpick' },
    question:
      "Only the thief left the vault holding the master Lockpick. Pin down each member's guild role and district until you know who carried which relic, and the culprit drops out of the grid. So — who robbed the vault?",
    verdict: '{name} walked out with the Lockpick. The vault thief, unmasked.',
  },

};
