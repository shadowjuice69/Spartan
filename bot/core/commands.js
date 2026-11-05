const { REST, Routes } = require('discord.js');

const spartanCommand={name:'spartan',description:'Spartan command and access center',options:[
{name:'register',description:'Register this Discord identity for Spartan',type:1},
{name:'status',description:'Show your Spartan access status',type:1},
{name:'ask',description:'Ask Spartan AI',type:1,options:[{name:'question',description:'Your question',type:3,required:true,max_length:2000}]},
{name:'access',description:'Admin access control',type:1,options:[{name:'action',description:'Access action',type:3,required:true,choices:[{name:'grant',value:'grant'},{name:'suspend',value:'suspend'},{name:'revoke',value:'revoke'}]},{name:'user',description:'Discord user',type:6,required:true},{name:'reason',description:'Reason',type:3,required:false,max_length:500}]},
{name:'help',description:'Show Spartan commands',type:1},
{name:'wiki',description:'Get the public Utopia Wiki link',type:1}
]};

const musicCommand={name:'spartan-music',description:'Spartan music',options:[{name:'join',description:'Join your voice channel',type:1},{name:'play',description:'Play or queue a track',type:1,options:[{name:'query',description:'Song or URL',type:3,required:true}]},{name:'pause',description:'Pause playback',type:1},{name:'resume',description:'Resume playback',type:1},{name:'skip',description:'Skip track',type:1},{name:'stop',description:'Stop playback',type:1},{name:'queue',description:'Show queue',type:1},{name:'nowplaying',description:'Show current track',type:1},{name:'volume',description:'Set volume',type:1,options:[{name:'level',description:'0-100',type:4,required:true,min_value:0,max_value:100}]}]};

const intelCommand={name:'spartan-intel',description:'Spartan intelligence',options:[{name:'check',description:'Intel coverage',type:1},{name:'capturehealth',description:'Capture health',type:1},{name:'incoming',description:'Incoming armies',type:1},{name:'eta',description:'Returning armies',type:1},{name:'status',description:'Province status',type:1},{name:'left',description:'Kingdom offense',type:1},{name:'plunders',description:'Plunder candidates',type:1},{name:'survey',description:'Building survey',type:1,options:[{name:'province',description:'Province',type:3,required:true}]},{name:'oprate',description:'Operation rates',type:1},{name:'kdecon',description:'Kingdom economy',type:1},{name:'econ',description:'Province economy',type:1},{name:'tppa',description:'Kingdom density',type:1},{name:'canonical',description:'Browse website-captured Spartan Intel',type:1,options:[{name:'section',description:'Intel section to read',type:3,required:false,choices:[{name:'All',value:'all'},{name:'Military',value:'military'},{name:'Magic & Rituals',value:'magic'},{name:'Thievery',value:'thievery'},{name:'Science',value:'science'},{name:'Buildings',value:'buildings'},{name:'Kingdom',value:'kingdom'},{name:'Aid',value:'aid'},{name:'Exploration',value:'exploration'},{name:'Operations',value:'operations'},{name:'News',value:'news'},{name:'Throne',value:'throne'}]}]}]};

// --- spartan-calc choice lists (thievery rebuild — wiki-accurate success + yield model) ---
const RACE_CHOICES=[
{name:'Avian',value:'avian'},{name:'Dark Elf',value:'darkelf'},
{name:'Dryad',value:'dryad'},{name:'Dwarf',value:'dwarf'},
{name:'Elf',value:'elf'},{name:'Faery',value:'faery'},
{name:'Halfling',value:'halfling'},{name:'Human',value:'human'},
{name:'Orc',value:'orc'},{name:'Undead',value:'undead'},
];

const PERS_CHOICES=[
{name:'None',value:'none'},{name:'Heretic',value:'heretic'},
{name:'Mystic',value:'mystic'},{name:'Necromancer',value:'necromancer'},
{name:'Cleric',value:'cleric'},{name:'General',value:'general'},
{name:'Artisan',value:'artisan'},{name:'Rogue',value:'rogue'},
{name:'Sage',value:'sage'},{name:'Tactician',value:'tactician'},
{name:'Warrior',value:'warrior'},{name:'War Hero',value:'warhero'},
];

const THIEVERY_OP_CHOICES=[
{name:'Rob the Granaries',value:'Rob the Granaries'},
{name:'Rob the Vaults',value:'Rob the Vaults'},
{name:'Rob the Towers',value:'Rob the Towers'},
{name:'Kidnapping',value:'Kidnapping'},
{name:'Steal Horses',value:'Steal Horses'},
{name:'Steal War Horses',value:'Steal War Horses'},
{name:'Free Prisoners',value:'Free Prisoners'},
{name:'Night Strike',value:'Night Strike'},
{name:'Greater Arson',value:'Greater Arson'},
{name:'Assassinate Wizards',value:'Assassinate Wizards'},
];

