const supabaseClient = window.supabase.createClient(
    "https://bznptwxancgraptnazqk.supabase.co",
    "sb_publishable_wVjPG2jLdFbqwjS7GWvb0A_Li9Wu2nV"
);

// Change these if your Supabase tables are named differently
const TABLES = { accounts: 'accounts', transactions: 'transactions', adjustments: 'adjustments' };

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n||0));
const today = () => new Date().toISOString().slice(0,10);
const oldKeys = {accounts:'ams_simple_accounts',transactions:'ams_simple_transactions',adjustments:'ams_simple_adjustments'};
function loadLocal(key){try{return JSON.parse(localStorage.getItem(key))||[]}catch{return []}}

let accounts=[], transactions=[], adjustments=[];
let toastTimer;

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function accountName(code){return accounts.find(a=>a.code===code)?.name||code}
function typeClass(type){return 'type-'+type.toLowerCase()}

// ---------- Supabase data layer ----------
// Your entry tables store accounts by id (debit_account_id / credit_account_id) and use transaction_date.
// These helpers translate between that and the account codes the screen uses.
const idOf   = code => accounts.find(a=>a.code===code)?.id;
const codeOf = id   => accounts.find(a=>a.id===id)?.code ?? String(id);
const DATE_COL = {transactions:'transaction_date',adjustments:'adjustment_date'};
const fromRow = (r,col) => ({id:r.id,date:r[col],description:r.description,debit:codeOf(r.debit_account_id),credit:codeOf(r.credit_account_id),amount:Number(r.amount)});
const toRow   = (e,col) => ({[col]:e.date,description:e.description,debit_account_id:idOf(e.debit),credit_account_id:idOf(e.credit),amount:e.amount});

async function loadAll(){
  const [a,t,j] = await Promise.all([
    supabaseClient.from(TABLES.accounts).select('*'),
    supabaseClient.from(TABLES.transactions).select('*'),
    supabaseClient.from(TABLES.adjustments).select('*')
  ]);
  const err = a.error || t.error || j.error;
  if(err){console.error(err);toast('Could not load data: '+err.message);return false}
  accounts = a.data || [];
  transactions = (t.data || []).map(r=>fromRow(r,DATE_COL.transactions));
  adjustments = (j.data || []).map(r=>fromRow(r,DATE_COL.adjustments));
  return true;
}

// One-time: if the online tables are empty but this browser has old local data, offer to upload it
async function migrateLocalData(){
  if(accounts.length||transactions.length||adjustments.length)return;
  const la=loadLocal(oldKeys.accounts), lt=loadLocal(oldKeys.transactions), lj=loadLocal(oldKeys.adjustments);
  if(!la.length&&!lt.length&&!lj.length)return;
  if(!confirm('Found data saved in this browser. Upload it to your online tables?'))return;
  if(la.length){
    const r=await supabaseClient.from(TABLES.accounts).insert(la.map(({code,name,type})=>({code,name,type})));
    if(r.error){console.error(r.error);return toast('Upload failed: '+r.error.message)}
    const re=await supabaseClient.from(TABLES.accounts).select('*'); // get the new ids
    if(re.error){console.error(re.error);return toast('Upload failed: '+re.error.message)}
    accounts=re.data||[];
  }
  const rows = (list,col) => list.map(e=>toRow(e,col)).filter(r=>r.debit_account_id!=null&&r.credit_account_id!=null);
  for(const [table,list,col] of [[TABLES.transactions,lt,DATE_COL.transactions],[TABLES.adjustments,lj,DATE_COL.adjustments]]){
    const rr=rows(list,col);
    if(!rr.length)continue;
    const r=await supabaseClient.from(table).insert(rr);
    if(r.error){console.error(r.error);return toast('Upload failed: '+r.error.message)}
  }
  await loadAll();
  toast('Local data uploaded.');
}

