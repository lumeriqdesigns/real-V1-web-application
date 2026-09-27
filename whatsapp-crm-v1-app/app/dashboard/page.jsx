'use client'
import { useEffect, useMemo, useState } from 'react'
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
    if((ch==='\n' || ch==='\r') && !quoted){
      if(ch==='\r' && next==='\n') i++
      row.push(cell.trim());cell=''
      if(row.some(v=>v!=='')) rows.push(row)
      row=[];continue
    }
    cell+=ch
  }
  row.push(cell.trim()); if(row.some(v=>v!=='')) rows.push(row)
  if(!rows.length) return []
  const headers=rows[0].map(h=>h.toLowerCase().replace(/[^a-z0-9]+/g,'_'))
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]||''])))
}


function cleanKey(value=''){
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')
}

function firstValue(row, keys){
  for(const key of keys){
    const value=row[key] ?? row[cleanKey(key)]
    if(value!==undefined && String(value).trim()!=='') return String(value).trim()
  }
  return ''
}

function mapImportedRow(r, rowNumber){
  const name=firstValue(r,['name','full_name','fullname','display_name','contact_name','customer','first_name'])
  const phone=normalizePhone(firstValue(r,['phone','whatsapp','whatsapp_number','mobile','mobile_number','phone_number','telephone','tel']))
  const email=firstValue(r,['email','email_address']) || null
  const opted_in=/^(yes|true|1|y|opted in|opted_in)$/i.test(firstValue(r,['opt_in','opted_in','marketing_opt_in','marketing_consent']))
  const notes=firstValue(r,['notes','note','comment']) || null
  return {row:rowNumber,name,phone,email,opted_in,notes}
}

function parseVCF(text){
  const unfolded=text.replace(/\r?\n[ \t]/g,'').split(/\r?\n/)
  const cards=[]; let current=null
  for(const line of unfolded){
    if(line.toUpperCase()==='BEGIN:VCARD'){current={};continue}
    if(line.toUpperCase()==='END:VCARD'){if(current) cards.push(current);current=null;continue}
    if(!current) continue
    const idx=line.indexOf(':'); if(idx<0) continue
    const rawKey=line.slice(0,idx), value=line.slice(idx+1).trim()
    const key=rawKey.split(';')[0].toUpperCase()
    if(key==='FN') current.name=value
    else if(key==='N' && !current.name) current.name=value.split(';').filter(Boolean).reverse().join(' ')
    else if(key==='TEL' && !current.phone) current.phone=value
    else if(key==='EMAIL' && !current.email) current.email=value
    else if(key==='NOTE') current.notes=value.replace(/\\n/g,' ')
  }
  return cards.map((r,i)=>mapImportedRow(r,i+1))
}

async function parseImportFile(file){
  const ext=file.name.toLowerCase().split('.').pop()
  if(ext==='csv') return parseCSV(await file.text()).map((r,i)=>mapImportedRow(r,i+2))
  if(ext==='vcf' || ext==='vcard') return parseVCF(await file.text())
  if(ext==='xlsx' || ext==='xls'){
    const XLSX=await import('xlsx')
    const buffer=await file.arrayBuffer()
    const workbook=XLSX.read(buffer,{type:'array'})
    const rows=[]
    for(const sheetName of workbook.SheetNames){
      const sheet=workbook.Sheets[sheetName]
      const data=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false})
      data.forEach((r,i)=>rows.push(mapImportedRow(r,i+2)))
    }
    return rows
  }
  throw new Error('Unsupported file type. Please use CSV, Excel (.xlsx/.xls), or VCF/vCard.')
}

