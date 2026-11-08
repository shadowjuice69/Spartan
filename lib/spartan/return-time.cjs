function destinationKingdomForEvent({ direction, attackerKingdom, defenderKingdom, fallback }) {
  if (direction === 'out') return defenderKingdom || fallback || null;
  if (direction === 'in') return attackerKingdom || null;
  return fallback || null;
}

module.exports = { destinationKingdomForEvent };