// ---------- Navigation / UI ----------
function showPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===page));document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));window.scrollTo({top:0,behavior:'smooth'})}
document.querySelectorAll('.nav-button').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
function toggleForm(id){$(id).classList.toggle('hidden');if(!$(id).classList.contains('hidden'))$(id).scrollIntoView({behavior:'smooth',block:'center'})}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.add('hidden')));
$('show-account-form').addEventListener('click',()=>toggleForm('account-form'));
$('show-transaction-form').addEventListener('click',()=>{fillAccountOptions();$('transaction-date').value=today();toggleForm('transaction-form')});
$('show-adjustment-form').addEventListener('click',()=>{fillAccountOptions();$('adjustment-date').value=today();toggleForm('adjustment-form')});
function fillAccountOptions(){['transaction-debit','transaction-credit','adjustment-debit','adjustment-credit'].forEach(id=>{const el=$(id),old=el.value;el.innerHTML='<option value="">Select account...</option>'+accounts.map(a=>`<option value="${escapeHtml(a.code)}">${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`).join('');if(accounts.some(a=>a.code===old))el.value=old})}

// ---------- Accounts ----------
function renderAccounts(){
 const q=$('account-search').value.toLowerCase(),list=accounts.filter(a=>`${a.code} ${a.name} ${a.type}`.toLowerCase().includes(q));
 $('account-count').textContent=`${list.length} account${list.length===1?'':'s'}`;
 $('accounts-body').innerHTML=list.length?list.slice().sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})).map(a=>`<tr><td>${escapeHtml(a.code)}</td><td><strong>${escapeHtml(a.name)}</strong></td><td><span class="type-tag ${typeClass(a.type)}">${escapeHtml(a.type)}</span></td><td>${['Asset','Expense'].includes(a.type)?'Debit':'Credit'}</td><td><button class="row-action" data-delete-account="${escapeHtml(a.code)}">Delete</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty-state">No accounts yet. Select “Add Account” to begin.</td></tr>';
 fillAccountOptions();
}
$('account-search').addEventListener('input',renderAccounts);

$('account-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.target;
  const code=$('account-code').value.trim(),name=$('account-name').value.trim(),type=$('account-type').value;
  if(accounts.some(a=>a.code===code))return toast('Account code already exists.');
  const {data,error}=await supabaseClient.from(TABLES.accounts).insert({code,name,type}).select().single();
  if(error){console.error(error);return toast('Could not save account: '+error.message)}
  accounts.push(data);
  renderAll();form.reset();form.classList.add('hidden');toast('Account saved.');
});

$('accounts-body').addEventListener('click',async e=>{
  const b=e.target.closest('[data-delete-account]');if(!b)return;
  const code=b.dataset.deleteAccount;
  if(transactions.concat(adjustments).some(t=>t.debit===code||t.credit===code))return toast('This account is used in an entry and cannot be deleted.');
  if(!confirm(`Delete account ${code}?`))return;
  const {error}=await supabaseClient.from(TABLES.accounts).delete().eq('code',code);
  if(error){console.error(error);return toast('Could not delete account: '+error.message)}
  accounts=accounts.filter(a=>a.code!==code);
  renderAll();toast('Account deleted.');
});

// ---------- Transactions & adjustments ----------
function renderEntries(kind){
  const adj=kind==='adjustment',list=adj?adjustments:transactions,prefix=adj?'adjustment':'transaction',q=$(prefix+'-search').value.toLowerCase(),body=$(adj?'adjustments-body':'transactions-body');
  const filtered=list.filter(t=>`${t.date} ${t.description} ${accountName(t.debit)} ${accountName(t.credit)}`.toLowerCase().includes(q));
  $(adj?'adjustment-count':'transaction-count').textContent=`${filtered.length} entr${filtered.length===1?'y':'ies'}`;
  body.innerHTML=filtered.length?filtered.slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.id).localeCompare(String(a.id),undefined,{numeric:true})).map(t=>`<tr><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.description)}</td><td>${escapeHtml(accountName(t.debit))}</td><td>${escapeHtml(accountName(t.credit))}</td><td class="number">${money(t.amount)}</td><td><button class="row-action" data-delete-entry="${escapeHtml(t.id)}" data-kind="${kind}">Delete</button></td></tr>`).join(''):`<tr><td colspan="6" class="empty-state">No ${adj?'adjustments':'transactions'} recorded yet.</td></tr>`;
}
$('transaction-search').addEventListener('input',()=>renderEntries('transaction'));
$('adjustment-search').addEventListener('input',()=>renderEntries('adjustment'));

document.body.addEventListener('click',async e=>{
  const b=e.target.closest('[data-delete-entry]');if(!b)return;
  const adj=b.dataset.kind==='adjustment',list=adj?adjustments:transactions;
  const entry=list.find(t=>String(t.id)===b.dataset.deleteEntry);
  if(!entry||!confirm(`Delete "${entry.description}"?`))return;
  const {error}=await supabaseClient.from(adj?TABLES.adjustments:TABLES.transactions).delete().eq('id',entry.id);
  if(error){console.error(error);return toast('Could not delete entry: '+error.message)}
  if(adj)adjustments=adjustments.filter(t=>t.id!==entry.id);else transactions=transactions.filter(t=>t.id!==entry.id);
  renderAll();toast('Entry deleted.');
});

async function saveEntry(e,adj){
  e.preventDefault();
  const form=e.target,p=adj?'adjustment':'transaction',debit=$(p+'-debit').value,credit=$(p+'-credit').value,amount=Number($(p+'-amount').value);
  if(!accounts.length)return toast('Add accounts in Chart of Accounts first.');
  if(!debit||!credit)return toast('Select both debit and credit accounts.');
  if(debit===credit)return toast('Debit and credit accounts must be different.');
  if(!Number.isFinite(amount)||amount<=0)return toast('Enter an amount greater than zero.');
  const dateCol=adj?DATE_COL.adjustments:DATE_COL.transactions;
  const entry={date:$(p+'-date').value,description:$(p+'-description').value.trim(),debit,credit,amount:Math.round(amount*100)/100};
  const {data,error}=await supabaseClient.from(adj?TABLES.adjustments:TABLES.transactions).insert(toRow(entry,dateCol)).select().single();
  if(error){console.error(error);return toast('Could not save entry: '+error.message)}
  (adj?adjustments:transactions).push(fromRow(data,dateCol));
  renderAll();form.reset();form.classList.add('hidden');toast(adj?'Adjustment saved.':'Transaction saved.');
}
$('transaction-form').addEventListener('submit',e=>saveEntry(e,false));
$('adjustment-form').addEventListener('submit',e=>saveEntry(e,true));

// ---------- Trial balance ----------
function getBalances(withAdjustments=true){const b={};accounts.forEach(a=>b[a.code]=0);(withAdjustments?transactions.concat(adjustments):transactions).forEach(t=>{b[t.debit]=(b[t.debit]||0)+Number(t.amount);b[t.credit]=(b[t.credit]||0)-Number(t.amount)});return b}
function renderTrial(){const b=getBalances($('trial-mode').value==='adjusted');let td=0,tc=0;$('trial-body').innerHTML=accounts.length?accounts.slice().sort((a,c)=>a.code.localeCompare(c.code,undefined,{numeric:true})).map(a=>{const v=b[a.code]||0,d=Math.max(v,0),c=Math.max(-v,0);td+=d;tc+=c;return `<tr><td>${escapeHtml(a.code)}</td><td>${escapeHtml(a.name)}</td><td class="number">${d>.0001?money(d):'—'}</td><td class="number">${c>.0001?money(c):'—'}</td></tr>`}).join(''):'<tr><td colspan="4" class="empty-state">No accounts to display yet.</td></tr>';$('trial-total-debit').textContent=money(td);$('trial-total-credit').textContent=money(tc);$('trial-debits').textContent=money(td);$('trial-credits').textContent=money(tc);const diff=Math.abs(td-tc),balanced=diff<.005;$('trial-difference').textContent=money(diff);$('trial-message').textContent=balanced?'Debits and credits are equal.':'Debits and credits do not match. Review your entries.';$('trial-message').classList.toggle('good',balanced)}
$('trial-mode').addEventListener('change',renderTrial);
function downloadCSV(filename,rows){const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n'),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
$('export-trial').addEventListener('click',()=>{const b=getBalances($('trial-mode').value==='adjusted'),rows=[['Account Code','Account Name','Debit (PHP)','Credit (PHP)']];let td=0,tc=0;accounts.slice().sort((a,c)=>a.code.localeCompare(c.code,undefined,{numeric:true})).forEach(a=>{const v=b[a.code]||0,d=Math.max(v,0),c=Math.max(-v,0);td+=d;tc+=c;rows.push([a.code,a.name,d?d.toFixed(2):'',c?c.toFixed(2):''])});rows.push(['','TOTAL',td.toFixed(2),tc.toFixed(2)]);downloadCSV('trial-balance.csv',rows)});

function renderAll(){renderAccounts();renderEntries('transaction');renderEntries('adjustment');renderTrial();renderStatements();renderPosition();renderCashflow();renderDashboard()}

// ---------- Financial statements (Income Statement & Statement of Owner's Equity) ----------
const period = {from:'', to:''};
const normType = a => String(a.type||'').toLowerCase();
// Contra accounts such as Accumulated Depreciation belong on the balance sheet, never on the income statement
const isContra  = a => /accumulated/i.test(a.name);
const isRevenue = a => !isContra(a)&&/revenue|income|sales/.test(normType(a));
const isExpense = a => !isContra(a)&&/expense|cost/.test(normType(a));
const isEquity  = a => /equity|capital|owner|draw/.test(normType(a));
const isDrawing = a => /draw|withdraw|dividend/.test(`${a.name} ${a.type}`.toLowerCase());

// Net debit balance per account (debit positive, credit negative) for entries that pass the filter.
// Statements always use adjusted figures (transactions + adjustments).
function balancesWhere(filter){
  const b={};accounts.forEach(a=>b[a.code]=0);
  transactions.concat(adjustments).filter(filter).forEach(t=>{
    b[t.debit]=(b[t.debit]||0)+Number(t.amount);
    b[t.credit]=(b[t.credit]||0)-Number(t.amount);
  });
  return b;
}
const inPeriod=t=>(!period.from||t.date>=period.from)&&(!period.to||t.date<=period.to);
const beforePeriod=t=>!!period.from&&t.date<period.from;
const byCode=(a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true});
const sum=list=>list.reduce((s,x)=>s+x.v,0);
const visible=v=>Math.abs(v)>=0.005;

function computeStatements(){
  const bal=balancesWhere(inPeriod);
  const revenues=accounts.filter(isRevenue).sort(byCode).map(a=>({a,v:-(bal[a.code]||0)})).filter(x=>visible(x.v));
  const expenses=accounts.filter(isExpense).sort(byCode).map(a=>({a,v:bal[a.code]||0})).filter(x=>visible(x.v));
  const totalRevenue=sum(revenues),totalExpenses=sum(expenses),netIncome=totalRevenue-totalExpenses;

  // Beginning capital = everything that has accumulated in equity, revenue and expense accounts before the period
  let beginning=0;
  if(period.from){
    const before=balancesWhere(beforePeriod);
    beginning=-accounts.filter(a=>isEquity(a)||isRevenue(a)||isExpense(a)).reduce((s,a)=>s+(before[a.code]||0),0);
  }
  const investments=accounts.filter(a=>isEquity(a)&&!isDrawing(a)).sort(byCode).map(a=>({a,v:-(bal[a.code]||0)})).filter(x=>visible(x.v));
  const drawings=accounts.filter(a=>isEquity(a)&&isDrawing(a)).sort(byCode).map(a=>({a,v:bal[a.code]||0})).filter(x=>visible(x.v));
  const totalInvestments=sum(investments),totalDrawings=sum(drawings);
  const ending=beginning+totalInvestments+netIncome-totalDrawings;
  return {revenues,expenses,totalRevenue,totalExpenses,netIncome,beginning,investments,drawings,totalInvestments,totalDrawings,ending};
}

function periodLabel(){
  const f=period.from,t=period.to;
  if(f&&t)return `For the period ${f} to ${t}`;
  if(f)return `From ${f} onward`;
  if(t)return `Up to ${t}`;
  return 'For all recorded dates';
}
const stmtRow=(label,amount,cls='')=>`<tr class="${cls}"><td>${label}</td><td class="number">${amount}</td></tr>`;
const stmtLines=list=>list.map(x=>stmtRow(`<span class="stmt-indent">${escapeHtml(x.a.code)} — ${escapeHtml(x.a.name)}</span>`,money(x.v))).join('');

function renderStatements(){
  if(!$('income-body')||!$('equity-body'))return;
  const s=computeStatements();
  document.querySelectorAll('.fs-from').forEach(el=>{if(el.value!==period.from)el.value=period.from});
  document.querySelectorAll('.fs-to').forEach(el=>{if(el.value!==period.to)el.value=period.to});
  document.querySelectorAll('.stmt-period').forEach(el=>el.textContent=periodLabel());
  const loss=s.netIncome<0,netLabel=loss?'Net Loss':'Net Income';

  $('income-revenues').textContent=money(s.totalRevenue);
  $('income-expenses').textContent=money(s.totalExpenses);
  $('income-net-label').textContent=netLabel;
  $('income-net').textContent=money(Math.abs(s.netIncome));
  $('income-body').innerHTML=
    stmtRow('Revenues','','stmt-head')+
    (s.revenues.length?stmtLines(s.revenues):stmtRow('<span class="stmt-indent stmt-muted">No revenue recorded</span>',''))+
    stmtRow('Total Revenues',money(s.totalRevenue),'stmt-total')+
    stmtRow('Expenses','','stmt-head')+
    (s.expenses.length?stmtLines(s.expenses):stmtRow('<span class="stmt-indent stmt-muted">No expenses recorded</span>',''))+
    stmtRow('Total Expenses',money(s.totalExpenses),'stmt-total')+
    stmtRow(netLabel,money(Math.abs(s.netIncome)),'stmt-grand '+(loss?'stmt-loss':'stmt-profit'));

  $('equity-beginning').textContent=money(s.beginning);
  $('equity-net-label').textContent=netLabel;
  $('equity-net').textContent=money(Math.abs(s.netIncome));
  $('equity-ending').textContent=money(s.ending);
  $('equity-body').innerHTML=
    stmtRow("Owner's capital, beginning",money(s.beginning),'stmt-total')+
    (s.investments.length?stmtRow('Add: Investments','','stmt-head')+stmtLines(s.investments):'')+
    stmtRow(loss?'Less: Net Loss':'Add: Net Income',money(Math.abs(s.netIncome)))+
    (s.drawings.length?stmtRow('Less: Drawings','','stmt-head')+stmtLines(s.drawings):'')+
    stmtRow("Owner's capital, ending",money(s.ending),'stmt-grand');
}

function initStatementControls(){
  document.querySelectorAll('.fs-from').forEach(el=>el.addEventListener('change',e=>{period.from=e.target.value;renderStatements()}));
  document.querySelectorAll('.fs-to').forEach(el=>el.addEventListener('change',e=>{period.to=e.target.value;renderStatements()}));
  document.querySelectorAll('.fs-clear').forEach(el=>el.addEventListener('click',()=>{period.from='';period.to='';renderStatements()}));

  $('export-income').addEventListener('click',()=>{
    const s=computeStatements(),n=x=>x.toFixed(2);
    const rows=[['Income Statement',periodLabel()],['Account','Amount (PHP)'],['Revenues','']];
    s.revenues.forEach(x=>rows.push([`${x.a.code} ${x.a.name}`,n(x.v)]));
    rows.push(['Total Revenues',n(s.totalRevenue)],['Expenses','']);
    s.expenses.forEach(x=>rows.push([`${x.a.code} ${x.a.name}`,n(x.v)]));
    rows.push(['Total Expenses',n(s.totalExpenses)],[s.netIncome<0?'Net Loss':'Net Income',n(Math.abs(s.netIncome))]);
    downloadCSV('income-statement.csv',rows);
  });
  $('export-equity').addEventListener('click',()=>{
    const s=computeStatements(),n=x=>x.toFixed(2);
    const rows=[["Statement of Owner's Equity",periodLabel()],['Item','Amount (PHP)'],["Owner's capital, beginning",n(s.beginning)]];
    s.investments.forEach(x=>rows.push([`Add: ${x.a.code} ${x.a.name}`,n(x.v)]));
    rows.push([s.netIncome<0?'Less: Net Loss':'Add: Net Income',n(Math.abs(s.netIncome))]);
    s.drawings.forEach(x=>rows.push([`Less: ${x.a.code} ${x.a.name}`,n(x.v)]));
    rows.push(["Owner's capital, ending",n(s.ending)]);
    downloadCSV('owners-equity.csv',rows);
  });
}


// ---------- Statement of Financial Position & Cash Flows ----------
const positionDate={to:''}, cashPeriod={from:'',to:''};
function balanceAt(date){
  const b={};accounts.forEach(a=>b[a.code]=0);
  transactions.concat(adjustments).filter(t=>!date||t.date<=date).forEach(t=>{
    b[t.debit]=(b[t.debit]||0)+Number(t.amount);b[t.credit]=(b[t.credit]||0)-Number(t.amount);
  });return b;
}
function renderPosition(){
  const b=balanceAt(positionDate.to);
  const assets=accounts.filter(a=>normType(a)==='asset').sort(byCode).map(a=>({a,v:b[a.code]||0})).filter(x=>visible(x.v));
  const liabilities=accounts.filter(a=>normType(a)==='liability').sort(byCode).map(a=>({a,v:-(b[a.code]||0)})).filter(x=>visible(x.v));
  const equity=accounts.filter(isEquity).sort(byCode).map(a=>({a,v:-(b[a.code]||0)})).filter(x=>visible(x.v));
  const net=accounts.filter(isRevenue).reduce((s,a)=>s-(b[a.code]||0),0)-accounts.filter(isExpense).reduce((s,a)=>s+(b[a.code]||0),0);
  const drawings=equity.filter(x=>isDrawing(x.a)).reduce((s,x)=>s+x.v,0);
  const capital=equity.filter(x=>!isDrawing(x.a));
  const totalAssets=sum(assets),totalLiabilities=sum(liabilities),totalEquity=sum(capital)+net-drawings;
  $('position-period').textContent=positionDate.to?'As of '+positionDate.to:'As of all recorded dates';
  $('position-body').innerHTML=stmtRow('Assets','','stmt-head')+(assets.length?stmtLines(assets):stmtRow('<span class="stmt-indent stmt-muted">No asset balances</span>',''))+stmtRow('Total Assets',money(totalAssets),'stmt-total')+
    stmtRow('Liabilities','','stmt-head')+(liabilities.length?stmtLines(liabilities):stmtRow('<span class="stmt-indent stmt-muted">No liability balances</span>',''))+stmtRow('Total Liabilities',money(totalLiabilities),'stmt-total')+
    stmtRow("Owner's Equity",'','stmt-head')+(capital.length?stmtLines(capital):stmtRow('<span class="stmt-indent stmt-muted">No capital balances</span>',''))+stmtRow(net<0?'Less: Net Loss':'Add: Net Income',money(Math.abs(net)))+(drawings?stmtRow('Less: Drawings',money(drawings)):'')+stmtRow('Total Owner’s Equity',money(totalEquity),'stmt-total')+stmtRow('Total Liabilities and Equity',money(totalLiabilities+totalEquity),'stmt-grand');
  const diff=totalAssets-totalLiabilities-totalEquity;
  $('position-message').textContent=Math.abs(diff)<.005?'Statement balances.':'Difference: '+money(diff)+' — review account classifications and balances.';
  $('position-message').classList.toggle('good',Math.abs(diff)<.005);
}
function isCashAccount(a){return /cash|bank/i.test(a.name)}
function renderCashflow(){
  const cashAccounts=accounts.filter(isCashAccount),cashCodes=new Set(cashAccounts.map(a=>a.code));
  const rows=transactions.filter(t=>(!cashPeriod.from||t.date>=cashPeriod.from)&&(!cashPeriod.to||t.date<=cashPeriod.to));
  let operating=0,investing=0,financing=0;
  rows.forEach(t=>{
    const debitCash=cashCodes.has(t.debit),creditCash=cashCodes.has(t.credit);
    if(debitCash===creditCash)return;
    const other=accounts.find(a=>a.code===(debitCash?t.credit:t.debit));if(!other)return;
    const flow=(debitCash?1:-1)*Number(t.amount),typ=normType(other);
    if(typ==='asset'&&!isCashAccount(other))investing+=flow;
    else if(typ==='liability'||typ==='equity')financing+=flow;
    else operating+=flow;
  });
  const net=operating+investing+financing;
  const f=cashPeriod.from,t=cashPeriod.to;
  $('cashflow-period').textContent=f&&t?`For ${f} to ${t}`:f?`From ${f} onward`:t?`Up to ${t}`:'For all recorded dates';
  $('cashflow-body').innerHTML=stmtRow('Operating Activities','','stmt-head')+stmtRow('Net Cash from Operating Activities',money(operating),'stmt-total')+stmtRow('Investing Activities','','stmt-head')+stmtRow('Net Cash from Investing Activities',money(investing),'stmt-total')+stmtRow('Financing Activities','','stmt-head')+stmtRow('Net Cash from Financing Activities',money(financing),'stmt-total')+stmtRow('Net Increase (Decrease) in Cash',money(net),'stmt-grand');
}
function initExtraStatements(){
  $('position-date').addEventListener('change',e=>{positionDate.to=e.target.value;renderPosition()});
  $('position-clear').addEventListener('click',()=>{positionDate.to='';$('position-date').value='';renderPosition()});
  ['cash-from','cash-to'].forEach(id=>$(id).addEventListener('change',e=>{cashPeriod[id==='cash-from'?'from':'to']=e.target.value;renderCashflow()}));
  $('cash-clear').addEventListener('click',()=>{cashPeriod.from='';cashPeriod.to='';$('cash-from').value='';$('cash-to').value='';renderCashflow()});
  $('export-position').addEventListener('click',()=>downloadCSV('statement-of-financial-position.csv',[['Statement of Financial Position',$('position-period').textContent],['Item','Amount (PHP)'],...Array.from($('position-body').rows).map(r=>[r.cells[0].innerText,r.cells[1].innerText])]));
  $('export-cashflow').addEventListener('click',()=>downloadCSV('statement-of-cash-flows.csv',[['Statement of Cash Flows',$('cashflow-period').textContent],['Item','Amount (PHP)'],...Array.from($('cashflow-body').rows).map(r=>[r.cells[0].innerText,r.cells[1].innerText])]));
}

// ---------- Dashboard ----------
function renderDashboard(){
  if(!$('dash-total'))return;
  const all=transactions.concat(adjustments),known=new Set(accounts.map(a=>a.code));
  // An entry counts as "recorded" when it is a complete, balanced debit/credit pair on existing accounts
  const isRecorded=t=>known.has(t.debit)&&known.has(t.credit)&&t.debit!==t.credit&&Number(t.amount)>0;
  const total=all.length,recorded=all.filter(isRecorded).length,pending=total-recorded;

  $('dash-total').textContent=total;
  $('dash-recorded').textContent=recorded;
  $('dash-pending').textContent=pending;
  $('dash-original').textContent=transactions.length;
  $('dash-adjusting').textContent=adjustments.length;

  // Trial balance status (adjusted)
  const bal=getBalances(true);let td=0,tc=0;
  accounts.forEach(a=>{const v=bal[a.code]||0;td+=Math.max(v,0);tc+=Math.max(-v,0)});
  const trial=$('dash-trial');
  trial.classList.remove('dash-green','dash-red');
  if(!total){trial.textContent='No entries yet'}
  else if(Math.abs(td-tc)<.005){trial.textContent='Balanced ✓';trial.classList.add('dash-green')}
  else{trial.textContent='Out of balance';trial.classList.add('dash-red')}
  trial.style.fontSize='18px';

  // Net income across all dates
  const all0=balancesWhere(()=>true);
  const net=accounts.filter(isRevenue).reduce((s,a)=>s-(all0[a.code]||0),0)-accounts.filter(isExpense).reduce((s,a)=>s+(all0[a.code]||0),0);
  $('dash-net-label').textContent=net<0?'Net Loss':'Net Income';
  $('dash-net').textContent=money(Math.abs(net));
  $('dash-net').classList.toggle('dash-red',net<0);

  // Donut chart (plain SVG, no library needed)
  const R=60,C=2*Math.PI*R,rf=total?recorded/total:0,pf=total?pending/total:0;
  const ring=(color,len,offset)=>`<circle cx="80" cy="80" r="${R}" fill="none" stroke="${color}" stroke-width="22" stroke-dasharray="${len} ${C}" stroke-dashoffset="${offset}" transform="rotate(-90 80 80)"/>`;
  const pr=total?Math.round(rf*100):0,pp=total?100-pr:0;
  $('dash-donut').innerHTML=
    `<svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="${R}" fill="none" stroke="#e8edf5" stroke-width="22"/>`+
    (recorded?ring('#177c60',rf*C,0):'')+
    (pending?ring('#b7791f',pf*C,-rf*C):'')+
    `</svg><div class="donut-center">${total?`${pr}% recorded`:'No entries yet'}</div>`;
  $('dash-legend').innerHTML=
    `<li><i style="background:#177c60"></i>Recorded — ${recorded} (${pr}%)</li>`+
    `<li><i style="background:#b7791f"></i>Pending — ${pending} (${pp}%)</li>`;
}

// ---------- Authentication ----------
// The sign-in form and Sign out button live in index.html; this wires them up.
let signUpMode=false;
function setAuthMode(on){
  signUpMode=on;
  $('login-title').textContent=on?'Create account':'Sign in';
  $('login-submit').textContent=on?'Create account':'Sign in';
  $('login-toggle').textContent=on?'Already have an account? Sign in':'No account yet? Create one';
  $('login-password').autocomplete=on?'new-password':'current-password';
  setAuthMessage('');
}
function setAuthMessage(text,ok=false){const el=$('login-error');el.textContent=text;el.classList.toggle('ok',ok)}

function initAuthUI(){
  $('login-toggle').addEventListener('click',()=>setAuthMode(!signUpMode));
  $('logout-btn').addEventListener('click',()=>supabaseClient.auth.signOut());
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('login-submit'),label=btn.textContent;
    const email=$('login-email').value.trim(),password=$('login-password').value;
    setAuthMessage('');btn.disabled=true;btn.textContent='Please wait…';
    const done=()=>{btn.disabled=false;btn.textContent=label};
    if(signUpMode){
      if(password.length<6){done();return setAuthMessage('Password must be at least 6 characters.')}
      const {data,error}=await supabaseClient.auth.signUp({email,password});
      done();
      if(error)return setAuthMessage(error.message);
      if(!data.session){ // email confirmation is turned on in Supabase
        setAuthMode(false);
        return setAuthMessage('Account created. Check your email to confirm it, then sign in.',true);
      }
      $('login-form').reset();
      return; // signed in automatically; onAuthStateChange handles the rest
    }
    const {error}=await supabaseClient.auth.signInWithPassword({email,password});
    done();
    if(error)return setAuthMessage(error.message);
    $('login-form').reset();
  });
}

function showLogin(){$('auth-overlay').classList.add('show');$('logout-btn').classList.add('hidden');setTimeout(()=>$('login-email').focus(),0)}
function showApp(){$('auth-overlay').classList.remove('show');$('logout-btn').classList.remove('hidden')}

async function startApp(){
  showApp();
  toast('Loading data…');
  if(await loadAll()){
    await migrateLocalData();
    renderAll();
    toast('Data loaded.');
  }
}

function clearData(){accounts=[];transactions=[];adjustments=[];renderAll()}

// ---------- Startup ----------
(async function init(){
  initAuthUI();
  initStatementControls();
  initExtraStatements();
  renderAll();
  let started=false;
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){started=false;clearData();showLogin()}
    else if(session&&!started&&(event==='SIGNED_IN'||event==='INITIAL_SESSION')){started=true;setTimeout(startApp,0)}
  });
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session)showLogin();
})();