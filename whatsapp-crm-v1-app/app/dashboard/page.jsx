'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase-browser'
import { useRouter } from 'next/navigation'

const DEFAULT_TAGS=['Lead','Existing Customer','Past Customer','Photography','Cinematography','Wedding','Event','Birthday','Portrait','Property','Website','SEO','Google Business Profile','VIP','Follow-up','Do Not Contact']

function normalizePhone(value=''){
  let p=String(value).trim().replace(/[\s().-]/g,'')
  if(!p) return ''
  if(p.startsWith('00')) p='+'+p.slice(2)
  if(p.startsWith('+')) return p
  if(/^0\d{9,14}$/.test(p)) return '+234'+p.slice(1)
  return p
}
function parseCSV(text){
  const rows=[]; let row=[]; let cell=''; let quoted=false
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1]
    if(ch==='"' && quoted && next==='"'){cell+='"';i++;continue}
    if(ch==='"'){quoted=!quoted;continue}
    if(ch===',' && !quoted){row.push(cell.trim());cell='';continue}
    if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell.trim());cell='';if(row.some(v=>v!==''))rows.push(row);row=[];continue}
    cell+=ch
  }
  row.push(cell.trim()); if(row.some(v=>v!==''))rows.push(row)
  if(!rows.length)return []
  const headers=rows[0].map(h=>h.toLowerCase().replace(/[^a-z0-9]+/g,'_'))
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]||''])))
}
function cleanKey(v=''){return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function firstValue(row,keys){for(const key of keys){const v=row[key]??row[cleanKey(key)];if(v!==undefined&&String(v).trim()!=='')return String(v).trim()}return ''}
function mapImportedRow(r,rowNumber){
  const name=firstValue(r,['name','full_name','fullname','display_name','contact_name','customer','first_name'])
  const phone=normalizePhone(firstValue(r,['phone','whatsapp','whatsapp_number','mobile','mobile_number','phone_number','telephone','tel']))
  const email=firstValue(r,['email','email_address'])||null
  const opted_in=/^(yes|true|1|y|opted in|opted_in)$/i.test(firstValue(r,['opt_in','opted_in','marketing_opt_in','marketing_consent']))
  const notes=firstValue(r,['notes','note','comment'])||null
  return {row:rowNumber,name,phone,email,opted_in,notes}
}
function parseVCF(text){
  const unfolded=text.replace(/\r?\n[ \t]/g,'').split(/\r?\n/); const cards=[]; let current=null
  for(const line of unfolded){
    if(line.toUpperCase()==='BEGIN:VCARD'){current={};continue}
    if(line.toUpperCase()==='END:VCARD'){if(current)cards.push(current);current=null;continue}
    if(!current)continue
    const idx=line.indexOf(':');if(idx<0)continue
    const rawKey=line.slice(0,idx),value=line.slice(idx+1).trim(),key=rawKey.split(';')[0].toUpperCase()
    if(key==='FN')current.name=value
    else if(key==='N'&&!current.name)current.name=value.split(';').filter(Boolean).reverse().join(' ')
    else if(key==='TEL'&&!current.phone)current.phone=value
    else if(key==='EMAIL'&&!current.email)current.email=value
    else if(key==='NOTE')current.notes=value.replace(/\\n/g,' ')
  }
  return cards.map((r,i)=>mapImportedRow(r,i+1))
}
async function parseImportFile(file){
  const ext=file.name.toLowerCase().split('.').pop()
  if(ext==='csv')return parseCSV(await file.text()).map((r,i)=>mapImportedRow(r,i+2))
  if(ext==='vcf'||ext==='vcard')return parseVCF(await file.text())
  if(ext==='xlsx'||ext==='xls'){
    const XLSX=await import('xlsx'); const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}); const rows=[]
    for(const sheetName of workbook.SheetNames){XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{defval:'',raw:false}).forEach((r,i)=>rows.push(mapImportedRow(r,i+2)))}
    return rows
  }
  throw new Error('Unsupported file type. Use CSV, Excel (.xlsx/.xls), or VCF/vCard.')
}

