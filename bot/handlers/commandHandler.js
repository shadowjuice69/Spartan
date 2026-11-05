const permissionService=require('../services/permissionService');
const commandAccess=require('../services/commandAccessService');
const commandRegistry=require('../services/commandRegistry');
const spartanAccess=require('../services/spartanAccessService');
const spartanHandler=require('./commands/spartanHandler');
const spartanRegister=require('./commands/spartanRegisterHandler');
const spartanStatus=require('./commands/spartanStatusHandler');
const spartanAccessHandler=require('./commands/spartanAccessHandler');
const helpHandler=require('./commands/helpHandler');
const wikiHandler=require('./commands/wikiHandler');
const musicHandler=require('./commands/musicHandler');
const intelOpsHandler=require('./commands/intelOpsHandler');
const thieveryHandler=require('./commands/thieveryHandler');
const attackHandler=require('./commands/attackHandler');
const investHandler=require('./commands/investHandler');
const declareLegalityHandler=require('./commands/declareLegalityHandler');
const spellcheckHandler=require('./commands/spellcheckHandler');
const scienceHandler=require('./commands/scienceHandler');
const scienceSummaryHandler=require('./commands/scienceSummaryHandler');
const analyzeWarHandler=require('./commands/analyzeWarHandler');
const warSummaryHandler=require('./commands/warSummaryHandler');
const warBoardHandler=require('./commands/warBoardHandler');
const warHandler=require('./commands/warHandler');
const targetHandler=require('./commands/targetHandler');
const ambushHandler=require('./commands/ambushHandler');
const intelHandler=require('./commands/intelHandler');
const adminHandler=require('./commands/adminHandler');
const adminsHandler=require('./commands/adminsHandler');
const logsHandler=require('./commands/logsHandler');
const alertsHandler=require('./commands/alertsHandler');
const broadcastHandler=require('./commands/broadcastHandler');
const setkingdomHandler=require('./commands/setkingdomHandler');
const COMMANDS={
 spartan:{register:spartanRegister,status:spartanStatus,ask:spartanHandler,access:spartanAccessHandler,help:helpHandler,wiki:wikiHandler},
 'spartan-music':{join:musicHandler,play:musicHandler,pause:musicHandler,resume:musicHandler,skip:musicHandler,stop:musicHandler,queue:musicHandler,nowplaying:musicHandler,volume:musicHandler},
 'spartan-intel':{check:intelOpsHandler,capturehealth:intelOpsHandler,incoming:intelOpsHandler,eta:intelOpsHandler,status:intelOpsHandler,left:intelOpsHandler,plunders:intelOpsHandler,survey:intelOpsHandler,oprate:intelOpsHandler,kdecon:intelOpsHandler,econ:intelOpsHandler,tppa:intelOpsHandler,canonical:intelOpsHandler},
 'spartan-calc':{thievery:thieveryHandler,attack:attackHandler,invest:investHandler,declare:declareLegalityHandler,spellcheck:spellcheckHandler,science:scienceHandler,'science-summary':scienceSummaryHandler},
 'spartan-war':{analyze:analyzeWarHandler,summary:warSummaryHandler,board:warBoardHandler,status:warHandler,target:targetHandler,ambush:ambushHandler,intel:intelHandler},
 'spartan-admin':{panel:adminHandler,logs:logsHandler,admins:adminsHandler,access:spartanAccessHandler,alerts:alertsHandler,broadcast:broadcastHandler,setkingdom:setkingdomHandler}
};
for(const [command,subs] of Object.entries(COMMANDS))for(const [sub,handler] of Object.entries(subs)){if(!commandRegistry.has(command,sub)){const access=command==='spartan'&&(sub==='register'||sub==='status'||sub==='help'||sub==='wiki')?'public':command==='spartan'&&sub==='access'?'admin':command==='spartan-admin'?'admin':'registered';commandRegistry.register(command,sub,handler,{access});}}
async function hasSpartanAccess(userId){return spartanAccess.hasAccess(userId);}

function forceEphemeralInteraction(interaction){
 const wrapPayload = payload => {
  if (payload == null || typeof payload === 'string') return {content: payload == null ? '' : payload, ephemeral:true};
  if (typeof payload === 'object') return {...payload, ephemeral:true};
  return payload;
 };
 const originalReply = interaction.reply.bind(interaction);
 const originalFollowUp = interaction.followUp ? interaction.followUp.bind(interaction) : null;
 const originalDeferReply = interaction.deferReply ? interaction.deferReply.bind(interaction) : null;
 interaction.reply = payload => {
  const normalized = wrapPayload(payload);
  if (interaction.deferred || interaction.replied) {
   delete normalized.ephemeral;
   return interaction.editReply(normalized);
  }
  return originalReply(normalized);
 };
 if (originalFollowUp) interaction.followUp = payload => originalFollowUp(wrapPayload(payload));
 if (originalDeferReply) interaction.deferReply = options => originalDeferReply({...options, ephemeral:true});
 return interaction;
}
module.exports=async function commandHandler(interaction){
 const command=interaction.commandName;let sub='';try{sub=interaction.options.getSubcommand(false)||'';}catch(_){sub='';}
 const entry=commandRegistry.get(command,sub);console.log(`[SPARTAN COMMAND] /${command}${sub?` ${sub}`:''} entry=${entry?'found':'missing'}`);
 if(!entry)return interaction.reply({content:`❌ Unknown Spartan command: /${command}${sub?` ${sub}`:''}`,ephemeral:true});
 if(!['spartan','spartan-music','spartan-intel','spartan-calc','spartan-war','spartan-admin'].includes(command))return interaction.reply({content:'❌ This command surface has been retired. Use the new `/spartan` commands.',ephemeral:true});
 interaction=forceEphemeralInteraction(interaction);
 try{
  // Acknowledge Intel before permission lookups as well as canonical database reads.
  // Both can exceed Discord's 3-second initial-response deadline.
  if(command==='spartan-intel'&&!interaction.deferred&&!interaction.replied)await interaction.deferReply({ephemeral:true});
  if(!commandAccess.canAccess(entry,interaction.user,permissionService))return interaction.reply({content:commandAccess.denialMessage(entry),ephemeral:true});
  if(entry.access==='registered'&&!permissionService.isOwner(interaction.user.id)&&!(await hasSpartanAccess(interaction.user.id)))return interaction.reply({content:'❌ Spartan access is required. Use `/spartan register`.',ephemeral:true});
  return await entry.handler(interaction);
 }catch(e){
  console.error(`[SPARTAN COMMAND] /${command} ${sub}`,e);
  if(!interaction.replied&&!interaction.deferred)return interaction.reply({content:`❌ ${e.message||'Spartan command failed.'}`,ephemeral:true});
  if(interaction.deferred&&!interaction.replied)return interaction.editReply({content:`❌ ${e.message||'Spartan command failed.'}`});
  throw e;
 }
};
module.exports.commandRegistry=commandRegistry;
