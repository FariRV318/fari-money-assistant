const KEY='fariMoneyAssistant_v8';
const SUPABASE_URL='https://hbvtnzcoranwctfggraj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_9hoA3bVLyLlMwRGM08ZD9Q_RvTFXeFp';
const LEGACY_KEYS=['fariMoneyAssistant_v4','fariMoneyAssistant_v3','fariMoneyAssistant_v1'];
const defaultState={
  income:{fixed:0,side:0,trading:0,other:0,essential:0,buffer:0},
  transactions:[],debts:[],goals:[],credits:[],
  account:{name:'Fari',email:''}
};
let state=load();
let editingDebtId=null, editingCreditId=null;
let sb=null;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>`AED ${Number(n||0).toLocaleString('en-AE',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function cloneDefault(){return JSON.parse(JSON.stringify(defaultState))}
function load(){try{let raw=localStorage.getItem(KEY);if(!raw){for(const k of LEGACY_KEYS){raw=localStorage.getItem(k);if(raw)break}}const x=JSON.parse(raw||'{}');return {...cloneDefault(),...x,income:{...defaultState.income,...(x.income||{})},account:{...defaultState.account,...(x.account||{})}}}catch{return cloneDefault()}}
function save(){localStorage.setItem(KEY,JSON.stringify(state));renderAll();cloudSave().catch(()=>{})}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
function nowMonth(){const n=new Date();return new Date(n.getFullYear(),n.getMonth(),1)}
function addMonths(d,n){return new Date(d.getFullYear(),d.getMonth()+n,1)}
function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function monthLabel(d){return d.toLocaleDateString('en-AE',{month:'long',year:'numeric'})}
function daysUntil(date){return Math.ceil((new Date(date+'T23:59:59')-new Date())/86400000)}
function monthsUntil(date){const d=new Date(date+'T12:00:00'),n=new Date();return Math.max(1,(d.getFullYear()-n.getFullYear())*12+d.getMonth()-n.getMonth()+1)}
function totalIncome(){const i=state.income;return +i.fixed + +i.side + +i.trading + +i.other}
function monthTxn(type){const now=new Date();return state.transactions.filter(t=>t.type===type&&new Date(t.date).getMonth()===now.getMonth()&&new Date(t.date).getFullYear()===now.getFullYear()).reduce((s,t)=>s+Number(t.amount),0)}
function debtPriorityScore(d){let s=d.fixed?100:0;if(d.interest&&d.rate>0)s+=35;if(d.priority==='critical')s+=40;if(d.priority==='high')s+=25;if(d.type==='Credit Card')s+=20;return s}
function goalRank(p){return p==='critical'?3:p==='high'?2:1}
function currentIncome(){return totalIncome()+monthTxn('Income')}

function buildPlan(){
 const income=currentIncome();
 const fixedDebts=state.debts.filter(d=>d.fixed&&+d.balance>0).reduce((s,d)=>s+Math.min(+d.monthly,+d.balance),0);
 const creditFees=state.credits.filter(c=>+c.balance>0).reduce((s,c)=>s+Number(c.fee||0),0);
 const mandatory=fixedDebts+creditFees;
 const essential=Number(state.income.essential||0), buffer=Number(state.income.buffer||0);
 let remaining=income-mandatory-essential-buffer;
 const allocations=[];
 state.debts.filter(d=>d.fixed&&+d.balance>0).sort((a,b)=>debtPriorityScore(b)-debtPriorityScore(a)).forEach(d=>allocations.push({type:'Fixed debt',name:d.name,amount:Math.min(+d.monthly,+d.balance),priority:'Mandatory',id:d.id}));
 if(essential>0)allocations.push({type:'Living',name:'Essential living budget',amount:essential,priority:'Mandatory'});
 const goalPlans=state.goals.map(g=>{const need=Math.max(0,+g.amount-+g.saved);const m=monthsUntil(g.deadline);return {...g,need,monthly:need/m}}).sort((a,b)=>goalRank(b.priority)-goalRank(a.priority)||new Date(a.deadline)-new Date(b.deadline));
 for(const g of goalPlans){if(remaining<=0)break;const amt=Math.min(g.monthly,remaining);if(amt>0){allocations.push({type:'Urgent goal',name:g.name,amount:amt,priority:g.priority,id:g.id});remaining-=amt}}
 const flex=state.debts.filter(d=>!d.fixed&&+d.balance>0).sort((a,b)=>debtPriorityScore(b)-debtPriorityScore(a));
 for(const d of flex){if(remaining<=0)break;if(d.pieces===false)continue;let desired=Math.min(+d.monthly||0,+d.balance);let min=Math.min(+d.minimum||0,+d.balance);let amt=remaining>=desired?desired:Math.min(remaining,Math.max(min,remaining*.45));amt=Math.max(0,amt);if(amt){allocations.push({type:'Flexible debt',name:d.name,amount:amt,priority:d.priority,id:d.id});remaining-=amt}}
 // Whole-payment debts with a preferred month become protected sinking-fund targets.
 const currentKey=monthKey(nowMonth());
 for(const d of flex.filter(x=>x.pieces===false&&(x.targetDate||x.targetMonth)).sort((a,b)=>(a.targetDate||a.targetMonth).localeCompare(b.targetDate||b.targetMonth)||debtPriorityScore(b)-debtPriorityScore(a))){
   if(remaining<=0)break;
   const raw=d.targetDate||(d.targetMonth+'-01'); const td=new Date(raw+'T12:00:00'); const targetKey=raw.slice(0,7);
   const monthsLeft=Math.max(1,(td.getFullYear()-nowMonth().getFullYear())*12+(td.getMonth()-nowMonth().getMonth())+1);
   const neededNow=targetKey<=currentKey?+d.balance:(+d.balance/monthsLeft);
   const amt=Math.min(+d.balance,Math.max(0,remaining),neededNow);
   if(amt>0){allocations.push({type:targetKey<=currentKey?'Whole debt payment':'Final-date debt reserve',name:d.name,amount:amt,priority:'Due '+td.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),id:d.id});remaining-=amt}
 }
 // Whole-payment debts without a chosen month are suggested only when the full balance fits.
 for(const d of flex.filter(x=>x.pieces===false&&!(x.targetDate||x.targetMonth))){if(remaining>=+d.balance){allocations.push({type:'Whole debt payment',name:d.name,amount:+d.balance,priority:d.priority,id:d.id});remaining-=+d.balance}}
 if(buffer>0)allocations.push({type:'Buffer',name:'Emergency buffer',amount:buffer,priority:'Protected'});
 const free=Math.max(0,remaining),shortfall=Math.max(0,-(income-mandatory-essential-buffer));
 return {income,mandatory,essential,buffer,allocations,free,shortfall,goalPlans};
}

function buildRoadmap(maxMonths=18){
 const income=Math.max(0,currentIncome()), essential=+state.income.essential||0, buffer=+state.income.buffer||0;
 let debts=state.debts.map(d=>({...d,balance:+d.balance,reserved:0}));
 let credits=state.credits.map(c=>({...c,balance:+c.balance}));
 let goals=state.goals.map(g=>({...g,saved:+g.saved,amount:+g.amount}));
 const rows=[];let clearedMonth=null;
 for(let i=0;i<maxMonths;i++){
  const date=addMonths(nowMonth(),i),key=monthKey(date);let available=income;const payments=[];
  available-=essential; if(essential>0)payments.push({name:'Essential living',amount:essential,kind:'living'});
  available-=buffer; if(buffer>0)payments.push({name:'Emergency buffer',amount:buffer,kind:'buffer'});
  for(const d of debts.filter(x=>x.fixed&&x.balance>0).sort((a,b)=>debtPriorityScore(b)-debtPriorityScore(a))){const pay=Math.min(+d.monthly,d.balance,Math.max(0,available));if(pay>0){d.balance-=pay;available-=pay;payments.push({name:d.name,amount:pay,kind:'fixed'})}}
  for(const c of credits.filter(x=>x.balance>0)){
   const targetIdx=c.target?Math.max(0,(new Date(c.target+'-01')-nowMonth())/(30.44*86400000)):5;
   const urgency=Math.max(0,Math.min(1,(i+1)/Math.max(1,targetIdx||5)));
   const recommendedReuse=Math.max(0,(+c.reuse||0)*(1-urgency));
   const gross=Math.min(+c.payment||0,Math.max(0,available));
   const fee=+c.fee||0; const net=Math.max(0,gross-recommendedReuse-fee);
   if(gross>0){c.balance=Math.max(0,c.balance-net);available-=gross;payments.push({name:c.name,amount:gross,kind:'credit',note:recommendedReuse>1?`reuse ~${money(recommendedReuse)}`:'stop reuse'})}
  }
  // Whole-payment debts with a preferred month are treated as real deadlines.
  for(const d of debts.filter(x=>!x.fixed&&x.pieces===false&&x.balance>0&&(x.targetDate||x.targetMonth)).sort((a,b)=>(a.targetDate||a.targetMonth||'9999-99').localeCompare(b.targetDate||b.targetMonth||'9999-99')||debtPriorityScore(b)-debtPriorityScore(a))){
    const targetRaw=d.targetDate||(d.targetMonth?d.targetMonth+'-01':''); const targetDate=new Date(targetRaw+'T12:00:00'); const targetKey=targetRaw.slice(0,7);
    if(key<targetKey){
      const monthsLeft=Math.max(1,(targetDate.getFullYear()-date.getFullYear())*12+(targetDate.getMonth()-date.getMonth())+1);
      const need=Math.max(0,d.balance-d.reserved);
      const reserve=Math.min(Math.max(0,available),need/monthsLeft);
      if(reserve>0){d.reserved+=reserve;available-=reserve;payments.push({name:d.name,amount:reserve,kind:'whole-reserve',note:`reserve • final ${targetDate.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`})}
    }else if(key===targetKey){
      const need=Math.max(0,d.balance-d.reserved);const topUp=Math.min(Math.max(0,available),need);
      if(topUp>0){d.reserved+=topUp;available-=topUp}
      if(d.reserved+0.01>=d.balance){const pay=d.balance;d.balance=0;d.reserved=0;payments.push({name:d.name,amount:pay,kind:'whole',note:`FINAL DATE ${targetDate.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} • paid in full`})}
      else{payments.push({name:d.name,amount:d.reserved,kind:'whole-due',note:`TARGET MONTH • short ${money(d.balance-d.reserved)}`})}
    }else{
      const need=Math.max(0,d.balance-d.reserved);const topUp=Math.min(Math.max(0,available),need);
      if(topUp>0){d.reserved+=topUp;available-=topUp}
      if(d.reserved+0.01>=d.balance){const pay=d.balance;d.balance=0;d.reserved=0;payments.push({name:d.name,amount:pay,kind:'whole',note:'overdue target • paid in full'})}
      else{payments.push({name:d.name,amount:d.reserved,kind:'whole-due',note:`OVERDUE • short ${money(d.balance-d.reserved)}`})}
    }
  }
  for(const g of goals.filter(x=>x.saved<x.amount).sort((a,b)=>goalRank(b.priority)-goalRank(a.priority)||new Date(a.deadline)-new Date(b.deadline))){
   const deadline=new Date(g.deadline+'T12:00:00');const deadlineMonth=new Date(deadline.getFullYear(),deadline.getMonth(),1);const monthsLeft=Math.max(1,Math.round((deadlineMonth-date)/(30.44*86400000))+1);const need=g.amount-g.saved;const req=Math.min(need,need/monthsLeft,Math.max(0,available));if(req>0){g.saved+=req;available-=req;payments.push({name:g.name,amount:req,kind:'goal'})}
  }
  for(const d of debts.filter(x=>!x.fixed&&x.pieces!==false&&x.balance>0).sort((a,b)=>debtPriorityScore(b)-debtPriorityScore(a))){if(available<=0)break;const pay=Math.min(d.balance,+d.monthly||0,Math.max(+d.minimum||0,available*.45),available);if(pay>0){d.balance-=pay;available-=pay;payments.push({name:d.name,amount:pay,kind:'flex'})}}
  for(const d of debts.filter(x=>!x.fixed&&x.pieces===false&&x.balance>0&&!(x.targetDate||x.targetMonth)).sort((a,b)=>debtPriorityScore(b)-debtPriorityScore(a))){if(available>=d.balance){const pay=d.balance;d.balance=0;available-=pay;payments.push({name:d.name,amount:pay,kind:'whole',note:'paid in full'})}}
  const debtLeft=debts.reduce((sum,d)=>sum+d.balance,0)+credits.reduce((sum,c)=>sum+c.balance,0);
  rows.push({date,key,label:monthLabel(date),payments,free:Math.max(0,available),debtLeft});
  if(debtLeft<=0.01){clearedMonth=date;break}
 }
 return {rows,clearedMonth};
}

function renderRoadmap(){const r=buildRoadmap();const el=$('#roadmap');if(!r.rows.length||currentIncome()<=0){el.innerHTML='Add income and debts to build your timeline.';return}el.innerHTML=r.rows.map((m,i)=>`<div class="roadmap-month ${m.debtLeft<=0?'done':''}"><div class="roadmap-dot">${m.debtLeft<=0?'✓':i+1}</div><div class="roadmap-body"><div class="roadmap-top"><strong>${m.label}</strong><span>${m.debtLeft<=0?'Debt free':money(m.debtLeft)+' left'}</span></div><div class="roadmap-payments">${m.payments.length?m.payments.map(p=>`<span>${p.kind==='whole'?'★':'•'} ${esc(p.name)} ${money(p.amount)}${p.note?` <em>${esc(p.note)}</em>`:''}</span>`).join(''):'<span>No planned payments</span>'}${m.free>0?`<span class="free-line">Safe/free after plan: ${money(m.free)}</span>`:''}</div></div></div>`).join('');
 if(r.clearedMonth){$('#freedomHeadline').textContent=`You could be debt-free by ${monthLabel(r.clearedMonth)} 🎉`;$('#freedomMessage').textContent='Keep following the plan and your future monthly income becomes yours again. Small disciplined months can lead to a much lighter life.';$('#freedomBadge').textContent='♥ FREEDOM AHEAD'}else{$('#freedomHeadline').textContent='Your debt-free journey is mapped month by month.';$('#freedomMessage').textContent='The roadmap protects essentials first, then fixed EMIs, urgent goals and the smartest flexible repayments.';$('#freedomBadge').textContent='♥ KEEP GOING'}
}

function renderDashboard(){const p=buildPlan();const debt=state.debts.reduce((s,d)=>s+Number(d.balance),0)+state.credits.reduce((s,c)=>s+Number(c.balance),0);const goalNeed=state.goals.reduce((s,g)=>s+Math.max(0,+g.amount-+g.saved),0);$('#safeToSpend').textContent=money(p.free);$('#statIncome').textContent=money(p.income);$('#statMandatory').textContent=money(p.mandatory+p.essential);$('#statDebt').textContent=money(debt);$('#statGoals').textContent=money(goalNeed);let health='GOOD',msg='Your protected commitments are covered and you still have flexible money available.';if(p.income===0){health='SETUP';msg='Add your income and commitments to generate your plan.'}else if(p.shortfall>0){health='CRITICAL';msg=`Your protected commitments exceed available income by ${money(p.shortfall)}.`}else if(p.free<Math.max(200,p.income*.05)){health='TIGHT';msg='Your month is very tight. Avoid optional spending and protect upcoming payments.'}$('#healthBadge').textContent=health;$('#heroMessage').textContent=msg;
 const priority=p.allocations.slice(0,7);$('#priorityList').innerHTML=priority.length?priority.map((x,i)=>`<div class="priority-item"><div class="priority-rank">${i+1}</div><div class="item-main"><strong>${esc(x.name)}</strong><small>${esc(x.type)} • ${esc(x.priority)}</small></div><div class="item-amount">${money(x.amount)}</div></div>`).join(''):'No priorities yet.';
 const wholeSuggestions=buildRoadmap().rows.flatMap(m=>m.payments.filter(p=>p.kind==='whole').map(p=>({name:p.name,label:m.label,amount:p.amount}))).slice(0,3);
 const upcoming=[...state.debts.filter(d=>d.fixed).map(d=>({name:d.name,amount:Math.min(+d.monthly,+d.balance),days:(+d.dueDay-new Date().getDate()+31)%31})),...state.goals.map(g=>({name:g.name,amount:Math.max(0,+g.amount-+g.saved),days:daysUntil(g.deadline)}))].sort((a,b)=>a.days-b.days).slice(0,4);$('#upcomingList').innerHTML=(upcoming.length||wholeSuggestions.length)?upcoming.map(x=>`<div class="timeline-item"><div class="item-main"><strong>${esc(x.name)}</strong><small>${x.days<=0?'Due now':`Due in ${x.days} day${x.days===1?'':'s'}`}</small></div><div class="item-amount">${money(x.amount)}</div></div>`).join('')+wholeSuggestions.map(x=>`<div class="timeline-item smart-note"><div class="item-main"><strong>${esc(x.name)}</strong><small>Assistant suggests paying in full in ${x.label}</small></div><div class="item-amount">${money(x.amount)}</div></div>`).join(''):'Nothing due yet.';
 const segs=[['Mandatory',p.mandatory,'#ef4444'],['Living',p.essential,'#f59e0b'],['Goals',p.allocations.filter(a=>a.type==='Urgent goal').reduce((s,a)=>s+a.amount,0),'#8b5cf6'],['Debts',p.allocations.filter(a=>['Flexible debt','Whole debt payment','Target debt reserve'].includes(a.type)).reduce((s,a)=>s+a.amount,0),'#3b82f6'],['Buffer',p.buffer,'#10b981'],['Free',p.free,'#94a3b8']];const total=Math.max(p.income,1);$('#flowBar').innerHTML=segs.filter(s=>s[1]>0).map(s=>`<span class="flow-seg" style="width:${Math.max(1,s[1]/total*100)}%;background:${s[2]}"></span>`).join('');$('#flowLegend').innerHTML=segs.filter(s=>s[1]>0).map(s=>`<span><i class="legend-dot" style="background:${s[2]}"></i>${s[0]} ${money(s[1])}</span>`).join('');renderRoadmap()}

function renderPlan(){const i=state.income;$('#fixedIncome').value=i.fixed||'';$('#sideIncome').value=i.side||'';$('#tradingIncome').value=i.trading||'';$('#otherIncome').value=i.other||'';$('#essentialBudget').value=i.essential||'';$('#bufferTarget').value=i.buffer||'';const p=buildPlan();let text;if(!p.income)text='Enter your monthly income, then add debts and goals. I’ll calculate what is non-negotiable and how to use the rest.';else if(p.shortfall>0)text=`Your current protected commitments are ${money(p.shortfall)} above available income. Fixed EMIs and essentials should be protected first. Reduce flexible debt payments, pause optional purchases, or add income before taking on new commitments.`;else{text=`You have ${money(p.income)} available this month. After protected commitments, essential living costs and your emergency buffer, ${money(p.free)} remains safe and flexible.`;const whole=state.debts.filter(d=>!d.fixed&&d.pieces===false&&+d.balance>0);if(whole.length){const road=buildRoadmap();const suggestions=[];for(const d of whole){if(d.targetDate||d.targetMonth){const raw=d.targetDate||(d.targetMonth+'-01');const td=new Date(raw+'T12:00:00');const row=road.rows.find(m=>m.key===raw.slice(0,7));const shortage=row?.payments.find(p=>p.kind==='whole-due'&&p.name===d.name);suggestions.push(shortage?`${d.name} is targeted for ${monthLabel(td)}, but the current plan needs ${shortage.note.replace(/^.*short /,'')} more by then`:`${d.name} is protected for full payment in ${monthLabel(td)}`)}else{const hit=road.rows.find(m=>m.payments.some(p=>p.kind==='whole'&&p.name===d.name));if(hit)suggestions.push(`${d.name} can be paid in full in ${hit.label}`)}}if(suggestions.length)text+=` ${suggestions.join('. ')}.`}const critical=p.goalPlans.find(g=>g.priority==='critical');if(critical)text+=` For ${critical.name}, reserve about ${money(critical.monthly)} per month to reach ${money(critical.need)} by ${critical.deadline}.`;}$('#planSummary').textContent=text;$('#allocationTable').innerHTML=p.allocations.length?`<table><thead><tr><th>Priority</th><th>Allocation</th><th>Type</th><th>Amount</th></tr></thead><tbody>${p.allocations.map((a,i)=>`<tr><td>${i+1}</td><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td><strong>${money(a.amount)}</strong></td></tr>`).join('')}${p.free?`<tr><td>✓</td><td>Safe / flexible money</td><td>Available</td><td><strong>${money(p.free)}</strong></td></tr>`:''}</tbody></table>`:'No plan generated yet.'}
function renderTransactions(){const q=$('#txnSearch')?.value?.toLowerCase()||'',f=$('#txnTypeFilter')?.value||'all';let arr=[...state.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).filter(t=>(f==='all'||t.type===f)&&(`${t.type} ${t.category} ${t.note}`.toLowerCase().includes(q)));$('#transactionList').innerHTML=arr.length?arr.map(t=>`<div class="list-item"><div class="item-main"><strong>${esc(t.category||t.type)}</strong><small>${esc(t.type)} • ${esc(t.date)}${t.note?` • ${esc(t.note)}`:''}</small></div><div class="item-amount">${t.type==='Expense'||t.type==='Debt Payment'?'-':'+'}${money(t.amount)}</div><button class="text-btn" onclick="removeItem('transactions','${t.id}')">Delete</button></div>`).join(''):'No transactions found.'}
function renderDebts(){const p=buildPlan();const road=buildRoadmap();$('#debtCards').innerHTML=state.debts.length?state.debts.map(d=>{
 const alloc=p.allocations.find(a=>a.id===d.id);
 const wholeMonth=d.pieces===false?road.rows.find(m=>m.payments.some(x=>x.kind==='whole'&&x.name===d.name)):null;
 const targetDate=(d.targetDate||d.targetMonth)?new Date((d.targetDate||(d.targetMonth+'-01'))+'T12:00:00'):null;
 const targetRow=(d.targetDate||d.targetMonth)?road.rows.find(m=>m.key===(d.targetDate||d.targetMonth).slice(0,7)):null;
 const reserveNow=(d.targetDate||d.targetMonth)?road.rows[0]?.payments.find(x=>x.kind==='whole-reserve'&&x.name===d.name):null;
 const targetShort=targetRow?.payments.find(x=>x.kind==='whole-due'&&x.name===d.name);
 const pct=Math.min(100,Math.max(3,(+d.monthly/Math.max(+d.balance,1))*100));
 let assistant='';
 if(d.pieces===false&&(d.targetDate||d.targetMonth)){assistant=`Target: <strong>${monthLabel(targetDate)}</strong>. `;if(wholeMonth&&wholeMonth.key===(d.targetDate||d.targetMonth).slice(0,7))assistant+=`Plan: pay ${esc(d.name)} in full in your chosen month.`;else if(targetShort)assistant+=`Your chosen month stays protected, but the current plan is ${esc(targetShort.note.replace(/^.*short /,''))} short. Reduce flexible spending or add income before then.`;else if(reserveNow)assistant+=`Reserve <strong>${money(reserveNow.amount)}</strong> now toward the full payment.`;else assistant+=`The assistant will keep this as the preferred full-payment deadline.`}
 else if(d.pieces===false){assistant=wholeMonth?`Assistant: keep this aside and pay ${esc(d.name)} in full in <strong>${wholeMonth.label}</strong>.`:'Assistant: not safely fundable in the current roadmap yet.'}
 else assistant=`Assistant this month: <strong>${money(alloc?.amount||0)}</strong>`;
 return `<article class="mini-card debt-card-premium"><div class="debt-card-top"><span class="chip ${d.priority}">${d.fixed?'FIXED EMI':d.pieces===false?'FULL PAYMENT':'FLEXIBLE'}</span><span class="debt-stars">${d.priority==='critical'?'★★':'★'}</span></div><h3>${esc(d.name)}</h3><p>${esc(d.type)}${d.interest?` • ${d.rate}% interest`:''}</p><strong class="debt-balance">${money(d.balance)} remaining</strong><div class="progress"><span style="width:${pct}%"></span></div><p>${(d.targetDate||d.targetMonth)?`Final payment date: <strong>${d.targetDate?new Date(d.targetDate+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):monthLabel(targetDate)}</strong>`:`Normal payment: ${money(d.monthly)}`}${d.pieces===false?' • No partial payments':''}</p><p class="assistant-mini">${assistant}</p><div class="actions"><button onclick="recordDebtPayment('${d.id}')">Record payment</button><button onclick="editDebt('${d.id}')">Edit</button><button class="remove" onclick="removeItem('debts','${d.id}')">Delete</button></div></article>`
 }).join(''):'<div class="empty-state">Add your loans, BNPL, friend/family debts and fixed EMIs.</div>'}
function renderGoals(){const p=buildPlan();$('#goalCards').innerHTML=state.goals.length?state.goals.map(g=>{const gp=p.goalPlans.find(x=>x.id===g.id),pct=Math.min(100,(+g.saved/+g.amount)*100);return `<article class="mini-card"><span class="chip ${g.priority}">${g.priority.toUpperCase()}</span><h3>${esc(g.name)}</h3><p>Deadline: ${esc(g.deadline)} • ${daysUntil(g.deadline)} days left</p><strong>${money(Math.max(0,+g.amount-+g.saved))} still needed</strong><div class="progress"><span style="width:${pct}%"></span></div><p>Recommended reservation: <strong>${money(gp?.monthly||0)} / month</strong></p><div class="actions"><button onclick="addGoalSaving('${g.id}')">Add saving</button><button class="remove" onclick="removeItem('goals','${g.id}')">Delete</button></div></article>`}).join(''):'<div class="empty-state">Add important requirements such as a course, visa fee, laptop, medical cost or family payment.</div>'}
function renderCredits(){const p=buildPlan();$('#creditCards').innerHTML=state.credits.length?state.credits.map(c=>{const room=Math.max(0,p.free);let reuseRec=+c.reuse||0;if(room>+c.payment*.75)reuseRec=Math.max(0,reuseRec-Math.min(reuseRec,room*.5));const net=Math.max(0,+c.payment-reuseRec-(+c.fee||0));const months=net>0?Math.ceil(+c.balance/net):Infinity;const exit=reuseRec===0?'You can aim to stop reusing credit now.':`Recommended reuse this month: about ${money(reuseRec)}. Reduce reuse before increasing other flexible spending.`;return `<article class="mini-card"><span class="chip ${reuseRec===0?'good':'high'}">${reuseRec===0?'EXIT MODE':'REVOLVING'}</span><h3>${esc(c.name)}</h3><strong>${money(c.balance)} outstanding</strong><p>Typical payment ${money(c.payment)} • monthly cost ${money(c.fee)} • typical reuse ${money(c.reuse)}</p><p class="assistant-mini">${exit}</p><p>Net reduction about <strong>${money(net)}</strong> this month.${isFinite(months)?` Approx. ${months} month(s) to clear if maintained.`:''}</p><div class="actions"><button onclick="recordCreditPayment('${c.id}')">Record cycle</button><button onclick="editCredit('${c.id}')">Edit</button><button class="remove" onclick="removeItem('credits','${c.id}')">Delete</button></div></article>`}).join(''):'<div class="empty-state">Add Tabby Card, a credit card or another account where you repay and reuse available credit.</div>'}
function renderAccount(){const a=state.account||{};if($('#loginEmail'))$('#loginEmail').value=a.email||'';const status=$('#syncStatus');if(status){if(sb){status.textContent=a.email?'CLOUD SYNC ACTIVE':'SUPABASE CONNECTED';status.className='sync-pill connected'}else{status.textContent='CONNECTION ERROR';status.className='sync-pill'}}}
function renderAll(){renderDashboard();renderPlan();renderTransactions();renderDebts();renderGoals();renderCredits();renderAccount()}

window.removeItem=(kind,id)=>{if(!confirm('Delete this item?'))return;state[kind]=state[kind].filter(x=>x.id!==id);save();toast('Deleted')};
window.recordDebtPayment=id=>{const d=state.debts.find(x=>x.id===id);if(!d)return;const def=d.pieces===false?d.balance:(d.fixed?d.monthly:Math.min(d.monthly,d.balance));const v=Number(prompt(`Payment amount for ${d.name}:`,def));if(!v)return;if(d.pieces===false&&v<d.balance&&!confirm('This debt is marked “pay together”. Record a partial payment anyway?'))return;d.balance=Math.max(0,+d.balance-v);state.transactions.push({id:uid(),type:'Debt Payment',amount:v,category:d.name,date:new Date().toISOString().slice(0,10),note:'Debt repayment'});save();toast('Payment recorded')};
window.addGoalSaving=id=>{const g=state.goals.find(x=>x.id===id);const v=Number(prompt(`Amount saved for ${g.name}:`,0));if(!v)return;g.saved=Math.min(+g.amount,+g.saved+v);save();toast('Goal saving updated')};
window.recordCreditPayment=id=>{const c=state.credits.find(x=>x.id===id);const paid=Number(prompt(`Amount paid to ${c.name}:`,c.payment));if(!paid)return;const reused=Number(prompt('How much did you take/use back?',c.reuse||0))||0;c.balance=Math.max(0,+c.balance-paid+reused+(+c.fee||0));state.transactions.push({id:uid(),type:'Debt Payment',amount:paid,category:c.name,date:new Date().toISOString().slice(0,10),note:`Reused ${money(reused)}; fee ${money(c.fee)}`});save();toast('Credit cycle recorded')};
window.editDebt=id=>{const d=state.debts.find(x=>x.id===id);if(!d)return;editingDebtId=id;$('#debtName').value=d.name;$('#debtType').value=d.type;$('#debtBalance').value=d.balance;$('#debtFixed').value=d.fixed?'yes':'no';$('#debtMonthly').value=d.monthly;$('#debtDueDay').value=d.dueDay||1;$('#debtInterest').value=d.interest?'yes':'no';$('#debtRate').value=d.rate||0;$('#debtPriority').value=d.priority||'normal';$('#debtMinimum').value=d.minimum||0;$('#debtPieces').value=d.pieces===false?'no':'yes';$('#debtTargetDate').value=d.targetDate||(d.targetMonth?d.targetMonth+'-01':'');$('#debtSubmitBtn').textContent='Update Debt';openModal('debt')};
window.editCredit=id=>{const c=state.credits.find(x=>x.id===id);if(!c)return;editingCreditId=id;$('#creditName').value=c.name;$('#creditBalance').value=c.balance;$('#creditPayment').value=c.payment;$('#creditFee').value=c.fee||0;$('#creditReuse').value=c.reuse||0;$('#creditTarget').value=c.target||'';$('#creditSubmitBtn').textContent='Update Revolving Account';openModal('credit')};

function openModal(name){$(`#${name}Modal`).classList.add('open')}function closeModals(){$$('.modal').forEach(m=>m.classList.remove('open'));if(editingDebtId){editingDebtId=null;$('#debtSubmitBtn').textContent='Save Debt';$('#debtForm').reset()}if(editingCreditId){editingCreditId=null;$('#creditSubmitBtn').textContent='Save Revolving Account';$('#creditForm').reset()}}
$$('.close').forEach(b=>b.onclick=closeModals);$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModals()}));$$('[data-modal]').forEach(b=>b.onclick=()=>{if(b.dataset.modal==='debt'){editingDebtId=null;$('#debtSubmitBtn').textContent='Save Debt';$('#debtForm').reset()}if(b.dataset.modal==='credit'){editingCreditId=null;$('#creditSubmitBtn').textContent='Save Revolving Account';$('#creditForm').reset()}openModal(b.dataset.modal)});$('#quickAdd').onclick=()=>openModal('transaction');
$$('.nav-btn').forEach(b=>b.onclick=()=>{const v=b.dataset.view;$$('.nav-btn').forEach(x=>x.classList.toggle('active',x===b));$$('.view').forEach(x=>x.classList.remove('active'));$(`#${v}-view`).classList.add('active');$('#pageTitle').textContent=b.innerText.trim();$('#sidebar').classList.remove('open')});$$('[data-jump]').forEach(b=>b.onclick=()=>document.querySelector(`.nav-btn[data-view="${b.dataset.jump}"]`).click());function setView(view){$$('.view').forEach(v=>v.classList.remove('active'));const target=$('#'+view+'-view');if(target)target.classList.add('active');const titleMap={dashboard:'Dashboard',plan:'My Money Plan',transactions:'Transactions',debts:'Debt Manager',goals:'Urgent Goals',afford:'Can I Afford This?',credit:'Revolving Credit',account:'Account',settings:'Settings & Backup'};$('#pageTitle').textContent=titleMap[view]||'Fari Money Assistant';$$('.nav-btn,.mb-nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#sidebar')?.classList.remove('open');$('#mobileMoreSheet')?.classList.remove('open');window.scrollTo({top:0,behavior:'smooth'})}
$$('.nav-btn').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$$('.mb-nav[data-view],#mobileMoreSheet [data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#mobileMore')?.addEventListener('click',()=>$('#mobileMoreSheet')?.classList.toggle('open'));
$('#mobileAdd')?.addEventListener('click',()=>openModal('transaction'));
$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
$('#incomeForm').onsubmit=e=>{e.preventDefault();state.income={fixed:+$('#fixedIncome').value||0,side:+$('#sideIncome').value||0,trading:+$('#tradingIncome').value||0,other:+$('#otherIncome').value||0,essential:+$('#essentialBudget').value||0,buffer:+$('#bufferTarget').value||0};save();toast('Income and budget saved')};$('#generatePlanBtn').onclick=()=>{renderAll();toast('Money plan refreshed')};
$('#transactionForm').onsubmit=e=>{e.preventDefault();state.transactions.push({id:uid(),type:$('#txnType').value,amount:+$('#txnAmount').value,category:$('#txnCategory').value.trim(),date:$('#txnDate').value,note:$('#txnNote').value.trim()});e.target.reset();$('#txnDate').value=new Date().toISOString().slice(0,10);closeModals();save();toast('Transaction saved')};
$('#debtForm').onsubmit=e=>{e.preventDefault();const obj={name:$('#debtName').value.trim(),type:$('#debtType').value,balance:+$('#debtBalance').value,fixed:$('#debtFixed').value==='yes',monthly:+$('#debtMonthly').value,dueDay:+$('#debtDueDay').value,interest:$('#debtInterest').value==='yes',rate:+$('#debtRate').value||0,priority:$('#debtPriority').value,minimum:+$('#debtMinimum').value||0,pieces:$('#debtPieces').value==='yes',targetDate:$('#debtTargetDate').value,targetMonth:''};if(editingDebtId){Object.assign(state.debts.find(x=>x.id===editingDebtId),obj);editingDebtId=null;toast('Debt updated')}else{state.debts.push({id:uid(),...obj});toast('Debt added')}e.target.reset();$('#debtSubmitBtn').textContent='Save Debt';$$('.modal').forEach(m=>m.classList.remove('open'));save()};
$('#goalForm').onsubmit=e=>{e.preventDefault();state.goals.push({id:uid(),name:$('#goalName').value.trim(),amount:+$('#goalAmount').value,deadline:$('#goalDeadline').value,priority:$('#goalPriority').value,saved:+$('#goalSaved').value||0,full:$('#goalFull').value==='yes'});e.target.reset();$$('.modal').forEach(m=>m.classList.remove('open'));save();toast('Urgent goal added')};
$('#creditForm').onsubmit=e=>{e.preventDefault();const obj={name:$('#creditName').value.trim(),balance:+$('#creditBalance').value,payment:+$('#creditPayment').value,fee:+$('#creditFee').value||0,reuse:+$('#creditReuse').value||0,target:$('#creditTarget').value};if(editingCreditId){Object.assign(state.credits.find(x=>x.id===editingCreditId),obj);editingCreditId=null;toast('Revolving account updated')}else{state.credits.push({id:uid(),...obj});toast('Revolving account added')}e.target.reset();$('#creditSubmitBtn').textContent='Save Revolving Account';$$('.modal').forEach(m=>m.classList.remove('open'));save()};
$('#affordMethod').onchange=()=>{const custom=$('#affordMethod').value==='custom';$('#customMonthsWrap').classList.toggle('hidden',!custom);$('#customInterestWrap').classList.toggle('hidden',!custom)};
$('#affordForm').onsubmit=e=>{e.preventDefault();const p=buildPlan(),name=$('#affordName').value.trim(),cost=+$('#affordCost').value,method=$('#affordMethod').value;let months=1,total=cost,label='full payment';if(method==='pay4'){months=4;label='4 interest-free payments'}if(method==='custom'){months=Math.max(2,+$('#affordMonths').value||2);total=cost+(+$('#affordFee').value||0);label=`${months} installments`;}const monthly=total/months;const road=buildRoadmap(Math.max(months,4));const futureSafe=road.rows.slice(0,months).every(r=>r.free>=monthly);const nowSafe=p.free;let status,title,detail;if(monthly<=Math.max(0,nowSafe*.65)&&futureSafe&&p.shortfall===0){status='🟢 SAFE TO BUY';title=`Yes — ${name} fits your current and projected plan.`;detail=`Your first payment is ${money(monthly)} (${label}). The next ${months-1} projected month(s) also leave enough room for the installment after protected commitments.`}else if(monthly<=nowSafe&&p.shortfall===0){status='🟠 POSSIBLE, BUT TIGHT';title=`You can make the first payment, but ${name} could tighten a future month.`;detail=`The first payment is ${money(monthly)} and current safe money is ${money(nowSafe)}. One or more projected months have less breathing room, so buy only if it is important and keep the next installments reserved.`}else{status='🔴 NOT RECOMMENDED YET';title=`The current plan does not safely support ${name}.`;detail=`The required payment is ${money(monthly)}, while current safe/flexible money is about ${money(nowSafe)}. Consider postponing, reducing the cost, or creating an urgent goal.`}$('#affordResult').innerHTML=`<strong>${status}</strong><h3 style="margin:8px 0">${esc(title)}</h3><p>${esc(detail)}</p><p><strong>Total commitment:</strong> ${money(total)} • <strong>Per payment:</strong> ${money(monthly)} • <strong>Payments:</strong> ${months}</p>`};
$('#txnSearch').oninput=renderTransactions;$('#txnTypeFilter').onchange=renderTransactions;
$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`fari-money-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)};$('#importFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state={...cloneDefault(),...JSON.parse(r.result)};save();toast('Backup restored')}catch{alert('Invalid backup file')}};r.readAsText(f)};$('#resetBtn').onclick=()=>{if(confirm('This will permanently erase all local data. Continue?')){state=cloneDefault();save();toast('All data reset')}};

function initSupabase(){if(!window.supabase){sb=null;return}try{sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})}catch{sb=null}}
async function cloudSave(){if(!sb)return;const {data:{user}}=await sb.auth.getUser();if(!user)return;await sb.from('money_profiles').upsert({user_id:user.id,data:state,updated_at:new Date().toISOString()},{onConflict:'user_id'})}
async function cloudLoad(){if(!sb)return;const {data:{user}}=await sb.auth.getUser();if(!user)return;const {data}=await sb.from('money_profiles').select('data').eq('user_id',user.id).maybeSingle();if(data?.data){state={...cloneDefault(),...data.data,account:{...state.account,...(data.data.account||{})}};localStorage.setItem(KEY,JSON.stringify(state));renderAll();toast('Cloud data loaded')}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();if(!sb){toast('Cloud connection is unavailable. Please refresh and try again.');return}const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;const {error}=await sb.auth.signInWithPassword({email,password});if(error){alert(error.message);return}state.account.email=email;localStorage.setItem(KEY,JSON.stringify(state));await cloudLoad();renderAccount();toast('Logged in — cloud sync active ♥')};
$('#signupForm').onsubmit=async e=>{e.preventDefault();if(!sb){toast('Cloud connection is unavailable. Please refresh and try again.');return}const name=$('#signupName').value.trim()||'Fari',email=$('#signupEmail').value.trim(),password=$('#signupPassword').value;const {error}=await sb.auth.signUp({email,password,options:{data:{name}}});if(error){alert(error.message);return}state.account.name=name;state.account.email=email;localStorage.setItem(KEY,JSON.stringify(state));renderAccount();toast('Account created — check your email if confirmation is enabled')};

$('#txnDate').value=new Date().toISOString().slice(0,10);$('#goalDeadline').value=new Date(Date.now()+30*86400000).toISOString().slice(0,10);$('#todayText').textContent=new Date().toLocaleDateString('en-AE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});initSupabase();renderAll();if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{});

// Premium entry/login experience
(function initEntryGate(){
  const gate=document.getElementById('authGate');
  const actions=document.getElementById('authActions');
  const loginPanel=document.getElementById('gateLoginPanel');
  const createPanel=document.getElementById('gateCreatePanel');
  const show=(panel)=>{actions.style.display='none';loginPanel.classList.remove('open');createPanel.classList.remove('open');panel.classList.add('open')};
  document.getElementById('gateLoginBtn')?.addEventListener('click',()=>show(loginPanel));
  document.getElementById('gateCreateBtn')?.addEventListener('click',()=>show(createPanel));
  document.querySelectorAll('[data-auth-back]').forEach(b=>b.addEventListener('click',()=>{loginPanel.classList.remove('open');createPanel.classList.remove('open');actions.style.display='grid'}));
  document.getElementById('gateGuestBtn')?.addEventListener('click',()=>{sessionStorage.setItem('fariMoneyEntered','1');gate.classList.add('hidden')});
  loginPanel?.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!sb){toast('Supabase is not connected yet. Continue as Guest, then open Account & Login to add your Supabase details.');return}
    const email=document.getElementById('gateLoginEmail').value.trim(),password=document.getElementById('gateLoginPassword').value;
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){alert(error.message);return}
    state.account.email=email;localStorage.setItem(KEY,JSON.stringify(state));await cloudLoad();sessionStorage.setItem('fariMoneyEntered','1');gate.classList.add('hidden');renderAccount();toast('Welcome back — cloud sync active ♥');
  });
  createPanel?.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!sb){toast('Supabase is not connected yet. Continue as Guest, then open Account & Login to add your Supabase details.');return}
    const name=document.getElementById('gateSignupName').value.trim(),email=document.getElementById('gateSignupEmail').value.trim(),password=document.getElementById('gateSignupPassword').value;
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{name}}});
    if(error){alert(error.message);return}
    state.account.name=name||'Fari';state.account.email=email;localStorage.setItem(KEY,JSON.stringify(state));
    if(data?.session){await cloudSave();sessionStorage.setItem('fariMoneyEntered','1');gate.classList.add('hidden');renderAccount();toast('Account created — cloud sync active ♥');}
    else{toast('Account created. Confirm your email, then log in ♥');show(loginPanel);document.getElementById('gateLoginEmail').value=email;}
  });
  (async()=>{
    if(!sb)return;
    const {data:{session}}=await sb.auth.getSession();
    if(session?.user){state.account.email=session.user.email||state.account.email;state.account.name=session.user.user_metadata?.name||state.account.name;localStorage.setItem(KEY,JSON.stringify(state));await cloudLoad();sessionStorage.setItem('fariMoneyEntered','1');gate.classList.add('hidden');renderAccount();}
    sb.auth.onAuthStateChange(async(event,session)=>{if(event==='SIGNED_OUT'){state.account.email='';localStorage.setItem(KEY,JSON.stringify(state));sessionStorage.removeItem('fariMoneyEntered');gate.classList.remove('hidden');actions.style.display='grid';loginPanel.classList.remove('open');createPanel.classList.remove('open');renderAccount();}else if(session?.user){state.account.email=session.user.email||state.account.email;localStorage.setItem(KEY,JSON.stringify(state));renderAccount();}});
  })();
})();

const logoutBtn=document.getElementById('logoutBtn');if(logoutBtn)logoutBtn.onclick=async()=>{if(sb)await sb.auth.signOut();else{sessionStorage.removeItem('fariMoneyEntered');document.getElementById('authGate')?.classList.remove('hidden')}};