export default function Dashboard(){
 const supabase=createClient(),router=useRouter()
 const [session,setSession]=useState(null),[contacts,setContacts]=useState([]),[tags,setTags]=useState([]),[campaigns,setCampaigns]=useState([]),[templates,setTemplates]=useState([]),[activity,setActivity]=useState([]),[tab,setTab]=useState('dashboard'),[search,setSearch]=useState(''),[show,setShow]=useState(false),[showImport,setShowImport]=useState(false),[dragging,setDragging]=useState(false)
 const [form,setForm]=useState({name:'',phone:'',email:'',opted_in:false,notes:''}),[campaignForm,setCampaignForm]=useState({name:'',template_name:'',message:''}),[templateForm,setTemplateForm]=useState({name:'',body:''})
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[waStatus,setWaStatus]=useState(null)
 const [importState,setImportState]=useState({rows:[],fileName:'',message:'',busy:false,invalidCount:0,duplicates:0,format:''})
 useEffect(()=>{supabase.auth.getSession().then(async({data})=>{if(!data.session){router.replace('/');return}setSession(data.session);await load()})},[])
 async function load(){
   setLoading(true)
   const [c,t,ca,te,a]=await Promise.all([
     supabase.from('contacts').select('*').order('created_at',{ascending:false}),
     supabase.from('tags').select('*').order('name'),
     supabase.from('campaigns').select('*').order('created_at',{ascending:false}),
     supabase.from('message_templates').select('*').order('created_at',{ascending:false}),
     supabase.from('activity').select('*').order('created_at',{ascending:false}).limit(50)
   ])
   const err=[c,t,ca,te,a].find(x=>x.error)
   if(err)setError(err.error.message)
   setContacts(c.data||[]);setTags(t.data||[]);setCampaigns(ca.data||[]);setTemplates(te.data||[]);setActivity(a.data||[]);setLoading(false)
 }
 async function log(action,details){if(!session)return;const {data}=await supabase.from('activity').insert({created_by:session.user.id,action,details}).select().single();if(data)setActivity(prev=>[data,...prev])}
 async function addContact(e){
   e.preventDefault();setError('');const phone=normalizePhone(form.phone)
   if(contacts.some(c=>normalizePhone(c.phone)===phone)){setError('A contact with this WhatsApp number already exists.');return}
   const {data,error}=await supabase.from('contacts').insert({...form,phone,email:form.email||null,notes:form.notes||null,opted_in_at:form.opted_in?new Date().toISOString():null,created_by:session.user.id}).select().single()
   if(error){setError(error.message);return}setContacts([data,...contacts]);await log('Contact added',data.name);setShow(false);setForm({name:'',phone:'',email:'',opted_in:false,notes:''})
 }
 async function addTag(){
   const name=prompt('Tag name');if(!name)return
   const {data,error}=await supabase.from('tags').insert({name,created_by:session.user.id}).select().single()
   if(error)setError(error.message);else{setTags([...tags,data]);await log('Tag created',name)}
 }
 async function importFile(file){
   setImportState(s=>({...s,busy:true,message:'Reading file…',fileName:file.name}));setError('')
   try{
     const parsed=await parseImportFile(file),valid=parsed.filter(r=>r.name&&r.phone),invalid=parsed.filter(r=>!r.name||!r.phone)
     const existing=new Set(contacts.map(c=>normalizePhone(c.phone))),seen=new Set(),fresh=[];let duplicates=0
     for(const r of valid){if(existing.has(r.phone)||seen.has(r.phone)){duplicates++;continue}seen.add(r.phone);fresh.push(r)}
     setImportState(s=>({...s,rows:fresh,message:`Found ${parsed.length} contacts • ${fresh.length} new • ${duplicates} duplicates • ${invalid.length} incomplete`,invalidCount:invalid.length,duplicates,format:file.name.toLowerCase().endsWith('.vcf')?'VCF':file.name.toLowerCase().endsWith('.csv')?'CSV':'Excel'}))
   }catch(e){setImportState(s=>({...s,message:e.message||'Could not read this file.'}))}finally{setImportState(s=>({...s,busy:false}))}
 }
 async function confirmImport(){
   if(!importState.rows.length)return
   setImportState(s=>({...s,busy:true,message:'Importing contacts…'}))
   const payload=importState.rows.map(r=>({name:r.name,phone:r.phone,email:r.email,opted_in:r.opted_in,opted_in_at:r.opted_in?new Date().toISOString():null,notes:r.notes,created_by:session.user.id}))
   const {data,error}=await supabase.from('contacts').insert(payload).select()
   if(error){setError(error.message);setImportState(s=>({...s,busy:false}));return}
   setContacts(prev=>[...(data||[]),...prev]);await log('Contacts imported',`${data?.length||0} contacts from ${importState.fileName}`);setImportState({rows:[],fileName:'',message:`Imported ${data?.length||0} contacts successfully.`,busy:false})
 }
 function downloadTemplate(){const blob=new Blob(['name,phone,email,opted_in,notes\nJohn Doe,+2348012345678,john@example.com,yes,Past client\n'],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='whatsapp-crm-contact-template.csv';a.click();URL.revokeObjectURL(a.href)}
 async function createCampaign(e){
   e.preventDefault();setError('')
   const {data,error}=await supabase.from('campaigns').insert({created_by:session.user.id,name:campaignForm.name,template_name:campaignForm.template_name||null,message:campaignForm.message,status:'draft',recipient_count:contacts.filter(c=>c.opted_in).length}).select().single()
   if(error){setError(error.message);return}setCampaigns([data,...campaigns]);await log('Campaign created',data.name);setCampaignForm({name:'',template_name:'',message:''});setNotice('Campaign saved as a draft.')
 }
 async function createTemplate(e){
   e.preventDefault();const {data,error}=await supabase.from('message_templates').insert({created_by:session.user.id,name:templateForm.name,body:templateForm.body}).select().single()
   if(error)setError(error.message);else{setTemplates([data,...templates]);await log('Template created',data.name);setTemplateForm({name:'',body:''});setNotice('Template saved.')}
 }
 async function deleteCampaign(id){const {error}=await supabase.from('campaigns').delete().eq('id',id);if(error)setError(error.message);else{setCampaigns(campaigns.filter(c=>c.id!==id));setNotice('Campaign deleted.')}}
 async function testWhatsApp(){
   setWaStatus({loading:true});setError('')
   try{const r=await fetch('/api/whatsapp/status');const data=await r.json();setWaStatus(data);if(data.connected)await log('WhatsApp connection tested','Official WhatsApp Business Platform')}catch(e){setWaStatus({connected:false,error:'Could not reach the WhatsApp connection endpoint.'})}
 }
 async function signout(){await supabase.auth.signOut();router.replace('/')}
 const filtered=contacts.filter(c=>(c.name||'').toLowerCase().includes(search.toLowerCase())||c.phone.includes(search))
 const eligible=contacts.filter(c=>c.opted_in&&!String(c.notes||'').toLowerCase().includes('do not contact'))
 return <div className="app">
  <aside><div className="brand"><div className="logo">W</div><b>WhatsApp CRM</b></div>
   {['dashboard','contacts','campaigns','templates','tags','activity','settings'].map(x=><button className={tab===x?'nav active':'nav'} onClick={()=>setTab(x)} key={x}>{x==='dashboard'?'⌂ ':x==='contacts'?'◉ ':x==='campaigns'?'✈ ':x==='templates'?'▤ ':x==='tags'?'# ':x==='activity'?'◷ ':'⚙ '}{x.replace(/^(.)/,m=>m.toUpperCase())}</button>)}
   <button className="logout" onClick={signout}>Sign out</button>
  </aside>
  <main><header><div><div className="eyebrow">Customer communication</div><h1>{tab==='tags'?'Tags & Groups':tab[0].toUpperCase()+tab.slice(1)}</h1><p className="muted">Manage contacts, consent, campaigns and your official WhatsApp connection.</p></div>{(tab==='dashboard'||tab==='contacts')&&<button className="primary" onClick={()=>setShow(true)}>+ Add contact</button>}</header>
   {error&&<div className="notice error">{error}</div>}{notice&&<div className="notice">{notice}</div>}
   {tab==='dashboard'&&<><div className="cards"><Metric n={contacts.length} t="Total contacts"/><Metric n={contacts.filter(c=>c.opted_in).length} t="Marketing opted in"/><Metric n={eligible.length} t="Campaign eligible"/><Metric n={campaigns.length} t="Campaign drafts"/></div><section className="panel"><div className="sectionhead"><h3>Quick actions</h3></div><div className="quick"><button className="secondary" onClick={()=>{setTab('contacts');setShowImport(true)}}>Upload contacts</button><button className="secondary" onClick={()=>setTab('campaigns')}>Create campaign</button><button className="secondary" onClick={()=>setTab('settings')}>Connect WhatsApp</button></div></section><section className="panel"><h3>Recent contacts</h3><ContactTable rows={contacts.slice(0,8)}/></section></>}
   {tab==='contacts'&&<><div className="toolbar"><input placeholder="Search name or WhatsApp number" value={search} onChange={e=>setSearch(e.target.value)}/><button className="secondary" onClick={()=>setShowImport(true)}>Upload contacts</button><button className="secondary" onClick={downloadTemplate}>CSV template</button></div><section className="panel"><ContactTable rows={filtered}/></section></>}
   {tab==='campaigns'&&<><section className="panel"><h3>Create campaign</h3><p className="muted">Only contacts with marketing consent are counted as eligible recipients. Sending is disabled until the official WhatsApp Business Platform is connected.</p><form className="stack" onSubmit={createCampaign}><input required placeholder="Campaign name" value={campaignForm.name} onChange={e=>setCampaignForm({...campaignForm,name:e.target.value})}/><input placeholder="Approved template name (optional)" value={campaignForm.template_name} onChange={e=>setCampaignForm({...campaignForm,template_name:e.target.value})}/><textarea required rows="5" placeholder="Campaign message / template content" value={campaignForm.message} onChange={e=>setCampaignForm({...campaignForm,message:e.target.value})}/><div className="campaign-meta"><b>{eligible.length}</b> opted-in contacts currently eligible</div><button className="primary">Save campaign draft</button></form></section><section className="panel"><h3>Campaign history</h3>{campaigns.length?<table><thead><tr><th>Name</th><th>Status</th><th>Recipients</th><th>Created</th><th></th></tr></thead><tbody>{campaigns.map(c=><tr key={c.id}><td><b>{c.name}</b><div className="muted">{c.template_name||'No template selected'}</div></td><td><span className="pill">{c.status}</span></td><td>{c.recipient_count}</td><td>{new Date(c.created_at).toLocaleDateString()}</td><td><button className="link" onClick={()=>deleteCampaign(c.id)}>Delete</button></td></tr>)}</tbody></table>:<p className="muted">No campaigns yet.</p>}</section></>}
   {tab==='templates'&&<><section className="panel"><h3>Message templates</h3><p className="muted">Store the names and content of templates you have approved in WhatsApp Business Manager. Approval itself happens in Meta.</p><form className="stack" onSubmit={createTemplate}><input required placeholder="Template name" value={templateForm.name} onChange={e=>setTemplateForm({...templateForm,name:e.target.value})}/><textarea required rows="5" placeholder="Template body, e.g. Hello {{1}}, happy new month..." value={templateForm.body} onChange={e=>setTemplateForm({...templateForm,body:e.target.value})}/><button className="primary">Save template</button></form></section><section className="panel"><h3>Saved templates</h3>{templates.length?<table><thead><tr><th>Name</th><th>Body</th><th>Created</th></tr></thead><tbody>{templates.map(t=><tr key={t.id}><td><b>{t.name}</b></td><td>{t.body}</td><td>{new Date(t.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>:<p className="muted">No templates saved.</p>}</section></>}
   {tab==='tags'&&<section className="panel"><div className="sectionhead"><h3>Tags & groups</h3><button className="primary" onClick={addTag}>+ Add tag</button></div><div className="tagbox">{(tags.length?tags:DEFAULT_TAGS.map((name,i)=>({id:i,name}))).map(t=><span className="pill" key={t.id}>{t.name}</span>)}</div></section>}
   {tab==='activity'&&<section className="panel"><h3>Activity</h3><p className="muted">A history of important CRM actions.</p>{activity.length?<table><thead><tr><th>Action</th><th>Details</th><th>Time</th></tr></thead><tbody>{activity.map(a=><tr key={a.id}><td><b>{a.action}</b></td><td>{a.details||'—'}</td><td>{new Date(a.created_at).toLocaleString()}</td></tr>)}</tbody></table>:<p className="muted">No activity yet.</p>}</section>}
   {tab==='settings'&&<section className="panel"><h3>WhatsApp Business connection</h3><p className="muted">Connect this CRM to the official WhatsApp Business Platform. Your access token must stay server-side and must never be placed in a NEXT_PUBLIC_ environment variable.</p><div className="connection-box"><div><b>Connection status</b><span className={waStatus?.connected?'good':'muted'}>{waStatus?.loading?'Checking…':waStatus?.connected?'Connected':'Not checked'}</span></div><button className="primary" onClick={testWhatsApp}>Test connection</button></div><h4>Vercel environment variables</h4><div className="codebox">WHATSAPP_ACCESS_TOKEN<br/>WHATSAPP_PHONE_NUMBER_ID<br/>WHATSAPP_BUSINESS_ACCOUNT_ID<br/>WHATSAPP_API_VERSION</div><p className="muted">Add these as encrypted Vercel environment variables, then redeploy. The CRM test button will verify the Phone Number ID and token against Meta's Graph API.</p>{waStatus?.error&&<div className="notice error">{waStatus.error}</div>}{waStatus?.connected&&<div className="notice">WhatsApp Business Platform connection is responding. You can now proceed to approved-template sending and delivery webhooks.</div>}<h4>Safety controls</h4><ul><li>Marketing campaigns require recorded consent.</li><li>Do Not Contact contacts should not be selected for campaigns.</li><li>Business-initiated WhatsApp messages should use approved templates.</li></ul></section>}
   {show&&<div className="modal"><form className="modalbox" onSubmit={addContact}><h2>Add contact</h2><input required placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input required placeholder="WhatsApp number" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><input type="email" placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><textarea placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><label><input type="checkbox" checked={form.opted_in} onChange={e=>setForm({...form,opted_in:e.target.checked})}/> Marketing opt-in recorded</label><div className="actions"><button type="button" className="secondary" onClick={()=>setShow(false)}>Cancel</button><button className="primary">Save contact</button></div></form></div>}
   {showImport&&<div className="modal"><div className="modalbox"><div className="sectionhead"><div><h2>Import contacts</h2><p className="muted">Drag and drop CSV, Excel or VCF/vCard files. The CRM normalizes Nigerian numbers, detects duplicates and previews records before import. It does not scrape WhatsApp.</p></div><button className="secondary" onClick={()=>{setShowImport(false);setImportState({rows:[],fileName:'',message:'',busy:false,invalidCount:0,duplicates:0,format:''})}}>×</button></div><div className={dragging?'dropzone dragging':'dropzone'} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const file=e.dataTransfer.files?.[0];if(file)importFile(file)}}><input id="contact-file" type="file" accept=".csv,text/csv,.xlsx,.xls,.vcf,.vcard" onChange={e=>e.target.files?.[0]&&importFile(e.target.files[0])}/><label htmlFor="contact-file"><strong>{importState.busy?'Reading contacts…':'Drop your contact file here'}</strong><span>or click to browse · CSV · Excel · VCF/vCard</span></label></div>{importState.fileName&&<div className="file-chip"><b>{importState.fileName}</b><span>{importState.format}</span></div>}{importState.message&&<div className="notice">{importState.message}</div>}{importState.rows.length>0&&<><div className="import-preview"><b>Ready to import {importState.rows.length} contacts</b><span>{importState.duplicates||0} duplicate numbers excluded · {importState.invalidCount||0} incomplete records excluded.</span><div className="import-mini-table"><div><b>Name</b><b>WhatsApp</b><b>Email</b></div>{importState.rows.slice(0,5).map((r,i)=><div key={i}><span>{r.name}</span><span>{r.phone}</span><span>{r.email||'—'}</span></div>)}{importState.rows.length>5&&<small>Showing first 5 contacts of {importState.rows.length}.</small>}</div></div><div className="actions"><button type="button" className="secondary" onClick={()=>setImportState({rows:[],fileName:'',message:'',busy:false,invalidCount:0,duplicates:0,format:''})}>Clear</button><button className="primary" disabled={importState.busy} onClick={confirmImport}>{importState.busy?'Importing…':`Import ${importState.rows.length}`}</button></div></>}<button className="link" onClick={downloadTemplate}>Download CSV template</button></div></div>}
  </main></div>
}
function Metric({n,t}){return <div className="metric"><small>{t}</small><strong>{n}</strong></div>}
function ContactTable({rows}){return <table><thead><tr><th>Customer</th><th>WhatsApp</th><th>Marketing</th><th>Created</th></tr></thead><tbody>{rows.length?rows.map(c=><tr key={c.id}><td><b>{c.name}</b><div className="muted">{c.email||''}</div></td><td>{c.phone}</td><td><span className={c.opted_in?'good':'muted'}>{c.opted_in?'Opted in':'Not opted in'}</span></td><td>{new Date(c.created_at).toLocaleDateString()}</td></tr>):<tr><td colSpan="4" className="muted">No contacts found.</td></tr>}</tbody></table>}
