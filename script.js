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
const fromRow = r => ({id:r.id,date:r.transaction_date,description:r.description,debit:codeOf(r.debit_account_id),credit:codeOf(r.credit_account_id),amount:Number(r.amount)});
const toRow   = e => ({transaction_date:e.date,description:e.description,debit_account_id:idOf(e.debit),credit_account_id:idOf(e.credit),amount:e.amount});

async function loadAll(){
  const [a,t,j] = await Promise.all([
    supabaseClient.from(TABLES.accounts).select('*'),
    supabaseClient.from(TABLES.transactions).select('*'),
    supabaseClient.from(TABLES.adjustments).select('*')
  ]);
  const err = a.error || t.error || j.error;
  if(err){console.error(err);toast('Could not load data: '+err.message);return false}
  accounts = a.data || [];
  transactions = (t.data || []).map(fromRow);
  adjustments = (j.data || []).map(fromRow);
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
  const rows = list => list.map(toRow).filter(r=>r.debit_account_id!=null&&r.credit_account_id!=null);
  for(const [table,list] of [[TABLES.transactions,lt],[TABLES.adjustments,lj]]){
    const rr=rows(list);
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
  const entry={date:$(p+'-date').value,description:$(p+'-description').value.trim(),debit,credit,amount:Math.round(amount*100)/100};
  const {data,error}=await supabaseClient.from(adj?TABLES.adjustments:TABLES.transactions).insert(toRow(entry)).select().single();
  if(error){console.error(error);return toast('Could not save entry: '+error.message)}
  (adj?adjustments:transactions).push(fromRow(data));
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

function renderAll(){renderAccounts();renderEntries('transaction');renderEntries('adjustment');renderTrial()}

// ---------- Authentication ----------
let loginEl, logoutBtn;

function buildAuthUI(){
  loginEl=document.createElement('div');
  loginEl.style.cssText='position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:Canvas;padding:16px';
  loginEl.innerHTML=`
    <form id="login-form" style="width:100%;max-width:360px;display:flex;flex-direction:column;gap:12px;color:CanvasText;font-family:inherit">
      <h2 id="login-title" style="margin:0 0 4px">Sign in</h2>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:14px">Email
        <input id="login-email" type="email" autocomplete="username" required style="padding:10px;font:inherit;border:1px solid GrayText;border-radius:8px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:14px">Password
        <input id="login-password" type="password" autocomplete="current-password" required style="padding:10px;font:inherit;border:1px solid GrayText;border-radius:8px">
      </label>
      <button id="login-submit" type="submit" style="padding:10px;font:inherit;font-weight:600;border-radius:8px;cursor:pointer">Sign in</button>
      <p id="login-error" style="margin:0;color:#c0392b;font-size:14px;min-height:1.2em"></p>
      <button id="login-toggle" type="button" style="background:none;border:none;padding:0;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer;color:inherit;text-align:left">No account yet? Create one</button>
    </form>`;
  document.body.appendChild(loginEl);

  logoutBtn=document.createElement('button');
  logoutBtn.textContent='Sign out';
  logoutBtn.style.cssText='position:fixed;top:10px;right:10px;z-index:9000;display:none;padding:6px 12px;font:inherit;font-size:13px;border-radius:8px;cursor:pointer';
  document.body.appendChild(logoutBtn);

  let signUpMode=false;
  function setMode(on){
    signUpMode=on;
    $('login-title').textContent=on?'Create account':'Sign in';
    $('login-submit').textContent=on?'Create account':'Sign in';
    $('login-toggle').textContent=on?'Already have an account? Sign in':'No account yet? Create one';
    $('login-password').autocomplete=on?'new-password':'current-password';
    $('login-error').textContent='';
  }
  $('login-toggle').addEventListener('click',()=>setMode(!signUpMode));

  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('login-submit'),err=$('login-error'),label=btn.textContent;
    const email=$('login-email').value.trim(),password=$('login-password').value;
    err.style.color='#c0392b';err.textContent='';btn.disabled=true;btn.textContent='Please wait…';
    if(signUpMode){
      if(password.length<6){btn.disabled=false;btn.textContent=label;err.textContent='Password must be at least 6 characters.';return}
      const {data,error}=await supabaseClient.auth.signUp({email,password});
      btn.disabled=false;btn.textContent=label;
      if(error){err.textContent=error.message;return}
      if(!data.session){
        // Email confirmation is turned on in Supabase
        err.style.color='#2e8b57';
        err.textContent='Account created. Check your email to confirm it, then sign in.';
        setMode(false);
        err.style.color='#2e8b57';
        err.textContent='Account created. Check your email to confirm it, then sign in.';
        return;
      }
      $('login-form').reset();
      return; // signed in automatically; onAuthStateChange handles the rest
    }
    const {error}=await supabaseClient.auth.signInWithPassword({email,password});
    btn.disabled=false;btn.textContent=label;
    if(error){err.textContent=error.message;return}
    $('login-form').reset();
  });
  logoutBtn.addEventListener('click',()=>supabaseClient.auth.signOut());
}

function showLogin(){loginEl.style.display='flex';logoutBtn.style.display='none';setTimeout(()=>$('login-email').focus(),0)}
function showApp(){loginEl.style.display='none';logoutBtn.style.display='block'}

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
  buildAuthUI();
  renderAll();
  let started=false;
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){started=false;clearData();showLogin()}
    else if(session&&!started&&(event==='SIGNED_IN'||event==='INITIAL_SESSION')){started=true;setTimeout(startApp,0)}
  });
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session)showLogin();
})();