function payloadText(payload) {
  return String(payload?.data_simple || payload?.data?.data_simple || payload?.data?.content || payload?.raw_text || "");
}

function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldValue(text, labels) {
  const source = String(text || "").replace(/\r/g, "");
  for (const label of (Array.isArray(labels) ? labels : [labels])) {
    const re = new RegExp("(?:^|[\\n\\t])\\s*" + escaped(label) + "[\\t ]+([^\\t\\n]+)", "i");
    const match = source.match(re);
    if (match) return match[1].trim();
  }
  return null;
}

function numberField(text, labels) {
  const value = fieldValue(text, labels);
  if (value == null) return null;
  const match = value.match(/-?[\d,]+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseThrone(payload) {
  const text = payloadText(payload);
  return {
    province: payload?.prov || payload?.province || null,
    race: fieldValue(text, "Race"),
    land: numberField(text, ["Land", "Acres"]),
    soldiers: numberField(text, "Soldiers"),
    peasants: numberField(text, "Peasants"),
    thieves: numberField(text, "Thieves"),
    wizards: numberField(text, "Wizards"),
    prisoners: numberField(text, "Prisoners"),
    buildingEffectiveness: numberField(text, ["Building Eff.", "Building Effectiveness"]),
    gold: numberField(text, ["Money", "Gold"]),
    food: numberField(text, "Food"),
    runes: numberField(text, "Runes"),
    tradeBalance: numberField(text, "Trade Balance"),
    offense: numberField(text, ["Off. Points", "Offense"]),
    defense: numberField(text, ["Def. Points", "Defense"]),
    networth: numberField(text, ["Networth", "Net Worth"]),
    text
  };
}

function parseBuildings(payload) {
  const text = payloadText(payload);
  const rows = [];
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^([^\t]+)\t+([\d,]+)\t+([\d.]+)%/);
    if (!match) continue;
    const quantity = Number(match[2].replace(/,/g, ""));
    const percent = Number(match[3]);
    if (Number.isFinite(quantity) && Number.isFinite(percent)) {
      rows.push({ name: match[1].trim(), quantity, percent });
    }
  }
  return rows;
}


function parseScience(payload) {
  const text = payloadText(payload);
  const rows = [];
  let category = "unknown";
  for (const line of text.split("\n")) {
    const heading = line.match(/^(Economy|Military|Arcane Arts)\s*-/i);
    if (heading) { category = heading[1].toLowerCase().replace(/ /g, "_"); continue; }
    const match = line.trim().match(/^([A-Za-z][A-Za-z ]*)\t+([\d,]+)\t+\s*(-?[\d.]+)%\s*(.*)$/);
    if (!match) continue;
    const books = Number(match[2].replace(/,/g, ""));
    const effect = Number(match[3]);
    if (Number.isFinite(books) && Number.isFinite(effect)) {
      rows.push({ name: match[1].trim().toLowerCase(), books, effect, description: match[4].trim(), category });
    }
  }
  return rows;
}


function parseBuildingOutputs(payload) {
  const text = payloadText(payload);
  const read = (name, pattern) => {
    const match = text.match(pattern);
    if (!match) return null;
    const value = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  };
  return {
    goldPerDay: read("Banks", /Banks\t+[\d,]+\t+[\d.]+%\t+Produce\s+([\d,]+)\s+gold coins per day/i),
    foodPerDay: read("Farms", /Farms\t+[\d,]+\t+[\d.]+%\t+Produce\s+([\d,]+)\s+bushels per day/i),
    runesPerDay: read("Towers", /Towers\t+[\d,]+\t+[\d.]+%\t+Produce\s+([\d,]+)\s+runes per day/i),
    wizardsPerDay: read("Guilds", /Guilds\t+[\d,]+\t+[\d.]+%\t+([\d,.]+)\s+wizards trained per day/i)
  };
}

module.exports = { payloadText, fieldValue, numberField, parseThrone, parseBuildings, parseScience, parseBuildingOutputs };
