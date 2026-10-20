// Convert an intentional physical drop into the same reversible queue entries
// used by the other human controls. No rules, reveals, or server writes occur.
export function cardDropActions(table, actor, source, target) {
  const zones = table?.zones || {};
  const destination = zones[target?.zoneId];
  if (!destination) throw Error('Choose an available destination zone.');
  if (!table.players?.some(player => player.id === actor)) throw Error('Enter your human seat first.');
  const position = target.position || (target.zoneId === 'stack' ? 'top' : 'bottom');
  if (!['top', 'bottom'].includes(position)) throw Error('Choose the top or bottom of the zone.');
  const ownerName = id => table.players.find(player => player.id === id)?.name || id;
  const name = target.zoneId === 'battlefield'
    ? target.controller ? `${ownerName(target.controller)}’s battlefield` : 'the battlefield'
    : target.zoneId === 'stack' ? 'the stack'
    : `${destination.owner === actor ? 'your' : destination.owner ? ownerName(destination.owner) + '’s' : 'the'} ${target.zoneId.split(':').at(-1)}`;
  if (source?.drawFrom) {
    if (source.drawFrom !== `${actor}:library` || target.zoneId !== `${actor}:hand`) throw Error('Drag the top of your library to your hand to draw a card.');
    if (!(zones[source.drawFrom]?.count > 0)) throw Error('Your library is empty.');
    return [{ op: { type: 'draw', from: source.drawFrom, to: target.zoneId, count: 1 }, label: 'Draw 1 card into your hand' }];
  }
  let card, from;
  for (const zone of Object.values(zones)) {
    const match = zone.cards?.find(item => item.id === source?.cardId);
    if (match) { card = match; from = zone; break; }
  }
  if (!card) throw Error('That card is no longer available in your view.');
  if (card.draft || card.editable === false || card.preview_unknown) throw Error('Send the pending play before moving that card.');
  if (target.controller && !table.players.some(player => player.id === target.controller)) throw Error('Unknown battlefield controller.');
  if (target.controller && target.zoneId !== 'battlefield') throw Error('Only a battlefield destination can change control.');
  const changeControl = target.controller && card.controller !== target.controller;
  const reordering = from.id === target.zoneId && (target.zoneId === 'stack' || target.zoneId.endsWith(':library'));
  if (from.id === target.zoneId && !changeControl && !reordering) return [];
  if (card.kind === 'ability' && target.zoneId !== 'stack') throw Error('Use “Remove stack ability” after resolving or countering this ability.');
  const actions = [];
  if (from.id !== target.zoneId || reordering) {
    const order = target.zoneId === 'stack' || target.zoneId.endsWith(':library') ? ` · ${position}` : '';
    actions.push({ op: { type: 'move', card: card.id, to: target.zoneId, position }, label: `Move ${card.name || 'face-down card'} to ${name}${order}` });
  }
  if (changeControl) actions.push({ op: { type: 'card', card: card.id, set: { controller: target.controller } }, label: `${ownerName(target.controller)} controls ${card.name || 'face-down card'}` });
  return actions;
}
