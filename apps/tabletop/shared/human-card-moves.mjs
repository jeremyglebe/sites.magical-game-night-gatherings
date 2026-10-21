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
  if (target.attachTo !== undefined) {
    if (target.zoneId !== 'battlefield' || typeof target.attachTo !== 'string' || !target.attachTo)
      throw Error('Choose a battlefield card to attach to.');
    const battlefield = new Map((zones.battlefield?.cards || []).map(item => [item.id, item]));
    const attachedTo = battlefield.get(target.attachTo);
    if (!attachedTo) throw Error('That attachment target is no longer on the battlefield.');
    if (attachedTo.draft || attachedTo.editable === false || attachedTo.preview_unknown)
      throw Error('Send the pending play before attaching to that card.');
    if (card.kind === 'ability' || attachedTo.kind === 'ability') throw Error('Only cards can be attached.');
    if (card.id === attachedTo.id) throw Error('Cannot attach a card to itself.');
    const seen = new Set([card.id]);
    for (let id = attachedTo.id; id; id = battlefield.get(id)?.attached_to) {
      if (seen.has(id)) throw Error('Attachments cannot form a cycle.');
      seen.add(id);
    }
    if (from.id === 'battlefield' && card.attached_to === attachedTo.id) return [];
    // Attaching to an opponent's card does not transfer control. A card from
    // another visible zone first enters the battlefield in the same draft.
    return [
      ...(from.id === 'battlefield' ? [] : [{
        op: { type: 'move', card: card.id, to: 'battlefield', position: 'bottom' },
        label: `Move ${card.name || 'face-down card'} to the battlefield`,
      }]),
      { op: { type: 'card', card: card.id, set: { attached_to: attachedTo.id } },
        label: `Attach ${card.name || 'face-down card'} to ${attachedTo.name || 'face-down card'}` },
    ];
  }
  if (target.controller && !table.players.some(player => player.id === target.controller)) throw Error('Unknown battlefield controller.');
  if (target.controller && target.zoneId !== 'battlefield') throw Error('Only a battlefield destination can change control.');
  const changeControl = target.controller && card.controller !== target.controller;
  const detach = from.id === 'battlefield' && target.zoneId === 'battlefield' && card.attached_to;
  const reordering = from.id === target.zoneId && (target.zoneId === 'stack' || target.zoneId.endsWith(':library'));
  if (from.id === target.zoneId && !changeControl && !reordering && !detach) return [];
  if (card.kind === 'ability' && target.zoneId !== 'stack') throw Error('Use “Remove stack ability” after resolving or countering this ability.');
  const actions = [];
  if (from.id !== target.zoneId || reordering) {
    const order = target.zoneId === 'stack' || target.zoneId.endsWith(':library') ? ` · ${position}` : '';
    actions.push({ op: { type: 'move', card: card.id, to: target.zoneId, position }, label: `Move ${card.name || 'face-down card'} to ${name}${order}` });
  }
  if (detach) actions.push({ op: { type: 'card', card: card.id, set: { attached_to: null } }, label: `Detach ${card.name || 'face-down card'}` });
  if (changeControl) actions.push({ op: { type: 'card', card: card.id, set: { controller: target.controller } }, label: `${ownerName(target.controller)} controls ${card.name || 'face-down card'}` });
  return actions;
}