const calcCommand={name:'spartan-calc',description:'Spartan calculators',options:[
{name:'thievery',description:'Wiki-accurate thievery: op success + yield',type:1,options:[
  {name:'op',description:'Operation to run',type:3,required:true,choices:THIEVERY_OP_CHOICES},
  {name:'my_thieves',description:'Your available thieves',type:4,required:true},
  {name:'my_land',description:'Your land (acres)',type:4,required:true},
  {name:'their_thieves',description:"Target's thieves (for catch-chance ratio)",type:4,required:true},
  {name:'their_land',description:"Target's land (acres)",type:4,required:true},
  {name:'target_resource',description:"Target's resource/troop count for this op",type:4,required:true},
  {name:'my_race',description:'Your race',type:3,required:true,choices:RACE_CHOICES},
  {name:'my_personality',description:'Your personality',type:3,required:false,choices:PERS_CHOICES},
  {name:'their_race',description:"Target's race",type:3,required:false,choices:RACE_CHOICES},
  {name:'war',description:'In a declared war?',type:5,required:false},
  {name:'invisibility',description:'Invisibility spell active?',type:5,required:false},
  {name:'my_crime_science_pct',description:'Your invested Crime Science bonus (e.g. 0.15 for +15%)',type:10,required:false},
  {name:'my_dens_pct',description:"Your Thieves' Dens %",type:10,required:false},
  {name:'my_honor_mod',description:'Your Honor modifier (default 1.0)',type:10,required:false},
  {name:'my_ritual_mod',description:'Your Ritual modifier (default 1.0)',type:10,required:false},
  {name:'their_watchtowers',description:"Target's Watch Towers %",type:10,required:false},
  {name:'my_nw',description:'Your networth',type:10,required:false},
  {name:'their_nw',description:"Target's networth",type:10,required:false},
  {name:'guile',description:'Guile modifier (default 1.0)',type:10,required:false},
  {name:'cunning',description:'Cunning modifier (default 1.0)',type:10,required:false},
  {name:'their_illuminate',description:"Target's Illuminate Shadows modifier (default 1.0)",type:10,required:false},
  {name:'their_shielding',description:"Target's Shielding (0-1, default 0)",type:10,required:false},
  {name:'stance',description:'Stance modifier (default 1.0)',type:10,required:false},
]},
{name:'attack',description:'Attack calculator',type:1,options:[
  {name:'your_nw',description:'Your networth',type:10,required:true},
  {name:'target_nw',description:"Target's networth",type:10,required:true},
  {name:'your_acres',description:'Your acres',type:4,required:true},
  {name:'target_acres',description:"Target's acres",type:4,required:true},
  {name:'your_map',description:'Your MAP (Military Assistance Points), default 0',type:4,required:false},
  {name:'war',description:'In a declared war?',type:5,required:false},
  {name:'off_mods',description:'Additional offense modifier (integer %)',type:4,required:false},
]},
{name:'invest',description:'Science investment planner',type:1,options:[
  {name:'build',description:'Build name to plan against (defaults to an active build matching your race)',type:3,required:false},
  {name:'province',description:'Province name (defaults to your own)',type:3,required:false},
]},
{name:'declare',description:'Legality checker',type:1,options:[
  {name:'our_nw',description:'Our networth',type:10,required:true},
  {name:'their_nw',description:"Their networth",type:10,required:true},
  {name:'our_land',description:'Our land (acres)',type:4,required:true},
  {name:'their_land',description:"Their land (acres)",type:4,required:true},
  {name:'our_meter',description:'Our hostility meter reading',type:10,required:true},
  {name:'their_meter',description:'Their hostility meter reading',type:10,required:true},
  {name:'quiet_ticks',description:'Ticks since last hostile action',type:4,required:false},
  {name:'their_name',description:'Their province name',type:3,required:false},
]},
{name:'spellcheck',description:'Spell checker',type:1,options:[
  {name:'my_wizards',description:'Your available wizards',type:4,required:true},
  {name:'my_land',description:'Your land (acres)',type:4,required:true},
  {name:'my_race',description:'Your race',type:3,required:true,choices:RACE_CHOICES},
  {name:'their_wizards',description:"Target's wizards",type:4,required:true},
  {name:'their_land',description:"Target's land (acres)",type:4,required:true},
  {name:'my_personality',description:'Your personality',type:3,required:false,choices:PERS_CHOICES},
  {name:'their_race',description:"Target's race, default Avian",type:3,required:false,choices:RACE_CHOICES},
  {name:'my_channeling',description:'Your Channeling science modifier (default 1.0)',type:10,required:false},
  {name:'my_honor_mod',description:'Your Honor modifier (default 1.0)',type:10,required:false},
  {name:'mages_fury',description:"Mage's Fury active?",type:5,required:false},
  {name:'focused_channelling',description:'Focused Channelling active?',type:5,required:false},
  {name:'their_magic_shield',description:'Target has Magic Shield up?',type:5,required:false},
  {name:'my_nw',description:'Your networth',type:4,required:false},
  {name:'their_nw',description:"Target's networth",type:4,required:false},
  {name:'spell',description:'Spell to check',type:3,required:false},
]},
{name:'science',description:'Science calculator',type:1,options:[
  {name:'type',description:'Science category',type:3,required:false},
]},
{name:'science-summary',description:'Science summary',type:1,options:[
  {name:'province',description:'Province name (defaults to your own)',type:3,required:false},
  {name:'libraries',description:'Libraries % bonus',type:10,required:false},
]}
]};

