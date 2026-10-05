// Builds the hourly tick report Jeeves shows: change since about an hour ago plus recorded events.
type Row = Record<string, any>
const KEYS = ['acres','networth','population','soldiers','off_specs','def_specs','elites','thieves','wizards','offense','defense','mana','stealth'] as const
const num=(v:unknown):number|null=>{if(v==null||String(v).trim()==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null}
const ms=(v:unknown)=>{const t=Date.parse(String(v??''));return Number.isFinite(t)?t:0}
export function buildHourlyReport(args:{history:Row[];live:Row|null;liveAt:string|null;events:Row[];sinceMs:number}){
 const {history,live,liveAt,events,sinceMs}=args;const latestRow=history[0]||{};const latest:Record<string,number|null>={}
 for(const k of KEYS)latest[k]=(live?num(live[k]):null)??num(latestRow[k])
 const lastCaptureMs=Math.max(ms(latestRow.observed_at),ms(liveAt));const stale=!lastCaptureMs||lastCaptureMs<=sinceMs
 const baseline=history.find(r=>ms(r.observed_at)<=sinceMs)||null;const changes:Record<string,number|null>={}
 for(const k of KEYS){const before=baseline?num(baseline[k]):null;changes[k]=!stale&&before!==null&&latest[k]!==null?(latest[k] as number)-before:null}
 const inWindow=events.filter(e=>ms(e.occurred_at)>=sinceMs);const sum=(key:string)=>inWindow.reduce((s,e)=>s+(num(e[key])??0),0)
 const troopsLost=sum('troops_lost'),thievesLost=sum('thieves_lost'),wizardsLost=sum('wizards_lost');const alerts:string[]=[]
 if(troopsLost>0)alerts.push(troopsLost.toLocaleString('en-US')+' troops lost')
 if(thievesLost>0)alerts.push(thievesLost.toLocaleString('en-US')+' thieves lost')
 if(wizardsLost>0)alerts.push(wizardsLost.toLocaleString('en-US')+' wizards lost')
 return {stale,lastCaptureAt:lastCaptureMs?new Date(lastCaptureMs).toISOString():null,baselineAt:baseline?String(baseline.observed_at):null,latest,changes,events:{count:inWindow.length,troopsLost,thievesLost,wizardsLost,alerts}}
}
