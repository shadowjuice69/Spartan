// Typings for target-ranker.js (shared by the site and the Discord bot).

export type RankTarget = {
  name: string
  kd?: string | null
  acres: number | string | null
  nw: number | string | null
  def?: number | string | null
  defHome?: number | string | null
}

export type RankMode = 'value' | 'gain' | 'soft'

export type RankOptions<T extends RankTarget> = {
  targets: T[]
  you?: { nw?: number | string | null; acres?: number | string | null } | null
  map?: number | string | null
  war?: boolean
  rangeOnly?: boolean
  mode?: RankMode
  kd?: string | null
  limit?: number
}

export type RankedRow<T extends RankTarget> = {
  p: T
  acres: number
  nw: number
  nwpa: number
  def: number | null
  dpa: number | null
  gain: number | null
  capped: boolean
  per10k: number | null
  hardness: number
  vsKd: number
  basis: 'def' | 'nw' | 'none'
  value: number
}

export function estimateGain(yNW: number, yAcres: number, tNW: number, tAcres: number, map: number, war: boolean): { gain: number; capped: boolean }
export function inRange(yNW: number, yAcres: number, tNW: number, tAcres: number): boolean
export function rankTargets<T extends RankTarget>(opts: RankOptions<T>): RankedRow<T>[]
export function gradeValue(value: number): { letter: 'S' | 'A' | 'B' | 'C' | 'D'; emoji: string }
export function median(list: number[]): number | null
export const MIN_SAMPLE: number
