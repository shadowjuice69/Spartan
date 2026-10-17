'use strict';
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const parts = s => String(s || '').split(/\s*(?:\n|·)\s*/).map(x=>x.trim()).filter(Boolean);
const joinParts = s => parts(s).join(' · ');
function valueText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(valueText).join('; ');
  if (typeof v === 'object') return Array.isArray(v.effects) ? v.effects.join('; ') : Object.entries(v).map(([k,x])=>k+': '+valueText(x)).join('; ');
  return String(v);
}
function emojiFor(html,name,fallback) {
  const safe=String(name).replace(/[.*+?^$()|[\\]\\]/g,'\\$&');
  const m=String(html||'').match(new RegExp('<h4>([^<>\\w]*?)\\s*'+safe+'</h4>'));
  return (m&&m[1].trim())||fallback||'';
}
function statRow(label,value,cls) {
  return value ? '              <div class="stat-row"><span class="stat-label">'+label+'</span><span class="stat-val'+(cls?' '+cls:'')+'">'+esc(value)+'</span></div>\n' : '';
}
function raceCard(r,base) {
  const emoji=r.emoji||emojiFor(base,r.race);
  let h='          <div class="race-card">\n            <div class="race-card-header"><h4>'+esc((emoji?emoji+' ':'')+r.race)+'</h4>'+(r.archetype?'<span class="badge badge-available">'+esc(r.archetype)+'</span>':'')+'</div>\n            <div class="race-card-body">\n';
  if(r.war_doctrine) h+='              <div class="doctrine-box"><strong>War Doctrine (In War):</strong> '+esc(r.war_doctrine)+'</div>\n';
  if(r.unique_name||r.unique_desc) h+='              <div class="doctrine-box" style="background:rgba(42,157,143,0.06);border-color:var(--teal);"><strong>Unique Passive — '+esc(r.unique_name||'')+':</strong> '+esc(r.unique_desc||'')+'</div>\n';
  h+=statRow('Bonuses',joinParts(r.bonuses),'pos')+statRow('Penalties',joinParts(r.penalties),'neg')+statRow('Units',r.units,'')+statRow('Spells',joinParts(String(r.spells||'').replace(/,\s*/g,' · ')),'');
  return h+'            </div>\n          </div>\n';
}
function personalityCard(p,base) {
  const name=p.personality, emoji=p.emoji||emojiFor(base,name);
  let h='          <div class="race-card">\n            <div class="race-card-header"><h4>'+esc((emoji?emoji+' ':'')+name)+'</h4></div>\n            <div class="race-card-body">\n';
  if(p.unique_name||p.unique_desc) h+='              <div class="doctrine-box" style="background:rgba(42,157,143,0.06);border-color:var(--teal);"><strong>Unique Passive — '+esc(p.unique_name||'')+':</strong> '+esc(p.unique_desc||'')+'</div>\n';
  h+=statRow('Bonuses',joinParts(p.bonuses),'pos')+statRow('Start',joinParts(p.start_bonus),'')+statRow('Spells',joinParts(String(p.spells||'').replace(/,\s*/g,' · ')),'');
  return h+'            </div>\n          </div>\n';
}
function table(head,rows) {
  return '        <div class="tbl-wrap">\n          <table>\n            <thead><tr>'+head.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead>\n            <tbody>\n'+rows.map(r=>'              <tr>'+r.map((c,i)=>i===0?'<td><strong>'+esc(c)+'</strong></td>':'<td>'+esc(c)+'</td>').join('')+'</tr>').join('\n')+'\n            </tbody>\n          </table>\n        </div>\n';
}
const byName=(a,b)=>String(a.rule_name).localeCompare(String(b.rule_name));
function buildAgePage(ageNumber,ageRows,baseHtml) {
  const N=Number(ageNumber), races=(ageRows.races||[]).slice().sort((a,b)=>String(a.race).localeCompare(String(b.race))), pers=(ageRows.personalities||[]).slice().sort((a,b)=>String(a.personality).localeCompare(String(b.personality))), game=ageRows.game||[];
  const cat=c=>game.filter(g=>g.category===c).sort(byName), sections=[];
  const add=(key,label,title,body)=>sections.push({id:key+'-'+N,label,html:'        <h3 class="section-title" id="'+key+'-'+N+'">'+esc(title)+'</h3>\n'+body});
  const doctrines=races.filter(r=>r.war_doctrine).map(r=>[r.race,r.war_doctrine]);
  if(doctrines.length)add('war-doctrines','War Doctrines','War Doctrine Updates',table(['Race','War Doctrine (In War)'],doctrines));
  const general=cat('game');
  if(general.length)add('general','General Changes','General Changes',table(['Rule','Change'],general.map(g=>[g.rule_name,valueText(g.value)])));
  const buildings=cat('building');
  if(buildings.length)add('buildings','Buildings','Buildings','        <ul class="wiki-list">\n'+buildings.map(g=>'          <li><strong>'+esc(g.rule_name)+'</strong> — '+esc(valueText(g.value))+'</li>').join('\n')+'\n        </ul>\n');
  for(const [key,c,label] of [['science','science','Science'],['spells','spell','Spells'],['thievery','thievery','Thievery'],['dragons','dragon','Dragons'],['rituals','ritual','Rituals']]) {
    const rows=cat(c); if(rows.length)add(key,label,label==='Dragons'?'Dragons (Age '+N+')':label,table([label==='Science'?'Science':label.replace(/s$/,''),'Change'],rows.map(g=>[g.rule_name,valueText(g.value)])));
  }
  if(races.length)add('races','Races ('+N+')','Races — Age '+N+' Stats','        <div class="race-grid">\n\n'+races.map(r=>raceCard(r,baseHtml)).join('\n')+'\n        </div><!-- /race-grid -->\n');
  if(pers.length)add('personalities','Personalities ('+N+')','Personalities — Age '+N,'        <div class="race-grid">\n\n'+pers.map(p=>personalityCard(p,baseHtml)).join('\n')+'\n        </div><!-- /personality grid -->\n');
  const quick=sections.map(s=>'          <button onclick="scrollToId(\''+s.id+'\')">'+esc(s.label)+'</button>').join('\n');
  const page='      <!-- ══ AGE '+N+' ══ -->\n      <div id="page-age'+N+'" class="page">\n        <h2 class="page-title">Age '+N+' — Final Changes</h2>\n\n        <div class="quick-nav">\n'+quick+'\n        </div>\n\n'+sections.map(s=>s.html).join('\n')+'      </div><!-- /age'+N+' -->\n\n\n';
  const nav='      <div class="nav-section-title">Current Age</div>\n      <button class="nav-link" onclick="showPage(\'age'+N+'\')">📜 Age '+N+' Changes</button>\n'+sections.map(s=>'      <button class="nav-link sub" onclick="showPage(\'age'+N+'\',\''+s.id+'\')">↳ '+esc(s.label)+'</button>').join('\n')+'\n';
  const highlights=general.length?'        <h3 class="section-title" style="margin-top:36px;">Age '+N+' Highlights</h3>\n        <div class="info-box gold">\n'+general.slice(0,12).map(g=>'          <p><strong>'+esc(g.rule_name)+'</strong> — '+esc(valueText(g.value))+'</p>').join('\n')+'\n        </div>\n\n':'';
  return {page,nav,highlights,sectionIds:sections.map(s=>s.id)};
}
function applyAgeToWiki(baseHtml,ageNumber,ageRows) {
  const N=Number(ageNumber); let html=String(baseHtml||'');
  if(!/<div id="page-age(\d+)" class="page">/.test(html))throw Error('wiki html has no age page to anchor on');
  if(new RegExp('id="page-age'+N+'"').test(html))throw Error('base wiki already contains Age '+N+'; pass the previous age HTML');
  const gen=buildAgePage(N,ageRows,html); if(!gen.sectionIds.length)throw Error('no rules rows to build an age page from');
  const ages=[...html.matchAll(/<div id="page-age(\d+)" class="page">/g)].map(m=>({n:Number(m[1]),idx:m.index})), newest=ages.sort((a,b)=>b.n-a.n)[0];
  const before=html.slice(0,newest.idx), cm=before.match(/[ \t]*<!-- ══ AGE \d+ ══ -->\s*$/), at=cm?newest.idx-cm[0].length:newest.idx;
  html=html.slice(0,at)+gen.page+html.slice(at);
  const curRe=/([ \t]*)<div class="nav-section-title">Current Age<\/div>\n([\s\S]*?)(\s*<\/div>)/, cur=html.match(curRe);
  if(!cur)throw Error('wiki nav "Current Age" block not found');
  const oldBlock=cur[2]; html=html.replace(curRe,()=>gen.nav.replace(/\n$/,'')+cur[3]);
  const prevRe=/(<div class="nav-section-title">Previous Ages<\/div>\n)/;
  if(!prevRe.test(html))throw Error('wiki nav "Previous Ages" block not found');
  html=html.replace(prevRe,m=>m+oldBlock.replace(/\n?$/,'\n'));
  const mapRe=/(const pages = \{\n(\s*)home: 'Home',\n)/;
  if(!mapRe.test(html))throw Error('wiki pages map not found');
  html=html.replace(mapRe,(m,a,ind)=>a+ind+'age'+N+': \'Age '+N+' Changes\',\n');
  html=html.replace(new RegExp("age"+newest.n+": 'Age "+newest.n+" Changes'(?! \\(Previous\\))"),"age"+newest.n+": 'Age "+newest.n+" Changes (Previous)'");
  html=html.split('Age '+newest.n+' · World of Legends').join('Age '+N+' · World of Legends');
  const cardRe=new RegExp('(<button class="nav-card" onclick="showPage\\(\'age)'+newest.n+'(\'\\)">\\s*<div class="card-icon">[^<]*</div>\\s*<h3>Age )'+newest.n+'(</h3>)');
  html=html.replace(cardRe,(m,a,b,c)=>a+N+b+N+c);
  if(gen.highlights){const hl=new RegExp('([ \\t]*)<h3 class="section-title" style="margin-top:36px;">Age '+newest.n+' Highlights</h3>');if(hl.test(html))html=html.replace(hl,gen.highlights+'$&');}
  return html;
}
function wikiStatusLine(wiki,ageNumber) {
  if(wiki&&wiki.ok===true)return '📘 Wiki updated for Age '+ageNumber+'.';
  return '⚠️ Age rules were applied, but the wiki update failed ('+String(wiki&&wiki.error||'unknown_error')+'). Rules remain applied; wiki content was not confirmed updated.';
}
module.exports={buildAgePage,applyAgeToWiki,valueText,esc,wikiStatusLine};
