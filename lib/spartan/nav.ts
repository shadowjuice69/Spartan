// The one place the Spartan sidebar menu is defined. Add, rename or remove a page here and every page follows.
export type NavItem = [label: string, href: string]

export const NAV_COMMAND: NavItem[] = [
  ['Command', '/'],
  ['System Health', '/command/system-health'],
  ['Data Coverage', '/command/data-coverage'],
  ['Province', '/command/province'],
  ['Throne', '/command/throne'],
  ['Kingdom', '/command/kingdom'],
  ['War Room', '/command/war-room'],
  ['Best Gains', '/command/best-gains'],
  ['Front Line', '/command/front-line'],
  ['Return Tracker', '/command/returns'],
  ['Build Lab', '/command/build-lab'],
  ['Draft Calc', '/command/draft-calc'],
  ['Calcs', '/command/calcs'],
  ['Wiki', '/command/wiki'],
  ['Tools', '/command/tools'],
  ['Scraper Generator', '/command/scraper'],
]

export const NAV_INTEL: NavItem[] = [
  ['Intel', '/command/intel'],
  ['Intel Backlog', '/command/intel-backlog'],
  ['Military', '/command/military'],
  ['Magic', '/command/magic'],
  ['Thievery', '/command/thievery'],
  ['Science', '/command/science'],
  ['Buildings', '/command/buildings'],
  ['News', '/command/news'],
  ['Exploration', '/command/exploration'],
  ['Enemy Intel', '/command/enemy-intel'],
]