const warCommand={name:'spartan-war',description:'Spartan war operations',options:[{name:'analyze',description:'Analyze war',type:1},{name:'summary',description:'War summary',type:1},{name:'board',description:'War board',type:1},{name:'status',description:'War status',type:1,options:[
  {name:'action',description:'Action to take',type:3,required:false,choices:[{name:'declare',value:'declare'},{name:'end',value:'end'},{name:'status',value:'status'}]},
  {name:'kingdom',description:'Enemy kingdom name (for declare)',type:3,required:false},
  {name:'coords',description:'Enemy kingdom coords (for declare)',type:3,required:false},
  {name:'notes',description:'Notes about the war',type:3,required:false},
]},{name:'target',description:'Target operations',type:1,options:[
  {name:'province',description:'Province name',type:3,required:false},
  {name:'mode',description:'Ranking: best value (default), most acres, or softest',type:3,required:false,choices:[{name:'best value',value:'value'},{name:'most acres',value:'gain'},{name:'softest',value:'soft'}]},
]},{name:'ambush',description:'Ambush raw-offense threshold (needs spied troop composition — Throne intel alone can\'t see this)',type:1,options:[
  {name:'their_race',description:"Target's race",type:3,required:true,choices:RACE_CHOICES},
  {name:'their_elites',description:"Target's Elites (from a successful Military spy op)",type:4,required:true},
  {name:'their_off_specs',description:"Target's Off Specs (from a successful Military spy op)",type:4,required:true},
  {name:'their_soldiers',description:"Target's Soldiers (from a successful Military spy op)",type:4,required:true},
  {name:'their_anonymity',description:'Target has Anonymity spell active?',type:5,required:false},
  {name:'their_war_spoils',description:'Target has War Spoils active?',type:5,required:false},
  {name:'target',description:'Target province name (label only)',type:3,required:false},
]},{name:'intel',description:'War intelligence',type:1}]};

const adminCommand={name:'spartan-admin',description:'Spartan administration',options:[
{name:'panel',description:'Admin panel',type:1},
{name:'logs',description:'Access logs',type:1},
{name:'admins',description:'Manage administrators',type:1,options:[
  {name:'action',description:'list (default), add, or remove',type:3,required:false,choices:[{name:'list',value:'list'},{name:'add',value:'add'},{name:'remove',value:'remove'}]},
  {name:'user',description:'Discord user (for add/remove)',type:6,required:false},
]},
{name:'access',description:'Manage Spartan access',type:1},
{name:'alerts',description:'Manage tick alerts',type:1,options:[
  {name:'action',description:'list (default), set, or delete',type:3,required:false,choices:[{name:'list',value:'list'},{name:'set',value:'set'},{name:'delete',value:'delete'}]},
  {name:'label',description:'Alert label (for set/delete)',type:3,required:false},
  {name:'ticks',description:'Comma-separated tick numbers 1-24 (for set)',type:3,required:false},
  {name:'message',description:'Alert message (for set)',type:3,required:false},
  {name:'channel',description:'Channel to post in (for set, defaults to this channel)',type:7,required:false},
  {name:'role',description:'Role to ping (for set)',type:8,required:false},
]},
{name:'broadcast',description:'Broadcast through Spartan',type:1},
{name:'setkingdom',description:'Set the kingdom name/code Spartan displays',type:1,options:[
  {name:'name',description:'Kingdom name',type:3,required:true},
  {name:'code',description:'Kingdom coordinates, e.g. 6:9',type:3,required:true},
]},
]};

const topLevel=[];

async function register(client){
 const token=process.env.DISCORD_TOKEN;const clientId=process.env.CLIENT_ID;if(!token||!clientId)throw new Error('DISCORD_TOKEN and CLIENT_ID are required for command registration.');
 const rest=new REST({version:'10'}).setToken(token);const guildIds=(process.env.GUILD_ID||'1534817549374455848').split(',').map(s=>s.trim()).filter(Boolean);
 const disabledGuildIds=(process.env.DISABLED_GUILD_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 for(const guildId of guildIds){
   if(disabledGuildIds.includes(guildId)){
     const route=Routes.applicationGuildCommands(clientId,guildId);
     await rest.put(route,{body:[]});
     console.log(`[SPARTAN COMMANDS] Guild ${guildId} is in DISABLED_GUILD_IDS -- cleared any registered commands, not re-registering`);
     continue;
   }
   const route=Routes.applicationGuildCommands(clientId,guildId);await rest.put(route,{body:[spartanCommand,musicCommand,intelCommand,calcCommand,warCommand,adminCommand,...topLevel]});console.log(`[SPARTAN COMMANDS] Fresh command surface registered for guild ${guildId}`);
 }
}
module.exports={register,spartanCommand,musicCommand,intelCommand,calcCommand,warCommand,adminCommand,topLevel};
