/* global __ENV, __VU, open */
import http from "k6/http";
import {check,sleep} from "k6";
import {SharedArray} from "k6/data";
const base=__ENV.LOAD_ORIGIN;
if(__ENV.OWNED_LOAD_TARGET_ACK!=="owned-isolated-staging"||!/^https:\/\/[^/?#]+$/.test(base||""))throw new Error("Explicit company-owned isolated HTTPS staging origin required");
const fixtures=new SharedArray("private fixtures",()=>JSON.parse(open(__ENV.LOAD_FIXTURE_FILE||"/fixtures/fixtures.json")).users);
const eventId=__ENV.LOAD_EVENT_ID;
const upload=open(__ENV.LOAD_UPLOAD_FILE||"/fixtures/upload.png","b");
const documentUpload=__ENV.LOAD_UPLOAD_PURPOSE==="document";
if(!eventId)throw new Error("LOAD_EVENT_ID required");
export const options={stages:[{duration:"1m",target:50},{duration:"2m",target:150},{duration:"2m",target:300},{duration:"15m",target:300},{duration:"1m",target:0}],thresholds:{"http_req_duration{kind:ordinary}":["p(95)<2000"],http_req_failed:["rate<0.01"],checks:["rate>0.99"]},discardResponseBodies:true};
function params(user,kind="ordinary",json=false){return {redirects:0,tags:{kind},responseType:json?"text":"none",headers:{Origin:base,Cookie:"hackathon_session="+user.cookie,...(__ENV.LOAD_BASIC_TOKEN?{Authorization:"Basic "+__ENV.LOAD_BASIC_TOKEN}:{}),...(json?{"Content-Type":"application/json"}:{})}};}
export default function(){
 const user=fixtures[(__VU-1)%fixtures.length],mode=Math.random();
 if(mode<0.8){const route=["/","/events","/projects","/api/projects","/api/account/profile"][Math.floor(Math.random()*5)];check(http.get(base+route,params(user)),{"browse OK":r=>r.status===200});}
 else if(mode<0.95){
   const current=http.get(base+"/api/account/profile",params(user,"ordinary",true));
   if(!check(current,{"profile read":r=>r.status===200}))return;
   const revision=current.json("revision");
   const response=http.put(base+"/api/account/profile",JSON.stringify({revision,nickname:"Load user "+__VU}),params(user,"ordinary",true));check(response,{"profile write":r=>r.status===200});
 }else{
   const response=http.post(base+"/api/events/"+encodeURIComponent(eventId)+"/files",{purpose:documentUpload?"document":"cover",file:http.file(upload,documentUpload?"synthetic.pdf":"synthetic.png",documentUpload?"application/pdf":"image/png")},params(user,"upload"));
   check(response,{"private upload":r=>r.status===200});
 }
 sleep(1);
}
