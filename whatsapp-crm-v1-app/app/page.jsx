'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [mode,setMode]=useState('login'); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState(''); const [msg,setMsg]=useState(''); const [loading,setLoading]=useState(false); const router=useRouter(); const supabase=createClient()
  useEffect(()=>{supabase.auth.getSession().then(({data})=>{if(data.session) router.replace('/dashboard')})},[])
  async function submit(e){e.preventDefault();setLoading(true);setMsg('');let result
    if(mode==='login') result=await supabase.auth.signInWithPassword({email,password})
    else result=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}})
    if(result.error)setMsg(result.error.message); else if(mode==='signup') setMsg('Account created. Check your email if confirmation is enabled, then sign in.'); else router.replace('/dashboard'); setLoading(false)
  }
  return <main className="auth"><div className="auth-card"><div className="logo">W</div><div className="eyebrow">Customer communication</div><h1>WhatsApp CRM</h1><p className="muted">Secure CRM foundation for contacts, tags, consent and campaigns.</p>{mode==='signup'&&<input placeholder="Full name" value={name} onChange={e=>setName(e.target.value)}/>}<form onSubmit={submit}><input type="email" required placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}/><input type="password" required minLength="6" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary" disabled={loading}>{loading?'Please wait…':mode==='login'?'Sign in':'Create account'}</button></form>{msg&&<div className="notice">{msg}</div>}<button className="link" onClick={()=>{setMode(mode==='login'?'signup':'login');setMsg('')}}>{mode==='login'?'Create a new account':'Already have an account? Sign in'}</button><small>Use a dedicated business account. WhatsApp credentials are not stored in this browser.</small></div></main>
}
