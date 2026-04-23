/**
 * Curated tech-answer map.
 *
 * Human-reviewable source of truth. Edit this file when the meta shifts;
 * re-run the catalog sync (or the seedTechAnswers() helper directly) to
 * rebuild the tech_answers table.
 *
 * Priority scale (1 best .. 5 worst):
 *   1 = top answer, cut from the deck only if you have a specific reason
 *   2 = very strong against this matchup
 *   3 = situational / niche
 *   4-5 = reserved for meta_mined / personal entries
 *
 * Card names must match YGOPRODeck canonical names exactly. The seeder
 * resolves names → card.id at sync time; unresolved names are skipped
 * and reported in the SyncResult so typos are visible.
 *
 * Archetype names must match what shows up in `matches.opponent_archetype`
 * (the user's free-text entry) AND/OR `cards.archetype` (YGOPRODeck's own
 * archetype string). Canonical YGOPRODeck names are preferred — the
 * seeded archetype list in seed.ts and the autocomplete feed from the
 * archetypes table use them.
 */
export type TechAnswer = {
  card: string;
  reason: string;
  priority: 1 | 2 | 3 | 4 | 5;
};

export type ArchetypeTech = {
  archetype: string;
  answers: TechAnswer[];
};

export const TECH_ANSWERS: ArchetypeTech[] = [
  {
    archetype: "Snake-Eye",
    answers: [
      { card: "Ash Blossom & Joyous Spring", reason: "Hits Diabellstar search / Original Sinful Spoils — their combo stalls hard without the first card.", priority: 1 },
      { card: "Droll & Lock Bird", reason: "Snake-Eye is search-heavy; Droll shuts down the entire Fire Kings / Diabellstar chain after the first search.", priority: 1 },
      { card: "Dimension Shifter", reason: "Banishes grave; Snake-Eye relies on GY for Flamberge / Oak recursion.", priority: 2 },
      { card: "Ghost Belle & Haunted Mansion", reason: "Stops Flamberge revive and Poplar GY effect.", priority: 2 },
      { card: "Nibiru, the Primal Being", reason: "Snake-Eye routinely passes the 5-summon threshold before ending.", priority: 2 },
      { card: "Lava Golem", reason: "Removes their Apollousa / Promethean Princess without targeting.", priority: 3 },
    ],
  },
  {
    archetype: "Fiendsmith",
    answers: [
      { card: "Ash Blossom & Joyous Spring", reason: "Hits Fiendsmith Engraver searches.", priority: 1 },
      { card: "Dimension Shifter", reason: "Catastrophic for Fiendsmith — Requiem needs grave to loop.", priority: 1 },
      { card: "D.D. Crow", reason: "Banishes Fiendsmith Requiem as it activates in GY.", priority: 2 },
      { card: "Ghost Belle & Haunted Mansion", reason: "Stops Requiem / Engraver GY effects.", priority: 2 },
      { card: "Called by the Grave", reason: "Protect your own handtraps through the Fiendsmith package.", priority: 2 },
    ],
  },
  {
    archetype: "Tenpai Dragon",
    answers: [
      { card: "Evenly Matched", reason: "Going second, wipes their backrow + monsters before Battle Phase.", priority: 1 },
      { card: "Summon Limit", reason: "Breaks the multi-summon OTK sequence in Battle Phase.", priority: 2 },
      { card: "Ghost Ogre & Snow Rabbit", reason: "Hits Fadra / their Pollux / backup continuous traps.", priority: 2 },
      { card: "Droll & Lock Bird", reason: "If they go for Bystial extenders or extra searches, caps the engine.", priority: 3 },
      { card: "Skill Drain", reason: "Turns off Chundra / Paidra effects; their battle phase still threatens but loses key triggers.", priority: 3 },
    ],
  },
  {
    archetype: "Yubel",
    answers: [
      { card: "Ghost Belle & Haunted Mansion", reason: "Yubel chains through GY heavily — Belle blanks Nightmare Throne + Phantom of Yubel.", priority: 1 },
      { card: "Ash Blossom & Joyous Spring", reason: "Hits Spirit of Yubel / Fusion Deployment searches.", priority: 2 },
      { card: "Droll & Lock Bird", reason: "Fusion Deployment / Nightmare Pain chains searches; Droll caps them.", priority: 2 },
      { card: "Dimension Shifter", reason: "Banishes their recursion engine.", priority: 2 },
      { card: "Imperial Order", reason: "Shuts off Super Poly / Fusion Deployment.", priority: 3 },
    ],
  },
  {
    archetype: "Ryzeal",
    answers: [
      { card: "Ash Blossom & Joyous Spring", reason: "Hits the fire / special-summon-from-deck lines.", priority: 1 },
      { card: "Droll & Lock Bird", reason: "Ryzeal searches a lot; Droll caps them after the first grab.", priority: 2 },
      { card: "Nibiru, the Primal Being", reason: "Easy 5-summon window before their Xyz climb.", priority: 2 },
      { card: "Ghost Ogre & Snow Rabbit", reason: "Hits their Xyz material / field spell.", priority: 2 },
    ],
  },
  {
    archetype: "Maliss",
    answers: [
      { card: "Droll & Lock Bird", reason: "Maliss searches aggressively through the trap engine — Droll is backbreaking.", priority: 1 },
      { card: "Ash Blossom & Joyous Spring", reason: "First-search denial.", priority: 1 },
      { card: "Mulcharmy Fuwalos", reason: "Hand trap that punishes their search-chain from turn 1.", priority: 1 },
      { card: "Imperial Order", reason: "Locks their trap engine down.", priority: 2 },
    ],
  },
  {
    archetype: "Voiceless Voice",
    answers: [
      { card: "Forbidden Droplet", reason: "Breaks their multi-negate Skull Guardian / Lo stack.", priority: 1 },
      { card: "Ash Blossom & Joyous Spring", reason: "Hits Saffira search and Divine Temple add.", priority: 2 },
      { card: "Ghost Ogre & Snow Rabbit", reason: "Pops Divine Temple of the Snake-Eyes / their field spell.", priority: 2 },
      { card: "Droll & Lock Bird", reason: "Caps the ritual-setup search sequence.", priority: 3 },
    ],
  },
  {
    archetype: "Labrynth",
    answers: [
      { card: "Harpie's Feather Duster", reason: "Backrow wipe — Labrynth lives and dies by backrow.", priority: 1 },
      { card: "Lightning Storm", reason: "Going first or second, clears their Welcome / Big Welcome resolvers.", priority: 1 },
      { card: "Evenly Matched", reason: "End-of-Battle-Phase going second; shreds their board + backrow.", priority: 1 },
      { card: "Twin Twisters", reason: "Flexible 2-card pop during main phase.", priority: 3 },
      { card: "Cosmic Cyclone", reason: "Banishes field spells / traps without triggering GY effects.", priority: 3 },
    ],
  },
  {
    archetype: "Kashtira",
    answers: [
      { card: "Ash Blossom & Joyous Spring", reason: "Hits Fenrir / Riseheart / Big Bang search.", priority: 1 },
      { card: "Forbidden Droplet", reason: "Handles Arise-Heart's negation + banish lock.", priority: 2 },
      { card: "Ghost Ogre & Snow Rabbit", reason: "Pops Kashtira Birth / Pharaoh.", priority: 2 },
      { card: "Nibiru, the Primal Being", reason: "If they push for Arise-Heart on turn 1.", priority: 3 },
    ],
  },
  {
    archetype: "Blue-Eyes",
    answers: [
      { card: "Ash Blossom & Joyous Spring", reason: "Hits Maiden / Manifestation / Tri search effects.", priority: 1 },
      { card: "Nibiru, the Primal Being", reason: "Their board climb passes 5 summons regularly.", priority: 2 },
      { card: "Droll & Lock Bird", reason: "Chokes the multi-search engine.", priority: 2 },
      { card: "Forbidden Droplet", reason: "Breaks through Spirit Dragon / Cyber Dragon Infinity negates.", priority: 2 },
    ],
  },
  {
    archetype: "Branded",
    answers: [
      { card: "Dimension Shifter", reason: "Branded needs GY for Albion / Fallen of Albaz loops — Shifter is backbreaking.", priority: 1 },
      { card: "Ash Blossom & Joyous Spring", reason: "Hits Branded Fusion / Branded in High Spirits.", priority: 1 },
      { card: "D.D. Crow", reason: "Banishes Albion / Guardian Chimera as they activate in GY.", priority: 2 },
      { card: "Ghost Belle & Haunted Mansion", reason: "Cancels GY triggers from Mirrorjade / Fallen of Albaz.", priority: 2 },
    ],
  },
  {
    archetype: "White Forest",
    answers: [
      { card: "Ash Blossom & Joyous Spring", reason: "Hits the deck-search on Story-of- spells.", priority: 1 },
      { card: "Droll & Lock Bird", reason: "Caps their search chain.", priority: 2 },
      { card: "Imperial Order", reason: "Shuts off their spell-heavy payoff.", priority: 2 },
      { card: "Effect Veiler", reason: "Single-target negate on the key synchro monster.", priority: 3 },
    ],
  },
  {
    archetype: "Mulcharmy",
    answers: [
      { card: "Droll & Lock Bird", reason: "The Mulcharmy package draws heavily — Droll locks off the payoff.", priority: 1 },
      { card: "Ash Blossom & Joyous Spring", reason: "Negates the initial activation.", priority: 2 },
    ],
  },
  {
    archetype: "Sky Striker",
    answers: [
      { card: "Droll & Lock Bird", reason: "Engage into Widow Anchor / Hornet Drones — chokes the whole engine.", priority: 1 },
      { card: "Harpie's Feather Duster", reason: "Clears Sky Striker spells off the field.", priority: 2 },
      { card: "Ash Blossom & Joyous Spring", reason: "Hits Engage search.", priority: 2 },
      { card: "There Can Be Only One", reason: "Sky Striker runs many off-attribute monsters; caps their board.", priority: 3 },
    ],
  },
  {
    archetype: "Stun",
    answers: [
      { card: "Harpie's Feather Duster", reason: "Pure backrow wipe — stun's whole plan is floodgates.", priority: 1 },
      { card: "Lightning Storm", reason: "Backrow or attack-position wipe going second.", priority: 1 },
      { card: "Cosmic Cyclone", reason: "Banishes floodgate continuous spells without trigger.", priority: 2 },
      { card: "Forbidden Droplet", reason: "Disables their floodgate monsters going second.", priority: 2 },
    ],
  },
];
