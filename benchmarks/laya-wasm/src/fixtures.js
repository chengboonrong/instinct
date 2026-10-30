const categories=[["combat",40],["traffic",25],["social",20],["mission",15]];
const options={
 combat:{attack:"Attack only when advantageous",retreat:"Retreat when seriously threatened",cover:"Seek protective cover"},
 traffic:{stop:"Stop to avoid a collision",cross:"Cross when the road is clear",wait:"Wait until the path clears"},
 social:{greet:"Greet a friendly character",avoid:"Avoid an aggressive stranger",help:"Assist someone in distress"},
 mission:{investigate:"Investigate a suspicious event",continue:"Continue assigned objective",report:"Report dangerous discovery"}
};
function fixture(cat,i){
 const variants={
 combat:[`Enemy health ${10+i%80}%, player distance ${1+i%14}m, player aiming gun ${i%3===0}, nearby allies ${i%4}.`,`Player closing in, NPC stamina ${i%100}%, terrain cover ${i%2===0}.`],
 traffic:[`Pedestrian at road. Oncoming vehicle ${i%3===0}; crossing signal ${i%2===0?"green":"red"}.`],
 social:[`An NPC encounters a ${i%3===0?"friendly":"unknown"} stranger asking for assistance, safety concern ${i%4===0}.`],
 mission:[`Mission objective active, nearby suspicious noise ${i%2===0}, hazard level ${i%5}.`]
 };
 return {id:`${cat}-${i}`,category:cat,state:variants[cat][i%variants[cat].length],question:{action:{type:"choice",instructions:"Choose the appropriate game behavior based on the situation.",criteria:options[cat]}}};
}
export const fixtures=categories.flatMap(([c,n])=>Array.from({length:n},(_,i)=>fixture(c,i)));
