import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import './App.css';

const AREAS = ['Administración','Aduana','Capital Humano','Comercial','Forwarder','Logística','Proyecto'];
const HR_EMAILS = ['rrhh@freecustoms.com.ar', 'tarriagada@freecustoms.com'];

function App() {
  const [role, setRole] = useState('candidato');
  const [page, setPage] = useState('vacantes');
  const [hrPage, setHrPage] = useState('busquedas');
  const [detail, setDetail] = useState(null);
  const [filtroArea, setFiltroArea] = useState('Todas');
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [vacantes, setVacantes] = useState([]);
  const [postulaciones, setPostulaciones] = useState([]);
  const [candidatosHR, setCandidatosHR] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const esHR = user && HR_EMAILS.includes(user.email);

  useEffect(() => {
    cargarVacantes();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUser(session.user); cargarPerfil(session.user.id); }
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { setUser(session.user); cargarPerfil(session.user.id); }
      else { setUser(null); setPerfil(null); setRole('candidato'); }
    });
  }, []);

  useEffect(() => {
    if (user) cargarPostulaciones();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (role === 'hr') cargarCandidatosHR();
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && !esHR && role === 'hr') setRole('candidato');
  }, [user, esHR, role]);

  async function cargarVacantes() {
    const { data } = await supabase.from('vacantes').select('*').eq('estado','activa').order('created_at', { ascending: false });
    if (data) setVacantes(data);
  }

  async function cargarPerfil(uid) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', uid).single();
    if (data) setPerfil(data);
  }

  async function cargarPostulaciones() {
    const { data } = await supabase.from('postulaciones').select('*, vacantes(titulo, area)').eq('candidato_id', user.id);
    if (data) setPostulaciones(data);
  }

  async function cargarCandidatosHR() {
    const { data } = await supabase.from('postulaciones').select('*, perfiles(nombre, email, linkedin, cv_url, cv_nombre), vacantes(titulo, area)');
    if (data) setCandidatosHR(data);
  }

  async function subirCV(cvFile, userId) {
    if (!cvFile) return { cv_url: null, cv_nombre: null };
    const ext = cvFile.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('cvs').upload(fileName, cvFile);
    if (uploadError) return { cv_url: null, cv_nombre: null };
    const { data: urlData } = supabase.storage.from('cvs').getPublicUrl(fileName);
    return { cv_url: urlData.publicUrl, cv_nombre: cvFile.name };
  }

  async function registrarse(e) {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    const form = e.target;
    const email = form.email.value;
    const password = form.password.value;
    const nombre = form.nombre.value;
    const telefono = form.telefono.value;
    const linkedin = form.linkedin.value;
    const cvFile = form.cv.files[0];
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setMsg(error.message); setLoading(false); return; }
    if (data.user) {
      const { cv_url, cv_nombre } = await subirCV(cvFile, data.user.id);
      await supabase.from('perfiles').upsert({ id: data.user.id, nombre, email, telefono, linkedin, cv_url, cv_nombre });
      setUser(data.user);
      setPerfil({ nombre, email, telefono, linkedin, cv_url, cv_nombre });
    }
    setLoading(false);
    setPage('vacantes');
    setDetail(null);
  }

  async function iniciarSesion(e) {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    const form = e.target;
    const { error } = await supabase.auth.signInWithPassword({ email: form.email.value, password: form.password.value });
    if (error) { setMsg('Email o contraseña incorrectos'); setLoading(false); return; }
    setLoading(false);
    setDetail(null);
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    setPage('vacantes');
    setRole('candidato');
    setPostulaciones([]);
  }

  async function postularse(vacanteId) {
    if (!user) { setDetail({ type: 'login' }); return; }
    setLoading(true);
    const { error } = await supabase.from('postulaciones').insert({ candidato_id: user.id, vacante_id: vacanteId, estado: 'recibido' });
    if (!error) {
      await supabase.from('vacantes').update({ postulantes: (vacantes.find(v=>v.id===vacanteId)?.postulantes||0)+1 }).eq('id', vacanteId);
      await cargarPostulaciones();
      await cargarVacantes();
      setDetail({ type: 'exito', titulo: vacantes.find(v=>v.id===vacanteId)?.titulo });
    }
    setLoading(false);
  }

  async function cambiarEstado(postulacionId, nuevoEstado) {
    await supabase.from('postulaciones').update({ estado: nuevoEstado }).eq('id', postulacionId);
    await cargarCandidatosHR();
    setDetail(d => ({ ...d, data: { ...d.data, estado: nuevoEstado } }));
  }

  async function guardarNota(postulacionId, nota) {
    await supabase.from('postulaciones').update({ notas: nota }).eq('id', postulacionId);
  }

  async function guardarPerfil(e) {
    e.preventDefault();
    const form = e.target;
    const cvFile = form.cv.files[0];
    const updates = { id: user.id, nombre: form.nombre.value, telefono: form.telefono.value, linkedin: form.linkedin.value };
    if (cvFile) {
      const { cv_url, cv_nombre } = await subirCV(cvFile, user.id);
      if (cv_url) { updates.cv_url = cv_url; updates.cv_nombre = cv_nombre; }
    }
    await supabase.from('perfiles').upsert(updates);
    setPerfil(p => ({ ...p, ...updates }));
    setMsg('✓ Perfil actualizado');
    setTimeout(() => setMsg(''), 2000);
  }

  const filtradas = filtroArea === 'Todas' ? vacantes : vacantes.filter(v => v.area === filtroArea);
  const filtradosHR = filtroArea === 'Todas' ? candidatosHR : candidatosHR.filter(c => c.vacantes?.area === filtroArea);

  function estadoBadge(e) {
    const map = { recibido:'badge-gray', entrevista:'badge-info', finalista:'badge-active', descartado:'badge-danger', activa:'badge-active' };
    const label = { recibido:'CV recibido', entrevista:'Entrevista pautada', finalista:'Instancia final', descartado:'No avanza', activa:'Activa' };
    return <span className={`badge ${map[e]||'badge-gray'}`}>{label[e]||e}</span>;
  }

  function PantallaVacantes() {
    return (
      <div>
        <input placeholder="Buscar vacantes..." style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'0.5px solid #d1d5db',fontSize:13,marginBottom:12,fontFamily:'inherit'}} />
        <div className="filter-chips">
          {['Todas',...AREAS].map(a=><span key={a} className={`chip ${filtroArea===a?'active':''}`} onClick={()=>setFiltroArea(a)}>{a}</span>)}
        </div>
        <p className="section-title">{filtradas.length} búsqueda{filtradas.length!==1?'s':''} activa{filtradas.length!==1?'s':''}</p>
        {filtradas.map(v=>(
          <div key={v.id} className="card" style={{cursor:'pointer'}} onClick={()=>setDetail({type:'vacante',data:v})}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
              <p className="job-title">{v.titulo}</p>{estadoBadge(v.estado)}
            </div>
            <div className="job-meta">
              <span>🏢 {v.area}</span><span>📍 {v.modalidad}</span><span>⏰ {v.jornada}</span>
            </div>
            <p style={{fontSize:12,color:'#6b7280',lineHeight:1.5}}>{v.descripcion?.substring(0,90)}…</p>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
              <span style={{fontSize:11,color:'#6b7280'}}>{v.postulantes} postulantes</span>
              <span style={{fontSize:12,color:'#0D3D5C',fontWeight:500}}>Ver más →</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function PantallaVacanteDetalle({ v }) {
    const yaPostulado = postulaciones.some(p => p.vacante_id === v.id);
    return (
      <div>
        <div className="back-btn" onClick={()=>setDetail(null)}>← Volver a vacantes</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
          <h2 style={{fontSize:18,fontWeight:500,flex:1,paddingRight:8}}>{v.titulo}</h2>{estadoBadge(v.estado)}
        </div>
        <div className="job-meta" style={{marginBottom:12}}>
          <span>🏢 {v.area}</span><span>📍 {v.modalidad}</span><span>⏰ {v.jornada}</span>
        </div>
        <p style={{fontSize:13,lineHeight:1.65,color:'#6b7280',marginBottom:14}}>{v.descripcion}</p>
        <p className="section-title">Requisitos</p>
        <ul style={{listStyle:'none',marginBottom:16}}>
          {(v.requisitos||[]).map((r,i)=><li key={i} style={{fontSize:13,padding:'5px 0',display:'flex',alignItems:'center',gap:8,borderBottom:'0.5px solid #e5e7eb',color:'#6b7280'}}>✓ {r}</li>)}
        </ul>
        <hr className="divider" />
        {!user
          ? <><p style={{fontSize:13,color:'#6b7280',marginBottom:12}}>Para postularte necesitás crear una cuenta o iniciar sesión.</p><button className="btn btn-primary btn-block" onClick={()=>setDetail({type:'login'})}>Registrarme / Iniciar sesión</button></>
          : yaPostulado
          ? <div style={{background:'#E1F0F7',borderRadius:8,padding:12,display:'flex',alignItems:'center',gap:10}}><span style={{color:'#0D3D5C',fontSize:20}}>✓</span><div><p style={{fontSize:13,fontWeight:500,color:'#0D3D5C'}}>Ya te postulaste</p><p style={{fontSize:12,color:'#185A80'}}>Seguí tu estado en "Mis postulaciones"</p></div></div>
          : <button className="btn btn-primary btn-block" onClick={()=>postularse(v.id)} disabled={loading}>Postularme a esta búsqueda</button>
        }
      </div>
    );
  }

  function PantallaLogin() {
    const [modo, setModo] = useState('login');
    return (
      <div>
        <div className="back-btn" onClick={()=>setDetail(null)}>← Volver</div>
        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{width:52,height:52,background:'#E1F0F7',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px',fontSize:24}}>👤</div>
          <p style={{fontSize:16,fontWeight:500}}>{modo==='registro'?'Crear cuenta':modo==='olvide'?'Recuperar contraseña':'Iniciar sesión'}</p>
        </div>
        {msg && <p style={{color:msg.startsWith('✓')?'#0D3D5C':'red',fontSize:12,marginBottom:10,textAlign:'center'}}>{msg}</p>}
        {modo==='registro'
          ? <form onSubmit={registrarse}>
              <div className="input-group"><label>Nombre completo</label><input name="nombre" required placeholder="Ej: María González" /></div>
              <div className="input-group"><label>Email</label><input name="email" type="email" required placeholder="tu@email.com" /></div>
              <div className="input-group"><label>Contraseña</label><input name="password" type="password" required placeholder="Mínimo 8 caracteres" /></div>
              <div className="input-group"><label>Teléfono (opcional)</label><input name="telefono" placeholder="+54 11..." /></div>
              <div className="input-group"><label>LinkedIn (opcional)</label><input name="linkedin" placeholder="linkedin.com/in/tu-perfil" /></div>
              <div className="input-group"><label>CV (PDF o JPG, opcional)</label><input name="cv" type="file" accept=".pdf,.jpg,.jpeg" /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>{loading?'Creando cuenta...':'Crear cuenta'}</button>
              <p style={{fontSize:12,color:'#6b7280',textAlign:'center',marginTop:12}}>¿Ya tenés cuenta? <span style={{color:'#0D3D5C',cursor:'pointer',fontWeight:500}} onClick={()=>setModo('login')}>Iniciar sesión</span></p>
            </form>
          : modo==='login'
          ? <form onSubmit={iniciarSesion}>
              <div className="input-group"><label>Email</label><input name="email" type="email" required placeholder="tu@email.com" /></div>
              <div className="input-group"><label>Contraseña</label><input name="password" type="password" required placeholder="Tu contraseña" /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>{loading?'Ingresando...':'Iniciar sesión'}</button>
              <p style={{fontSize:12,color:'#6b7280',textAlign:'center',marginTop:12}}>¿No tenés cuenta? <span style={{color:'#0D3D5C',cursor:'pointer',fontWeight:500}} onClick={()=>setModo('registro')}>Registrarme</span></p>
              <p style={{fontSize:12,color:'#0D3D5C',textAlign:'center',marginTop:8,cursor:'pointer'}} onClick={()=>setModo('olvide')}>Olvidé mi contraseña</p>
            </form>
          : <form onSubmit={async(e)=>{
              e.preventDefault();
              const email=e.target.email.value;
              const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:'https://freecustoms-empleos.netlify.app'});
              setMsg(error?'Error al enviar el email':'✓ Te enviamos un email para restablecer tu contraseña');
            }}>
              <div className="input-group"><label>Email</label><input name="email" type="email" required placeholder="tu@email.com" /></div>
              <button className="btn btn-primary btn-block" type="submit">Enviar email de recuperación</button>
              <p style={{fontSize:12,color:'#6b7280',textAlign:'center',marginTop:12}}>¿Ya recordaste? <span style={{color:'#0D3D5C',cursor:'pointer',fontWeight:500}} onClick={()=>setModo('login')}>Iniciar sesión</span></p>
            </form>
        }
      </div>
    );
  }

  function PantallaPostulaciones() {
    if (!user) return <div className="empty"><p style={{fontSize:14,fontWeight:500,marginBottom:6}}>Necesitás iniciar sesión</p><button className="btn btn-primary" onClick={()=>setDetail({type:'login'})}>Registrarme</button></div>;
    if (!postulaciones.length) return <div className="empty"><p style={{fontSize:14}}>Todavía no te postulaste a ninguna búsqueda.</p></div>;
    const order = ['recibido','entrevista','finalista','descartado'];
    return (
      <div>
        <p className="section-title">Mis postulaciones</p>
        {postulaciones.map(p=>{
          const idx = order.indexOf(p.estado);
          const steps = [{key:'recibido',label:'CV recibido'},{key:'entrevista',label:'Entrevista pautada'},{key:'finalista',label:'Instancia final'}];
          if(p.estado==='descartado') steps.push({key:'descartado',label:'No avanza'});
          return (
            <div key={p.id} className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div><p style={{fontSize:14,fontWeight:500}}>{p.vacantes?.titulo}</p><p style={{fontSize:12,color:'#6b7280'}}>{p.vacantes?.area}</p></div>
                {estadoBadge(p.estado)}
              </div>
              <ul className="timeline">
                {steps.map((st,i)=>{
                  let dc = i<idx?'done':i===idx&&p.estado!=='descartado'?'active':p.estado==='descartado'&&st.key==='descartado'?'rejected':'pending';
                  return <li key={st.key}><div className={`tl-dot ${dc}`}>{dc==='done'?'✓':dc==='active'?'●':dc==='rejected'?'✕':'○'}</div><div><p style={{fontSize:13,fontWeight:500,color:dc==='pending'?'#6b7280':'#1a1a1a'}}>{st.label}</p>{st.key==='entrevista'&&p.fecha_entrevista&&<span style={{fontSize:11,color:'#185A80'}}>{new Date(p.fecha_entrevista).toLocaleString('es-AR')}</span>}</div></li>;
                })}
              </ul>
            </div>
          );
        })}
      </div>
    );
  }

  function PantallaPerfil() {
    if (!user) return <div className="empty"><p style={{fontSize:14,fontWeight:500,marginBottom:6}}>Creá tu perfil</p><button className="btn btn-primary" onClick={()=>setDetail({type:'login'})}>Registrarme</button></div>;
    return (
      <div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
          <div style={{width:52,height:52,borderRadius:'50%',background:'#0D3D5C',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:500}}>{perfil?.nombre?.substring(0,2).toUpperCase()||'?'}</div>
          <div><p style={{fontSize:15,fontWeight:500}}>{perfil?.nombre||user.email}</p><p style={{fontSize:12,color:'#6b7280'}}>{user.email}</p></div>
        </div>
        {msg && <p style={{color:'#0D3D5C',fontSize:12,marginBottom:10}}>{msg}</p>}
        <form onSubmit={guardarPerfil}>
          <div className="input-group"><label>Nombre completo</label><input name="nombre" defaultValue={perfil?.nombre||''} /></div>
          <div className="input-group"><label>Teléfono</label><input name="telefono" defaultValue={perfil?.telefono||''} /></div>
          <div className="input-group"><label>LinkedIn</label><input name="linkedin" defaultValue={perfil?.linkedin||''} placeholder="linkedin.com/in/tu-perfil" /></div>
          <div className="input-group">
            <label>CV (PDF o JPG)</label>
            {perfil?.cv_nombre && <p style={{fontSize:12,color:'#0D3D5C',marginBottom:6}}>✓ Archivo actual: {perfil.cv_nombre}</p>}
            <input name="cv" type="file" accept=".pdf,.jpg,.jpeg" />
            <p style={{fontSize:11,color:'#6b7280',marginTop:4}}>Opcional — subí uno nuevo para reemplazar el actual</p>
          </div>
          <button className="btn btn-primary btn-block" type="submit">Guardar cambios</button>
        </form>
        <button className="btn btn-block" style={{marginTop:10}} onClick={cerrarSesion}>Cerrar sesión</button>
      </div>
    );
  }

  function PantallaBusquedasHR() {
    const filtradas2 = filtroArea==='Todas' ? vacantes : vacantes.filter(v=>v.area===filtroArea);
    return (
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <p className="section-title" style={{margin:0}}>{vacantes.length} búsquedas activas</p>
          <button className="btn btn-primary btn-sm" onClick={()=>setDetail({type:'nueva_busqueda'})}>+ Nueva</button>
        </div>
        <div className="filter-chips">{['Todas',...AREAS].map(a=><span key={a} className={`chip ${filtroArea===a?'active':''}`} onClick={()=>setFiltroArea(a)}>{a}</span>)}</div>
        {filtradas2.map(v=>(
          <div key={v.id} className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}><p className="job-title" style={{fontSize:14}}>{v.titulo}</p>{estadoBadge(v.estado)}</div>
            <div className="job-meta"><span>🏢 {v.area}</span><span>📍 {v.modalidad}</span></div>
            <div style={{marginTop:10}}><span style={{fontSize:12,color:'#6b7280'}}>👥 {v.postulantes} postulantes</span></div>
          </div>
        ))}
      </div>
    );
  }

  function PantallaNuevaBusqueda() {
    const [tit, setTit] = useState('');
    const [area, setArea] = useState(AREAS[0]);
    const [mod, setMod] = useState('Presencial');
    const [jor, setJor] = useState('Full time');
    const [desc, setDesc] = useState('');
    const [req, setReq] = useState('');
    const [err, setErr] = useState('');

    async function handlePublicar() {
      if (!tit.trim()) { setErr('Ingresá el título del puesto'); return; }
      setErr('');
      const requisitos = req.split('\n').map(r=>r.trim()).filter(Boolean);
      const { error } = await supabase.from('vacantes').insert({
        titulo: tit.trim(), area, modalidad: mod, jornada: jor, descripcion: desc, requisitos
      });
      if (error) { setErr('Error: ' + error.message); }
      else { await cargarVacantes(); setDetail(null); setHrPage('busquedas'); }
    }

    return (
      <div>
        <div className="back-btn" onClick={()=>setDetail(null)}>← Volver</div>
        <p style={{fontSize:16,fontWeight:500,marginBottom:16}}>Nueva búsqueda</p>
        {err && <p style={{color:'red',fontSize:12,marginBottom:10}}>{err}</p>}
        <div className="input-group"><label>Título del puesto</label><input value={tit} onChange={e=>setTit(e.target.value)} placeholder="Ej: Analista Comex" /></div>
        <div className="input-group"><label>Área</label><select value={area} onChange={e=>setArea(e.target.value)}>{AREAS.map(a=><option key={a}>{a}</option>)}</select></div>
        <div className="input-group"><label>Modalidad</label><select value={mod} onChange={e=>setMod(e.target.value)}><option>Presencial</option><option>Híbrido</option><option>Remoto</option></select></div>
        <div className="input-group"><label>Jornada</label><select value={jor} onChange={e=>setJor(e.target.value)}><option>Full time</option><option>Part time</option></select></div>
        <div className="input-group"><label>Descripción</label><textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describí las responsabilidades..."></textarea></div>
        <div className="input-group"><label>Requisitos (uno por línea)</label><textarea value={req} onChange={e=>setReq(e.target.value)} placeholder="Requisito 1&#10;Requisito 2"></textarea></div>
        <button className="btn btn-primary btn-block" onClick={handlePublicar}>Publicar búsqueda</button>
      </div>
    );
  }

  function PantallaCandidatosHR() {
    return (
      <div>
        <p className="section-title">{candidatosHR.length} candidatos</p>
        <div className="filter-chips">{['Todas',...AREAS].map(a=><span key={a} className={`chip ${filtroArea===a?'active':''}`} onClick={()=>setFiltroArea(a)}>{a}</span>)}</div>
        {filtradosHR.map(c=>(
          <div key={c.id} className="card" style={{cursor:'pointer'}} onClick={()=>setDetail({type:'candidato_hr',data:c})}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:38,height:38,borderRadius:'50%',background:'#D6EAF5',color:'#0D3D5C',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:500,flexShrink:0}}>{c.perfiles?.nombre?.substring(0,2).toUpperCase()||'?'}</div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:14,fontWeight:500}}>{c.perfiles?.nombre||c.perfiles?.email}</p>
                <p style={{fontSize:12,color:'#6b7280'}}>{c.vacantes?.titulo} · {c.vacantes?.area}</p>
              </div>
              <div style={{textAlign:'right'}}>{estadoBadge(c.estado)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function PantallaCandidatoDetalle({ c }) {
    const [nota, setNota] = useState(c.notas||'');
    const estados = ['recibido','entrevista','finalista','descartado'];
    const labels = {recibido:'CV recibido',entrevista:'Entrevista',finalista:'Finalista',descartado:'Descartar'};
    return (
      <div>
        <div className="back-btn" onClick={()=>setDetail(null)}>← Candidatos</div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
          <div style={{width:50,height:50,borderRadius:'50%',background:'#D6EAF5',color:'#0D3D5C',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:500}}>{c.perfiles?.nombre?.substring(0,2).toUpperCase()||'?'}</div>
          <div>
            <p style={{fontSize:16,fontWeight:500}}>{c.perfiles?.nombre}</p>
            <p style={{fontSize:12,color:'#6b7280'}}>{c.vacantes?.titulo} · {c.vacantes?.area}</p>
            {c.perfiles?.linkedin && <a href={`https://${c.perfiles.linkedin}`} target="_blank" rel="noreferrer" style={{fontSize:12,color:'#0A66C2',display:'block',marginTop:4}}>🔗 {c.perfiles.linkedin}</a>}
          </div>
        </div>
        {c.perfiles?.cv_url && (
          <div className="card" style={{marginBottom:12}}>
            <p style={{fontSize:13,fontWeight:500,marginBottom:8}}>📄 CV adjunto</p>
            <p style={{fontSize:12,color:'#6b7280',marginBottom:8}}>{c.perfiles.cv_nombre}</p>
            <a href={c.perfiles.cv_url} target="_blank" rel="noreferrer" className="btn btn-sm">⬇ Descargar CV</a>
          </div>
        )}
        <div className="card" style={{marginBottom:12}}>
          <p style={{fontSize:12,color:'#6b7280',marginBottom:8}}>Estado del proceso</p>
          <p style={{marginBottom:10}}>{estadoBadge(c.estado)}</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {estados.map(e=><button key={e} className={`btn btn-sm ${c.estado===e?'btn-primary':''}`} onClick={()=>cambiarEstado(c.id,e)}>{labels[e]}</button>)}
          </div>
          {c.estado==='entrevista' && (
            <><hr className="divider" />
            <div className="input-group"><label>Fecha y hora</label><input type="datetime-local" /></div>
            <div className="input-group"><label>Modalidad</label><select><option>Zoom</option><option>Presencial</option><option>Teléfono</option></select></div>
            <button className="btn btn-sm btn-primary">Notificar al candidato</button></>
          )}
        </div>
        <div className="card">
          <p style={{fontSize:13,fontWeight:500,marginBottom:8}}>📝 Notas internas</p>
          <textarea value={nota} onChange={e=>setNota(e.target.value)} style={{width:'100%',padding:8,borderRadius:8,border:'0.5px solid #d1d5db',fontSize:12,fontFamily:'inherit',minHeight:60}} placeholder="Notas privadas del equipo de RRHH..." />
          <button className="btn btn-sm" style={{marginTop:6}} onClick={()=>guardarNota(c.id,nota)}>Guardar nota</button>
        </div>
      </div>
    );
  }

  function renderCandidato() {
    if (detail?.type==='vacante') return <PantallaVacanteDetalle v={detail.data} />;
    if (detail?.type==='login') return <PantallaLogin />;
    if (detail?.type==='exito') return (
      <div style={{textAlign:'center',padding:'52px 16px'}}>
        <div style={{width:64,height:64,background:'#E1F0F7',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:32}}>✓</div>
        <p style={{fontSize:17,fontWeight:500,marginBottom:8}}>¡Postulación enviada!</p>
        <p style={{fontSize:13,color:'#6b7280',marginBottom:24,lineHeight:1.6}}>Recibimos tu CV para <strong>{detail.titulo}</strong>.<br/>Te notificaremos los avances por email.</p>
        <button className="btn btn-primary" onClick={()=>{setDetail(null);setPage('postulaciones')}}>Ver mis postulaciones</button>
      </div>
    );
    if (page==='vacantes') return <PantallaVacantes />;
    if (page==='postulaciones') return <PantallaPostulaciones />;
    return <PantallaPerfil />;
  }

  function renderHR() {
    if (!esHR) return <div className="empty"><p style={{fontSize:14,fontWeight:500}}>Acceso no autorizado.</p></div>;
    if (detail?.type==='candidato_hr') return <PantallaCandidatoDetalle c={detail.data} />;
    if (detail?.type==='nueva_busqueda') return <PantallaNuevaBusqueda />;
    if (hrPage==='busquedas') return <PantallaBusquedasHR />;
    if (hrPage==='candidatos') return <PantallaCandidatosHR />;
    return <PantallaBusquedasHR />;
  }

  return (
    <div style={{background:'#f0f4f8',minHeight:'100vh',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px 0'}}>
      <div className="app">
        <div className="topbar">
          <img src="/logo_free.jpg" alt="Free Customs" style={{height:38,objectFit:'contain'}} />
          {esHR && (
            <button className="topbar-role" onClick={()=>{setRole(r=>r==='candidato'?'hr':'candidato');setDetail(null);}}>
              {role==='candidato'?'Panel RRHH':'Portal candidato'}
            </button>
          )}
        </div>
        <div className="accent-bar"></div>
        <div className="nav-tabs">
          {role==='candidato' ? <>
            <div className={`nav-tab ${page==='vacantes'&&!detail?'active':''}`} onClick={()=>{setPage('vacantes');setDetail(null)}}>🔍<span>Vacantes</span></div>
            <div className={`nav-tab ${page==='postulaciones'&&!detail?'active':''}`} onClick={()=>{setPage('postulaciones');setDetail(null)}}>📋<span>Mis postulaciones</span></div>
            <div className={`nav-tab ${page==='perfil'&&!detail?'active':''}`} onClick={()=>{setPage('perfil');setDetail(null)}}>👤<span>Mi perfil</span></div>
          </> : <>
            <div className={`nav-tab ${hrPage==='busquedas'&&!detail?'active':''}`} onClick={()=>{setHrPage('busquedas');setDetail(null)}}>💼<span>Búsquedas</span></div>
            <div className={`nav-tab ${hrPage==='candidatos'&&!detail?'active':''}`} onClick={()=>{setHrPage('candidatos');setDetail(null);cargarCandidatosHR()}}>👥<span>Candidatos</span></div>
          </>}
        </div>
        <div className="screen">
          {role==='candidato' ? renderCandidato() : renderHR()}
        </div>
      </div>
    </div>
  );
}

export default App;