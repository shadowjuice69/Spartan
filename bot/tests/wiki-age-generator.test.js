const test = require('node:test');
const assert = require('node:assert/strict');
const { applyAgeToWiki, buildAgePage, wikiStatusLine } = require('../services/wikiAgeGenerator');
const BASE = `<html><body>
<nav><div class="nav-section"><div class="nav-section-title">Current Age</div>
<button class="nav-link" onclick="showPage('age116')">📜 Age 116 Changes</button>
<button class="nav-link sub" onclick="showPage('age116','races-116')">↳ Races (116)</button></div>
<div class="nav-section"><div class="nav-section-title">Previous Ages</div>
<button class="nav-link" onclick="showPage('age115')">📜 Age 115 Changes</button></div></nav>
<div id="page-home" class="page active"><p>Age 116 · World of Legends</p>
<button class="nav-card" onclick="showPage('age116')"><div class="card-icon">📜</div><h3>Age 116</h3></button>
<h3 class="section-title" style="margin-top:36px;">Age 116 Highlights</h3><div class="info-box gold"><p>old</p></div></div>
<!-- ══ AGE 116 ══ --><div id="page-age116" class="page"><h2>Age 116 — Final Changes</h2><h4>🌿 Elf</h4><h4>🌑 Dark Elf</h4></div>
<!-- ══ AGE 115 ══ --><div id="page-age115" class="page"></div>
<script>const pages = {
    home: 'Home',
    age116: 'Age 116 Changes',
    age115: 'Age 115 Changes (Previous)',
};</script></body></html>`;
const ROWS = {
 races:[{race:'Elf',emoji:null,archetype:'Magic',war_doctrine:'-20% casualties',unique_name:'Arcane Respite',unique_desc:'Regenerate +2 mana',bonuses:'+25% Wizards Per Acre\n+50% Rune Production',penalties:'-20% TPA',units:'Soldier 3/0',spells:'Greater Protection, Pitfalls'},
 {race:'Dark Elf',emoji:null,bonuses:'a',penalties:'',units:'u',spells:'s'}],
 personalities:[{personality:'The Mystic',emoji:'✨',unique_name:'Black Magic',unique_desc:'1% peasants <b>',bonuses:'+100% Guilds\n+25% WPA',start_bonus:'+800 Wizards',spells:'Meteor Showers, Pitfalls'}],
 game:[{category:'game',rule_name:'FCF Duration',value:'72 hours in range'},{category:'building',rule_name:'Watch Towers',value:'2.2%'},{category:'science',rule_name:'Shielding',value:'0.0350'},{category:'ritual',rule_name:'Haste',value:{effects:['-10% Attack Time','-25% Training Time']}},{category:'dragon',rule_name:'Ruby Dragon',value:'-10% ME'}]
};
test('inserts new age, navigation, map, home card, and highlights',()=>{
 const out=applyAgeToWiki(BASE,117,ROWS);
 assert.match(out,/<div id="page-age117" class="page">/);
 assert.ok(out.indexOf('page-age117')<out.indexOf('page-age116'));
 assert.match(out,/age117: 'Age 117 Changes',/);
 assert.match(out,/age116: 'Age 116 Changes \(Previous\)'/);
 assert.match(out,/Age 117 · World of Legends/);
 assert.match(out,/Age 117 Highlights[\s\S]*FCF Duration[\s\S]*Age 116 Highlights/);
 assert.match(out,/showPage\('age117'\)">\s*<div class="card-icon">📜<\/div>\s*<h3>Age 117<\/h3>/);
});
test('uses emoji fallback, stored values, and HTML escaping',()=>{
 const out=buildAgePage(117,ROWS,BASE).page;
 assert.match(out,/<h4>🌿 Elf<\/h4>/);
 assert.match(out,/<h4>🌑 Dark Elf<\/h4>/);
 assert.match(out,/\+25% Wizards Per Acre · \+50% Rune Production/);
 assert.match(out,/Greater Protection · Pitfalls/);
 assert.match(out,/1% peasants &lt;b&gt;/);
 assert.match(out,/-10% Attack Time; -25% Training Time/);
});
test('rejects duplicate age, missing anchor, empty rules, and reports wiki status honestly',()=>{
 const once=applyAgeToWiki(BASE,117,ROWS);
 assert.throws(()=>applyAgeToWiki(once,117,ROWS),/already contains Age 117/);
 assert.throws(()=>applyAgeToWiki('<html><body></body></html>',117,ROWS),/anchor/);
 assert.throws(()=>applyAgeToWiki(BASE,117,{races:[],personalities:[],game:[]}),/no rules rows/);
 assert.equal(wikiStatusLine({ok:true},117),'📘 Wiki updated for Age 117.');
 assert.match(wikiStatusLine({ok:false,error:'no_previous_wiki'},117),/wiki update failed/);
});