export default function Dashboard(){
 const supabase=createClient(),router=useRouter();
 const [session,setSession]=useState(null),[contacts,setContacts]=useState([]),[tags,setTags]=useState([]),[tab,setTab]=useState('dashboard'),[search,setSearch]=useState(''),[show,setShow]=useState(false),[showImport,setShowImport]=useState(false),[dragging,setDragging]=useState(false),[form,setForm]=useState({name:'',phone:'',email:'',opted_in:false,notes:''}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[importState,setImportState]=useState({rows:[],fileName:'',message:'',busy:false,invalidCount:0,duplicates:0,format:''})
 useEffect(()=>{supabase.auth.getSession().then(async({data})=>{if(!data.session){router.replace('/');return}setSession(data.session); await load()})},[])
 async function load(){setLoading(true); const c=await supabase.from('contacts').select('*,contact_tags(tags(name))').order('created_at',{ascending:false}); const t=await supabase.from('tags').select('*').order('name'); if(c.error||t.error)setError(c.error?.message||t.error?.message); else {setContacts(c.data||[]);setTags(t.data||[])} setLoading(false)}
 async function addContact(e){e.preventDefault();setError(''); const phone=normalizePhone(form.phone); const exists=contacts.some(c=>normalizePhone(c.phone)===phone); if(exists){setError('A contact with this WhatsApp number already exists.');return} const {data,error}=await supabase.from('contacts').insert({name:form.name,phone,email:form.email||null,opted_in:form.opted_in,opted_in_at:form.opted_in?new Date().toISOString():null,notes:form.notes||null,created_by:session.user.id}).select().single(); if(error){setError(error.message);return}setContacts([data,...contacts]);setShow(false);setForm({name:'',phone:'',email:'',opted_in:false,notes:''})}
 async function addTag(){const name=prompt('Tag name');if(!name)return;const {data,error}=await supabase.from('tags').insert({name,created_by:session.user.id}).select().single();if(error)setError(error.message);else setTags([...tags,data])}
 async function importFile(file){
   setImportState(s=>({...s,busy:true,message:'Reading file…',fileName:file.name})); setError('')
   try{
     const parsed=await parseImportFile(file)
     const normalized=parsed.map((r,i)=>({...r,row:r.row||i+1}))
     const valid=normalized.filter(r=>r.name&&r.phone)
     const invalid=normalized.filter(r=>!r.name||!r.phone)
     const existing=new Set(contacts.map(c=>normalizePhone(c.phone))); const seen=new Set(); const fresh=[]; let duplicates=0
     for(const r of valid){if(existing.has(r.phone)||seen.has(r.phone)){duplicates++;continue}seen.add(r.phone);fresh.push(r)}
     setImportState(s=>({...s,rows:fresh,message:`Found ${normalized.length} contacts • ${fresh.length} new • ${duplicates} duplicates • ${invalid.length} incomplete` ,invalidCount:invalid.length,duplicates,format:file.name.toLowerCase().endsWith('.vcf')?'VCF':file.name.toLowerCase().endsWith('.csv')?'CSV':'Excel'}))
   }catch(e){setImportState(s=>({...s,message:e.message||'Could not read this file.'}))}
   finally{setImportState(s=>({...s,busy:false}))}
 }
 async function confirmImport(){
   if(!importState.rows.length)return
   setImportState(s=>({...s,busy:true,message:'Importing contacts…'}));
   const payload=importState.rows.map(r=>({name:r.name,phone:r.phone,email:r.email,opted_in:r.opted_in,opted_in_at:r.opted_in?new Date().toISOString():null,notes:r.notes,created_by:session.user.id}))
   const {data,error}=await supabase.from('contacts').insert(payload).select()
   if(error){setError(error.message);setImportState(s=>({...s,busy:false}));return}
   setContacts(prev=>[...(data||[]),...prev]); setImportState({rows:[],fileName:'',message:`Imported ${data?.length||0} contacts successfully.`,busy:false})
 }
 function downloadTemplate(){const blob=new Blob(['name,phone,email,opted_in,notes\nJohn Doe,+2348012345678,john@example.com,yes,Past client\n'],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='whatsapp-crm-contact-template.csv';a.click();URL.revokeObjectURL(a.href)}
 async function signout(){await supabase.auth.signOut();router.replace('/')}
 const filtered=contacts.filter(c=>(c.name||'').toLowerCase().includes(search.toLowerCase())||c.phone.includes(search))
 return <div className="app"><aside><div className="brand"><div className="logo">W</div><b>WhatsApp CRM</b></div>{['dashboard','contacts','campaigns','templates','tags','activity','settings'].map(x=><button className={tab===x?'nav active':'nav'} onClick={()=>setTab(x)} key={x}>{x==='dashboard'?'⌂ ':x==='contacts'?'◉ ':x==='campaigns'?'✈ ':x==='templates'?'▤ ':x==='tags'?'# ':x==='activity'?'◷ ':'⚙ '}{x.replace(/^(.)/,m=>m.toUpperCase())}</button>)}<button className="logout" onClick={signout}>Sign out</button></aside><main><header><div><div className="eyebrow">Customer communication</div><h1>{tab==='tags'?'Tags & Groups':tab[0].toUpperCase()+tab.slice(1)}</h1><p className="muted">Manage your customer database and prepare compliant WhatsApp campaigns.</p></div><button className="primary" onClick={()=>setShow(true)}>+ Add contact</button></header>{error&&<div className="notice error">{error}</div>}
 {tab==='dashboard'&&<><div className="cards"><Metric n={contacts.length} t="Total contacts"/><Metric n={contacts.filter(c=>c.opted_in).length} t="Marketing opted in"/><Metric n={contacts.filter(c=>!c.opted_in).length} t="Not opted in"/><Metric n={contacts.filter(c=>new Date(c.created_at)>new Date(Date.now()-30*864e5)).length} t="Added this month"/></div><section className="panel"><h3>Recent contacts</h3><ContactTable rows={contacts.slice(0,8)}/></section></>}
 {tab==='contacts'&&<><div className="toolbar"><input placeholder="Search name or WhatsApp number" value={search} onChange={e=>setSearch(e.target.value)}/><button className="secondary" onClick={()=>setShowImport(true)}>Import contacts</button><button className="secondary" onClick={downloadTemplate}>CSV template</button></div><section className="panel"><ContactTable rows={filtered}/></section></>}
 {tab==='tags'&&<section className="panel"><div className="sectionhead"><h3>Tags & groups</h3><button className="primary" onClick={addTag}>+ Add tag</button></div><div className="tagbox">{(tags.length?tags:DEFAULT_TAGS.map((name,i)=>({id:i,name}))).map(t=><span className="pill" key={t.id}>{t.name}</span>)}</div></section>}
 {['campaigns','templates','activity','settings'].includes(tab)&&<section className="panel"><h3>{tab[0].toUpperCase()+tab.slice(1)}</h3><p className="muted">This module is reserved for the next build stage. Your contacts and consent records are stored in Supabase once connected.</p></section>}
 {show&&<div className="modal"><form className="modalbox" onSubmit={addContact}><h2>Add contact</h2><input required placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input required placeholder="WhatsApp number" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><input type="email" placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><textarea placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><label><input type="checkbox" checked={form.opted_in} onChange={e=>setForm({...form,opted_in:e.target.checked})}/> Marketing opt-in recorded</label><div className="actions"><button type="button" className="secondary" onClick={()=>setShow(false)}>Cancel</button><button className="primary">Save contact</button></div></form></div>}
 {showImport&&<div className="modal"><div className="modalbox"><div className="sectionhead"><div><h2>Import contacts</h2><p className="muted">Drag and drop a CSV, Excel or VCF/vCard contact file. The CRM reads the available name, phone, email and notes fields. No WhatsApp scraping is used.</p></div><button className="secondary" onClick={()=>{setShowImport(false);setImportState({rows:[],fileName:'',message:'',busy:false,invalidCount:0,duplicates:0,format:''})}}>×</button></div><div className={dragging?'dropzone dragging':'dropzone'} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const file=e.dataTransfer.files?.[0];if(file)importFile(file)}}><input id="contact-file" type="file" accept=".csv,text/csv,.xlsx,.xls,.vcf,.vcard" onChange={e=>e.target.files?.[0]&&importFile(e.target.files[0])}/><label htmlFor="contact-file"><strong>{importState.busy?'Reading contacts…':'Drop your contact file here'}</strong><span>or click to browse · CSV · Excel (.xlsx/.xls) · VCF/vCard</span></label></div>{importState.fileName&&<div className="file-chip"><b>{importState.fileName}</b><span>{importState.format}</span></div>}{importState.message&&<div className="notice">{importState.message}</div>}{importState.rows.length>0&&<><div className="import-preview"><b>Ready to import {importState.rows.length} contacts</b><span>{importState.duplicates||0} duplicate numbers excluded · {importState.invalidCount||0} incomplete records excluded.</span><div className="import-mini-table"><div><b>Name</b><b>WhatsApp</b><b>Email</b></div>{importState.rows.slice(0,5).map((r,i)=><div key={i}><span>{r.name}</span><span>{r.phone}</span><span>{r.email||'—'}</span></div>)}{importState.rows.length>5&&<small>Showing first 5 contacts of {importState.rows.length}.</small>}</div></div><div className="actions"><button className="secondary" onClick={()=>setImportState({rows:[],fileName:'',message:'',busy:false,invalidCount:0,duplicates:0,format:''})}>Clear</button><button className="primary" disabled={importState.busy} onClick={confirmImport}>{importState.busy?'Importing…':`Import ${importState.rows.length}`}</button></div></>}<button className="link" onClick={downloadTemplate}>Download CSV template</button></div></div>}
 </main></div>
}
function Metric({n,t}){return <div className="metric"><small>{t}</small><strong>{n}</strong></div>}
function ContactTable({rows}){return <table><thead><tr><th>Customer</th><th>WhatsApp</th><th>Marketing</th><th>Created</th></tr></thead><tbody>{rows.length?rows.map(c=><tr key={c.id}><td><b>{c.name}</b><div className="muted">{c.email||''}</div></td><td>{c.phone}</td><td><span className={c.opted_in?'good':'muted'}>{c.opted_in?'Opted in':'Not opted in'}</span></td><td>{new Date(c.created_at).toLocaleDateString()}</td></tr>):<tr><td colSpan="4" className="muted">No contacts found.</td></tr>}</tbody></table>}
