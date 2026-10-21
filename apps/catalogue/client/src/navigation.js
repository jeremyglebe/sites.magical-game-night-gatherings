export const navigation = [
  {
    text: "Start",
    items: [
      {
        text: "Home",
        link: "/",
      },
      {
        text: "All Formats",
        link: "/formats/",
      },
      {
        text: "Using the Rules",
        link: "/rules/",
      },
      {
        text: "Useful Products & Tools",
        link: "/research/useful-products-and-tools",
      },
    ],
  },
  {
    text: "Archenemy",
    link: "/formats/archenemy/",
    collapsed: true,
    items: [
      {
        text: "Choose a Version",
        link: "/formats/archenemy/",
      },
      {
        text: "Standard Archenemy",
        link: "/formats/archenemy/variants/standard",
      },
      {
        text: "Archenemy Commander",
        link: "/formats/archenemy/variants/commander",
      },
      {
        text: "Supervillain Rumble",
        link: "/formats/archenemy/variants/rumble",
      },
      {
        text: "Commander Rumble",
        link: "/formats/archenemy/variants/rumble-commander",
      },
    ],
  },
  {
    text: "Assassin",
    link: "/formats/assassin/",
    collapsed: true,
    items: [
      {
        text: "Choose a Version",
        link: "/formats/assassin/",
      },
      {
        text: "Hitmen",
        link: "/formats/assassin/variants/hitmen",
      },
    ],
  },
  {
    text: "BANG-Like Hidden Roles",
    link: "/formats/bang-like/",
    collapsed: true,
    items: [
      {
        text: "Choose a Version",
        link: "/formats/bang-like/",
      },
      {
        text: "BANG! Magic",
        link: "/formats/bang-like/variants/bang-magic",
      },
      {
        text: "Kingdoms",
        link: "/formats/bang-like/variants/kingdoms",
      },
      {
        text: "Kingdom / BANG EDH",
        link: "/formats/bang-like/variants/kingdom-bang-edh",
      },
      {
        text: "MTG Treachery",
        link: "/formats/bang-like/variants/treachery",
      },
    ],
  },
  {
    text: "Big Deck",
    link: "/formats/big-deck/",
    collapsed: true,
    items: [
      {
        text: "Choose a Version",
        link: "/formats/big-deck/",
      },
      {
        text: "Pile o' Magic",
        link: "/formats/big-deck/pile-o-magic/",
      },
      {
        text: "Pile o' Magic Commander",
        link: "/formats/big-deck/pile-o-magic/commander",
      },
    ],
  },
  {
    text: "Creature Feature",
    link: "/formats/creature-feature/",
    collapsed: true,
    items: [
      {
        text: "Overview",
        link: "/formats/creature-feature/",
      },
      {
        text: "Full Rules",
        link: "/formats/creature-feature/rules",
      },
    ],
  },
  {
    text: "Cube",
    link: "/formats/cube/",
    collapsed: true,
    items: [
      {
        text: "Overview and Cube Types",
        link: "/formats/cube/",
      },
      {
        text: "Booster-Draft Cube",
        link: "/formats/cube/variants/booster-draft",
      },
    ],
  },
  {
    text: "Horde",
    link: "/formats/horde/",
    collapsed: true,
    items: [
      {
        text: "Choose a Version",
        link: "/formats/horde/",
      },
      {
        text: "Classic Zombie Horde",
        link: "/formats/horde/variants/classic",
      },
      {
        text: "Open Source Version",
        link: "/formats/horde/variants/open-source",
      },
      {
        text: "HordeMagic.com",
        link: "/formats/horde/variants/hordemagic",
      },
      {
        text: "Archived Wiki Version",
        link: "/formats/horde/variants/wiki",
      },
      {
        text: "Raid",
        link: "/formats/horde/variants/raid",
      },
    ],
  },
  {
    text: "Jumpstart",
    link: "/formats/jumpstart/",
    collapsed: true,
    items: [
      {
        text: "Overview",
        link: "/formats/jumpstart/",
      },
      {
        text: "Two-Packet Jumpstart",
        link: "/formats/jumpstart/variants/two-packet",
      },
      {
        text: "Build and Label Packets",
        link: "/formats/jumpstart/building-packets",
      },
      {
        text: "Card Storage Calculator",
        link: "/research/card-storage-calculator",
      },
    ],
  },
  {
    text: "Boxed Sets",
    items: [
      {
        text: "All Boxes",
        link: "/boxed-sets/",
      },
      {
        text: "Zombies vs Plants — Draft",
        link: "/boxed-sets/zombies-vs-plants-jumpstart",
      },
      {
        text: "New York Animal Invasion — Draft",
        link: "/boxed-sets/new-york-animal-invasion",
      },
      {
        text: "Feudalism — Draft",
        link: "/boxed-sets/feudalism",
      },
    ],
  },
  {
    text: "Research",
    link: "/research/",
    collapsed: true,
    items: [
      {
        text: "Zombies vs Plants Cards",
        link: "/research/zombies-vs-plants",
      },
      {
        text: "Research Index",
        link: "/research/",
      },
      {
        text: "Card Storage Calculator",
        link: "/research/card-storage-calculator",
      },
      {
        text: "Marvel Sets and Supporting Pools",
        link: "/research/marvel-card-pools",
      },
      {
        text: "Everyday-Life Catalogue",
        link: "/research/everyday-life",
      },
      {
        text: "Everyday Marvel Cards",
        link: "/research/everyday-life/marvel",
      },
      {
        text: "People and Jobs",
        link: "/research/everyday-life/people",
      },
      {
        text: "Pets, Pests, and Wildlife",
        link: "/research/everyday-life/animals",
      },
      {
        text: "Food, Objects, and Transport",
        link: "/research/everyday-life/objects",
      },
      {
        text: "Places and Activities",
        link: "/research/everyday-life/places-and-activities",
      },
      {
        text: "Almost Matches",
        link: "/research/everyday-life/almost-matches",
      },
      {
        text: "Animal Tokens",
        link: "/research/everyday-life/tokens",
      },
    ],
  },
  {
    text: "References",
    items: [
      {
        text: "Sources and Notes",
        link: "/sources/",
      },
      {
        text: "Treachery Card Materials",
        link: "/formats/bang-like/sources/treachery-cards/",
      },
    ],
  },
];
export const href = (base, path) =>
  base +
  (path.endsWith("/") || path.endsWith(".html")
    ? path
    : path + ".html"
  ).replace(/^\//, "");
