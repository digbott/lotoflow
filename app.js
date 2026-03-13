// ─────────────────────────────────────────────
//  LotoFlow · app.js
//  React 18 via CDN + Babel Standalone (JSX)
// ─────────────────────────────────────────────

const { useState, useMemo, useEffect, useRef, useCallback } = React;

// ── [F2] Controle de acesso: lista de e-mails de visualizadores ───────────────
// A proteção real vem das Regras do Firestore (apenas leitura para não-admins).
// Esta lista serve apenas para personalizar a UI (ocultar formulários).
const VIEWER_EMAILS = [
  "visualizador@lotoflow.com",
];

// ── Constantes globais ──────────────────────────────────────────────────────
const DEFAULT_TIPO_FLUXO = { Repasse:"saida", Recolhimento:"saida", Suprimento:"entrada", Vale:"entrada" };
const DEFAULT_TIPOS      = ["Repasse","Recolhimento","Suprimento","Vale"];
const FORMAS_PAG         = ["Pix","Boleto","Dinheiro"];
// [F12] CURRENT_YEAR removido daqui — calculado inline nos componentes

// ── [F15] Helpers de moeda — armazenamento em centavos inteiros ─────────────
// Todos os valores no estado/Firestore são inteiros de centavos (ex: R$10,50 → 1050).
// A formatação acontece apenas na exibição.
const BRL = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
const formatCurrency = (centavos) => BRL.format((centavos || 0) / 100);

const formatInput = (v) => {
  if (!v) return ""; // [N8] guard contra null/undefined
  const num = v.replace(/\D/g, "");
  if (!num) return "";
  return BRL.format(parseInt(num, 10) / 100);
};

// Retorna centavos inteiros (nunca float)
const parseInput = (v) => {
  if (!v) return 0;
  const num = v.replace(/\D/g, "");
  return num ? parseInt(num, 10) : 0;
};

// ── Helpers de data ──────────────────────────────────────────────────────────
// [N4] today() usa horário local — toISOString() retorna UTC e causaria bug de fuso
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const formatDate = (d) => {
  if (!d) return "—";
  const [y,m,day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// ── [F5] Gerador de ID único (substitui sequencial previsível) ───────────────
const genId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
};

// ── [F13] DEFAULT_ENTIDADES sem nomes pessoais reais ────────────────────────
// Dados reais vivem apenas no Firestore protegido por autenticação.
const DEFAULT_ENTIDADES = [
  { nome:"Lotérica", roles:["entidade"] },
  { nome:"Banco",    roles:["credor"] },
];

// ── Ícone SVG do logo ────────────────────────────────────────────────────────
// [N9] gradId gerado via useId() para evitar colisão quando múltiplas instâncias coexistem no DOM
function LogoSVG({ size = 30 }) {
  const uid = React.useId();
  const gradId = `grad-${uid.replace(/:/g,'')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1e40af"/>
          <stop offset="100%" stopColor="#2563eb"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="18" fill={`url(#${gradId})`}/>
      <polygon points="40,12 68,40 40,68 12,40" fill="none" stroke="white" strokeWidth="2.5" opacity="0.6"/>
      <line x1="32" y1="50" x2="32" y2="30" stroke="#4ade80" strokeWidth="3" strokeLinecap="round"/>
      <polygon points="32,26 27,34 37,34" fill="#4ade80"/>
      <line x1="48" y1="30" x2="48" y2="50" stroke="#f87171" strokeWidth="3" strokeLinecap="round"/>
      <polygon points="48,54 43,46 53,46" fill="#f87171"/>
    </svg>
  );
}

// ── [F14] Toast de notificação ───────────────────────────────────────────────
function Toast({ toasts, dismiss }) {
  if (!toasts.length) return null;
  return (
    <div style={{position:"fixed",bottom:"calc(var(--bnav-h, 0px) + 1rem)",right:"1rem",zIndex:9999,display:"flex",flexDirection:"column",gap:".5rem",maxWidth:340}}>
      {toasts.map(toast => (
        <div key={toast.id} style={{
          display:"flex",alignItems:"center",gap:".75rem",
          background: toast.type==="erro" ? "#fef2f2" : toast.type==="aviso" ? "#fffbeb" : "#f0fdf4",
          border:`1px solid ${toast.type==="erro"?"#fca5a5":toast.type==="aviso"?"#fcd34d":"#86efac"}`,
          borderRadius:10,padding:".75rem 1rem",boxShadow:"0 4px 16px rgba(0,0,0,.12)",
          fontFamily:"var(--font)",fontSize:".82rem",
          color: toast.type==="erro"?"#991b1b":toast.type==="aviso"?"#92400e":"#166534",
        }}>
          <span style={{fontSize:"1rem",flexShrink:0}}>
            {toast.type==="erro"?"❌":toast.type==="aviso"?"⚠️":"✅"}
          </span>
          <span style={{flex:1}}>{toast.message}</span>
          {toast.action && (
            <button onClick={toast.action.fn}
              style={{background:"none",border:"none",cursor:"pointer",fontWeight:700,fontSize:".8rem",color:"inherit",textDecoration:"underline",flexShrink:0}}>
              {toast.action.label}
            </button>
          )}
          <button onClick={()=>dismiss(toast.id)}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:".9rem",color:"inherit",flexShrink:0,opacity:.6}}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── [F9] Modal de confirmação ────────────────────────────────────────────────
function ConfirmModal({ modal, onConfirm, onCancel }) {
  if (!modal) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
      <div style={{background:"#fff",borderRadius:14,padding:"1.75rem",maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
        <div style={{fontSize:"1.5rem",marginBottom:".75rem"}}>{modal.icon || "🗑️"}</div>
        <div style={{fontWeight:700,fontSize:"1rem",color:"#111827",marginBottom:".5rem"}}>{modal.title}</div>
        <div style={{fontSize:".85rem",color:"#6b7280",marginBottom:"1.5rem"}}>{modal.message}</div>
        <div style={{display:"flex",gap:".75rem",justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-danger" style={{background:"#dc2626",color:"#fff",border:"none"}} onClick={onConfirm}>
            {modal.confirmLabel || "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Indicador de sync ────────────────────────────────────────────────────────
function SyncIndicator({ status, onRetry }) {
  const map = {
    carregando: { color:"var(--warning)",  label:"Carregando..." },
    salvando:   { color:"var(--accent)",   label:"Salvando..." },
    ok:         { color:"var(--success)",  label:"Salvo" },
    // [F14] Erro agora tem botão de retry
    erro:       { color:"var(--danger)",   label:"Erro ao salvar" },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0,fontFamily:"var(--font-mono)",fontSize:".66rem",color:cfg.color}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:cfg.color,display:"inline-block"}}/>
      {cfg.label}
      {status==="erro" && onRetry && (
        <button onClick={onRetry}
          style={{background:"none",border:"1px solid var(--danger)",borderRadius:4,padding:"1px 5px",fontSize:".6rem",color:"var(--danger)",cursor:"pointer",marginLeft:2}}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Componente principal App
// ═══════════════════════════════════════════════════════════════════════════════
function App({ onLogout, userEmail }) {

  // [F2] Verificação de visualizador (UX apenas — autorização real está no Firestore)
  const isViewer = VIEWER_EMAILS.includes((userEmail || "").toLowerCase());

  const ALL_TABS = [
    ["dashboard",  "📊","Início",   "Dashboard"],
    ["lancamentos","➕","Lançar",   "Lançamentos"],
    ["historico",  "📋","Histórico","Histórico"],
    ["debitos",    "💳","Contas",   "Pagar/Receber"],
    ["cadastros",  "⚙️","Config",  "Cadastro"],
  ];
  const TABS = isViewer
    ? ALL_TABS.filter(([k]) => ["dashboard","historico","debitos"].includes(k))
    : ALL_TABS;

  const [tab, setTab] = useState("dashboard");

  // ── Estado: Transações ────────────────────────────────────────────────────
  // [F15] valores em centavos inteiros
  const [transacoes, setTransacoes] = useState([]);
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterData, setFilterData] = useState("");
  const [form, setForm] = useState({ descricao:"", descricao_livre:"", origem:"", destino:"", valor:"", data:today() });

  // ── [F16] Paginação do histórico ──────────────────────────────────────────
  const PAGE_SIZE = 50;
  const [histPage, setHistPage] = useState(1);

  // ── Estado: Tipos de lançamento ───────────────────────────────────────────
  const [tiposList,   setTiposList]   = useState(DEFAULT_TIPOS);
  const [tipoFluxo,   setTipoFluxo]   = useState(DEFAULT_TIPO_FLUXO);
  const [cadEditTipo, setCadEditTipo] = useState({ idx:null, nome:"", fluxo:"saida" });
  const [cadNewTipo,  setCadNewTipo]  = useState({ nome:"", fluxo:"saida" });

  // ── Estado: Entidades ─────────────────────────────────────────────────────
  const [entidades,  setEntidades]  = useState(DEFAULT_ENTIDADES);
  const [cadEditEnt, setCadEditEnt] = useState({ idx:null, nome:"", roles:[] });
  const [cadNewEnt,  setCadNewEnt]  = useState({ nome:"", roles:["entidade"] });

  // Listas derivadas
  const pessoasList   = useMemo(() => entidades.filter(e=>e.roles.includes("entidade")).map(e=>e.nome), [entidades]);
  const credoresList  = useMemo(() => entidades.filter(e=>e.roles.includes("credor")).map(e=>e.nome),         [entidades]);
  const devedoresList = useMemo(() => entidades.filter(e=>e.roles.includes("devedor")).map(e=>e.nome),        [entidades]);

  // ── Estado: Débitos ───────────────────────────────────────────────────────
  const [debitos,        setDebitos]        = useState([]);
  const [debitoForm,     setDebitoForm]     = useState({ credor:"", valor:"", data:today(), descricao:"" });
  const [pagForm,        setPagForm]        = useState({ debitoId:null, valor:"", data:today(), forma:"Pix" });
  const [expandedDebito, setExpandedDebito] = useState(null);

  // ── Estado: Empréstimos ───────────────────────────────────────────────────
  const [emprestimos, setEmprestimos] = useState([]);
  const [empForm,     setEmpForm]     = useState({ devedor:"", valor:"", data:today(), descricao:"" });
  const [recForm,     setRecForm]     = useState({ empId:null, valor:"", data:today(), forma:"Pix" });
  const [expandedEmp, setExpandedEmp] = useState(null);

  const [debitosSubTab, setDebitosSubTab] = useState("debitosLoterica");

  // ── [F14] Toast system ────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type="ok", action=null, duration=4500) => {
    const id = genId();
    setToasts(prev => [...prev, { id, message, type, action }]);
    if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t=>t.id!==id)), duration);
    return id;
  }, []);
  const dismissToast = useCallback((id) => setToasts(prev => prev.filter(t=>t.id!==id)), []);

  // ── [F9] Modal de confirmação ─────────────────────────────────────────────
  const [modal, setModal] = useState(null);
  const confirm = useCallback((opts) => new Promise(resolve => {
    setModal({ ...opts, resolve });
  }), []);
  const handleConfirm = () => { modal?.resolve(true);  setModal(null); };
  const handleCancel  = () => { modal?.resolve(false); setModal(null); };

  // ── Firestore Sync ────────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState("carregando");
  const saveTimerRef  = useRef(null);
  const pendingPatch  = useRef(null); // [F7] guarda patch pendente para flush no beforeunload

  useEffect(() => {
    const db = window.__db;
    if (!db) return;
    const { doc, getDoc } = window.firestoreLib;
    getDoc(doc(db, "lotoflow", "dados"))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          // [F6] IDs agora são UUIDs — campos nextXxxId removidos
          if (d.transacoes?.length)  setTransacoes(d.transacoes);
          if (d.debitos?.length)     setDebitos(d.debitos);
          if (d.emprestimos?.length) setEmprestimos(d.emprestimos);
          if (d.tiposList?.length)   setTiposList(d.tiposList);
          if (d.tipoFluxo)           setTipoFluxo(d.tipoFluxo);
          if (d.entidades?.length)   setEntidades(d.entidades);
        }
        setSyncStatus("ok");
      })
      .catch(() => {
        setSyncStatus("erro");
        addToast("Falha ao carregar dados do servidor.", "erro");
      });
  }, []);

  // [F7] Flush imediato antes de fechar a aba
  useEffect(() => {
    const flush = () => {
      if (!pendingPatch.current || isViewer) return;
      const db = window.__db;
      if (!db) return;
      const { doc, setDoc, serverTimestamp } = window.firestoreLib;
      // sendBeacon não suporta Firestore SDK — usamos fetch síncrono como fallback
      try {
        setDoc(doc(db, "lotoflow", "dados"),
          { ...pendingPatch.current, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch(_) {}
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [isViewer]);

  const doSave = useCallback((patch) => {
    if (isViewer) return;
    const db = window.__db;
    if (!db) return;
    const { doc, setDoc, serverTimestamp } = window.firestoreLib;
    return setDoc(doc(db, "lotoflow", "dados"),
      { ...patch, updatedAt: serverTimestamp() },
      { merge: true }
    ).then(() => {
      setSyncStatus("ok");
      pendingPatch.current = null;
    }).catch(() => {
      setSyncStatus("erro");
    });
  }, [isViewer]);

  const savePatch = useCallback((patch) => {
    if (isViewer) return;
    setSyncStatus("salvando");
    pendingPatch.current = { ...(pendingPatch.current || {}), ...patch }; // [F7] acumula para flush
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(pendingPatch.current), 800); // [N1] usa acumulado
  }, [isViewer, doSave]);

  // [F14] Retry manual
  const handleRetry = useCallback(() => {
    if (pendingPatch.current) doSave(pendingPatch.current);
  }, [doSave]);

  // ── [F11] Cálculos derivados memoizados ───────────────────────────────────
  const totalEntradas = useMemo(() =>
    transacoes.filter(t=>t.tipo==="entrada").reduce((s,t)=>s+t.valor,0),
  [transacoes]);
  const totalSaidas = useMemo(() =>
    transacoes.filter(t=>t.tipo==="saida").reduce((s,t)=>s+t.valor,0),
  [transacoes]);
  const saldo = totalEntradas - totalSaidas;

  // [F16] Filtragem e paginação do histórico
  const filteredTx = useMemo(() => transacoes
    .filter(t => {
      if (filterTipo !== "todos" && t.tipo !== filterTipo) return false;
      if (filterData && t.data !== filterData) return false;
      return true;
    })
    .sort((a,b) => b.data.localeCompare(a.data) || String(b.id).padStart(36,'0').localeCompare(String(a.id).padStart(36,'0'))),
  [transacoes, filterTipo, filterData]);

  const histDates = useMemo(() =>
    [...new Set(filteredTx.map(t=>t.data))].sort((a,b)=>b.localeCompare(a)),
  [filteredTx]);

  const pagedDates = useMemo(() => histDates.slice(0, histPage * PAGE_SIZE), [histDates, histPage]);

  // [F11] Mapas de totais memoizados — evita recalcular em todo render
  const pagoPorDebitoMap = useMemo(() =>
    Object.fromEntries(debitos.map(d => [d.id, d.pagamentos.reduce((s,p)=>s+p.valor, 0)])),
  [debitos]);
  const recPorEmpMap = useMemo(() =>
    Object.fromEntries(emprestimos.map(e => [e.id, e.recebimentos.reduce((s,r)=>s+r.valor, 0)])),
  [emprestimos]);

  const pagoPorDebito = (d) => pagoPorDebitoMap[d.id] ?? 0;
  const recPorEmp     = (e) => recPorEmpMap[e.id]     ?? 0;

  // [N7] Derivações memoizadas — evita recalcular inline no JSX a cada render
  const debitosAbertos  = useMemo(() => debitos.filter(d => (pagoPorDebitoMap[d.id]??0) <  d.valor), [debitos, pagoPorDebitoMap]);
  const debitosQuit     = useMemo(() => debitos.filter(d => (pagoPorDebitoMap[d.id]??0) >= d.valor), [debitos, pagoPorDebitoMap]);
  const empsAbertos     = useMemo(() => emprestimos.filter(e => (recPorEmpMap[e.id]??0) <  e.valor), [emprestimos, recPorEmpMap]);
  const empsQuit        = useMemo(() => emprestimos.filter(e => (recPorEmpMap[e.id]??0) >= e.valor), [emprestimos, recPorEmpMap]);
  const totalDevido     = useMemo(() => debitosAbertos.reduce((s,d)=>s+d.valor-(pagoPorDebitoMap[d.id]??0),0), [debitosAbertos, pagoPorDebitoMap]);
  const totalEmprestado = useMemo(() => debitos.reduce((s,d)=>s+d.valor,0), [debitos]);
  const totalPago       = useMemo(() => debitos.reduce((s,d)=>s+(pagoPorDebitoMap[d.id]??0),0), [debitos, pagoPorDebitoMap]);
  const totalAReceber   = useMemo(() => empsAbertos.reduce((s,e)=>s+e.valor-(recPorEmpMap[e.id]??0),0), [empsAbertos, recPorEmpMap]);
  const totalEmpOut     = useMemo(() => emprestimos.reduce((s,e)=>s+e.valor,0), [emprestimos]);
  const totalRecebido   = useMemo(() => emprestimos.reduce((s,e)=>s+(recPorEmpMap[e.id]??0),0), [emprestimos, recPorEmpMap]);

  // ── Regras de negócio ─────────────────────────────────────────────────────
  const computeFluxo = (descricao, origem) => {
    if (descricao==="Repasse" || descricao==="Recolhimento")
      return origem==="Lotérica" ? "saida" : "entrada";
    return tipoFluxo[descricao] || "entrada";
  };

  // [F5] IDs agora são UUIDs via genId()
  const handleAdd = () => {
    if (!form.descricao || !parseInput(form.valor) || !form.data) return;
    const tipoFinal = computeFluxo(form.descricao, form.origem);
    const destinoFinal =
      form.descricao==="Suprimento" ? "Lotérica"
      : form.descricao==="Recolhimento" && form.origem==="Lotérica" ? "Banco"
      : form.descricao==="Recolhimento" && form.origem!=="Lotérica" ? "Lotérica"
      : form.destino;
    const novaT = { ...form, tipo:tipoFinal, destino:destinoFinal,
      id: genId(),
      valor: parseInput(form.valor), // centavos
    };
    setTransacoes(prev => {
      const next = [...prev, novaT];
      savePatch({ transacoes: next });
      return next;
    });
    setForm(f => ({ ...f, descricao:"", descricao_livre:"", origem:"", destino:"", valor:"", data:today() })); // [N6] reseta data também
  };

  // ── Guard: redireciona tab inválida para viewer ───────────────────────────
  useEffect(() => {
    const valid = TABS.map(t=>t[0]);
    if (!valid.includes(tab)) setTab("dashboard");
  }, [isViewer]);

  // ── [F9] Helpers de exclusão com confirmação ──────────────────────────────
  const deleteTransacao = useCallback(async (id) => {
    const ok = await confirm({
      title: "Excluir lançamento?",
      message: "Esta ação não pode ser desfeita. O lançamento será removido permanentemente.",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    setTransacoes(prev => { const next=prev.filter(x=>x.id!==id); savePatch({transacoes:next}); return next; });
    addToast("Lançamento excluído.", "ok");
  }, [confirm, savePatch, addToast]);

  const deleteDebito = useCallback(async (id) => {
    const ok = await confirm({
      title: "Excluir débito?",
      message: "O débito e todos os pagamentos associados serão removidos permanentemente.",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    setDebitos(prev => { const next=prev.filter(x=>x.id!==id); savePatch({debitos:next}); return next; });
    addToast("Débito excluído.", "ok");
  }, [confirm, savePatch, addToast]);

  const deletePagamento = useCallback(async (debitoId, pagId) => {
    const ok = await confirm({
      title: "Remover pagamento?",
      message: "O registro de pagamento será excluído.",
      confirmLabel: "Remover",
      icon: "💳",
    });
    if (!ok) return;
    setDebitos(prev => {
      const next = prev.map(x => x.id===debitoId ? {...x, pagamentos:x.pagamentos.filter(p=>p.id!==pagId)} : x);
      savePatch({debitos:next});
      return next;
    });
    addToast("Pagamento removido.", "ok");
  }, [confirm, savePatch, addToast]);

  const deleteEmprestimo = useCallback(async (id) => {
    const ok = await confirm({
      title: "Excluir empréstimo?",
      message: "O empréstimo e todos os recebimentos associados serão removidos permanentemente.",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    setEmprestimos(prev => { const next=prev.filter(x=>x.id!==id); savePatch({emprestimos:next}); return next; });
    addToast("Empréstimo excluído.", "ok");
  }, [confirm, savePatch, addToast]);

  const deleteRecebimento = useCallback(async (empId, recId) => {
    const ok = await confirm({
      title: "Remover recebimento?",
      message: "O registro de recebimento será excluído.",
      confirmLabel: "Remover",
      icon: "💰",
    });
    if (!ok) return;
    setEmprestimos(prev => {
      const next = prev.map(x => x.id===empId ? {...x, recebimentos:x.recebimentos.filter(r=>r.id!==recId)} : x);
      savePatch({emprestimos:next});
      return next;
    });
    addToast("Recebimento removido.", "ok");
  }, [confirm, savePatch, addToast]);

  // ── [F8] Dados do dashboard ───────────────────────────────────────────────
  const dashboardData = useMemo(() => {
    // Saldo acumulado por dia
    const byDay = {};
    transacoes.forEach(t => {
      byDay[t.data] = (byDay[t.data] || 0) + (t.tipo==="entrada" ? t.valor : -t.valor);
    });
    const sortedDates = Object.keys(byDay).sort();
    let accumulated = 0;
    const chartData = sortedDates.map(d => {
      accumulated += byDay[d];
      return { date: formatDate(d), saldo: accumulated, diario: byDay[d] };
    });
    // Último dia
    const lastDate = sortedDates[sortedDates.length - 1];
    const lastDayTx = lastDate ? transacoes.filter(t=>t.data===lastDate).sort((a,b)=>String(a.id).padStart(36,'0').localeCompare(String(b.id).padStart(36,'0'))) : [];
    // Saldo acumulado até o último dia (não apenas o delta do dia)
    const lastDaySaldo = chartData.length ? chartData[chartData.length - 1].saldo : 0;
    // Mês atual
    const mes = new Date().toISOString().slice(0,7);
    const mesEntradas = transacoes.filter(t=>t.tipo==="entrada"&&t.data.startsWith(mes)).reduce((s,t)=>s+t.valor,0);
    const mesSaidas   = transacoes.filter(t=>t.tipo==="saida"  &&t.data.startsWith(mes)).reduce((s,t)=>s+t.valor,0);
    return { lastDate, lastDayTx, lastDaySaldo, chartData: chartData.slice(-30), mesEntradas, mesSaidas };
  }, [transacoes]);

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="app">

      {/* Modais e Toasts */}
      <ConfirmModal modal={modal} onConfirm={handleConfirm} onCancel={handleCancel}/>
      <Toast toasts={toasts} dismiss={dismissToast}/>

      {/* HEADER */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon" style={{background:"none",padding:0}}>
            <LogoSVG size={30}/>
          </div>
          <div>
            <div className="logo-text">LotoFlow</div>
            <div className="logo-sub">Fluxo de Caixa para Loterias</div>
          </div>
        </div>

        <nav className="nav">
          {TABS.map(([k,,,l]) => (
            <button key={k} className={`nav-btn${tab===k?" active":""}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>

        <div className="ticker">
          <span className="dot-live"/>
          {new Date().toLocaleDateString("pt-BR")}
        </div>

        {isViewer && (
          <span className="badge badge-viewer" style={{flexShrink:0}}>👁 Visualizador</span>
        )}

        <button
          onClick={onLogout}
          style={{background:"none",border:"1px solid var(--border)",borderRadius:6,padding:".3rem .7rem",fontFamily:"var(--font-mono)",fontSize:".65rem",color:"var(--text-tertiary)",cursor:"pointer",flexShrink:0}}
        >
          Sair
        </button>

        <SyncIndicator status={syncStatus} onRetry={handleRetry}/>
      </header>

      {/* BOTTOM NAV (mobile) */}
      <nav className="bottom-nav">
        {TABS.map(([k,icon,l]) => (
          <button key={k} className={`bnav-btn${tab===k?" active":""}`} onClick={() => setTab(k)}>
            <span className="bnav-icon">{icon}</span>
            <span>{l}</span>
            <span className="bnav-dot"/>
          </button>
        ))}
      </nav>

      {/* MAIN */}
      <main className="main">

        {/* ══ DASHBOARD ══ */}
        {tab==="dashboard" && (() => {
          const { lastDate, lastDayTx, lastDaySaldo, mesEntradas, mesSaidas } = dashboardData;
          return (
            <>
              {/* KPIs */}
              <div className="kpi-grid" style={{marginBottom:"1.25rem"}}>
                <div className="kpi-card" style={{"--accent-color":lastDaySaldo>=0?"var(--accent)":"var(--danger)"}}>
                  <div className="kpi-label">Saldo do Dia</div>
                  <div className="kpi-value" style={{color:lastDaySaldo>=0?"var(--accent)":"var(--danger)"}}>{formatCurrency(lastDaySaldo)}</div>
                  <div className="kpi-sub">{lastDaySaldo>=0?"✓ Positivo":"✗ Negativo"}</div>
                </div>
                <div className="kpi-card" style={{"--accent-color":"var(--success)"}}>
                  <div className="kpi-label">Entradas no mês</div>
                  <div className="kpi-value" style={{color:"var(--success)"}}>{formatCurrency(mesEntradas)}</div>
                  <div className="kpi-sub">{new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</div>
                </div>
                <div className="kpi-card" style={{"--accent-color":"var(--danger)"}}>
                  <div className="kpi-label">Saídas no mês</div>
                  <div className="kpi-value" style={{color:"var(--danger)"}}>{formatCurrency(mesSaidas)}</div>
                  <div className="kpi-sub">Saldo do mês: {formatCurrency(mesEntradas-mesSaidas)}</div>
                </div>
              </div>


              {lastDate ? (
                <>
                  <div className="section-title">Movimentações de {formatDate(lastDate)}</div>
                  <div className="table-card">
                    <div className="table-scroll">
                      <table>
                        <thead><tr><th>Ação</th><th>Descrição</th><th>De → Para</th><th>Valor</th></tr></thead>
                        <tbody>
                          {lastDayTx.map(t => (
                            <tr key={t.id}>
                              <td>
                                <span className={`badge badge-${t.tipo}`}>{t.tipo==="entrada"?"↑ Entrada":"↓ Saída"}</span>
                                {" "}<span style={{fontSize:".78rem",color:"var(--text-tertiary)"}}>{t.descricao}</span>
                              </td>
                              <td style={{color:"var(--text-tertiary)",fontSize:".82rem"}}>{t.descricao_livre||"—"}</td>
                              <td style={{fontSize:".8rem",color:"var(--text-tertiary)"}}>{t.origem||"—"} → {t.destino||"—"}</td>
                              <td className={`val-${t.tipo}`}>{t.tipo==="entrada"?"+":"-"}{formatCurrency(t.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{padding:".875rem 1.25rem",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"flex-end",alignItems:"center",gap:".75rem",background:"var(--surface2)"}}>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:".68rem",letterSpacing:"1px",textTransform:"uppercase",color:"var(--text-tertiary)"}}>Saldo acumulado</span>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:"1rem",fontWeight:700,color:lastDaySaldo>=0?"var(--accent)":"var(--danger)"}}>
                        {lastDaySaldo>=0?"+":""}{formatCurrency(lastDaySaldo)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty">Nenhuma movimentação registrada.</div>
              )}
            </>
          );
        })()}

        {/* ══ LANÇAMENTOS ══ (somente admin) */}
        {tab==="lancamentos" && !isViewer && (
          <>
            <div className="section-title">Novo Lançamento</div>
            <div className="form-card">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Pessoa/Entidade</label>
                  <select className="form-select" value={form.origem} onChange={e=>{
                    const val = e.target.value;
                    const nd = form.descricao==="Recolhimento" && val!=="Lotérica" ? "Lotérica"
                      : form.descricao==="Recolhimento" && val==="Lotérica" ? "Banco"
                      : form.destino===val ? "" : form.destino;
                    setForm(f=>({...f,origem:val,destino:nd}));
                  }}>
                    <option value="">Selecione...</option>
                    {pessoasList.filter(p=>p!==form.destino).map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Ação</label>
                  <select className="form-select" value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value,origem:"",destino:""}))}>
                    <option value="">Selecione...</option>
                    {tiposList.map(o=><option key={o}>{o}</option>)}
                  </select>
                  {form.descricao && (() => {
                    const fluxo = computeFluxo(form.descricao, form.origem);
                    return <span style={{fontSize:".68rem",fontFamily:"var(--font-mono)",marginTop:".3rem",color:fluxo==="saida"?"var(--danger)":"var(--success)"}}>{fluxo==="saida"?"↓ Saída":"↑ Entrada"}</span>;
                  })()}
                </div>
                <div className="form-group">
                  <label className="form-label">Pessoa/Entidade</label>
                  {form.descricao==="Suprimento" || form.descricao==="Vale"
                    ? <input className="form-input" value="Lotérica" readOnly style={{opacity:.5,cursor:"not-allowed"}}/>
                    : form.descricao==="Recolhimento" && form.origem==="Lotérica"
                    ? <input className="form-input" value="Banco" readOnly style={{opacity:.5,cursor:"not-allowed"}}/>
                    : form.descricao==="Recolhimento" && form.origem && form.origem!=="Lotérica"
                    ? <input className="form-input" value="Lotérica" readOnly style={{opacity:.5,cursor:"not-allowed"}}/>
                    : <select className="form-select" value={form.destino} onChange={e=>{
                        const val = e.target.value;
                        setForm(f=>({...f,destino:val,origem:f.origem===val?"":f.origem}));
                      }}>
                        <option value="">Selecione...</option>
                        {pessoasList.filter(p=>{
                          if (p===form.origem) return false;
                          if (form.descricao==="Repasse") return p!=="Lotérica";
                          return true;
                        }).map(p=><option key={p}>{p}</option>)}
                      </select>
                  }
                </div>
                <div className="form-group">
                  <label className="form-label">Valor (R$)</label>
                  <input className="form-input" type="text" placeholder="R$ 0,00" value={form.valor} onChange={e=>setForm(f=>({...f,valor:formatInput(e.target.value)}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">&nbsp;</label>
                  <button className="btn btn-accent" onClick={handleAdd}>+ Registrar</button>
                </div>
              </div>
            </div>

            <div className="section-title">Lançamentos Recentes</div>
            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Data</th><th>Ação</th><th>Descrição</th><th>De → Para</th><th>Valor</th><th></th></tr></thead>
                  <tbody>
                    {[...transacoes].sort((a,b)=>b.data.localeCompare(a.data)).map(t => (
                      <tr key={t.id}>
                        <td style={{fontFamily:"var(--font-mono)",fontSize:".78rem",color:"var(--text-tertiary)"}}>{formatDate(t.data)}</td>
                        <td>
                          <span className={`badge badge-${t.tipo}`}>{t.tipo==="entrada"?"↑ Entrada":"↓ Saída"}</span>
                          {" "}<span style={{fontSize:".78rem",color:"var(--text-tertiary)"}}>{t.descricao}</span>
                        </td>
                        <td style={{color:"var(--text-tertiary)",fontSize:".82rem"}}>{t.descricao_livre||"—"}</td>
                        <td style={{fontSize:".8rem",color:"var(--text-tertiary)"}}>{t.origem||"—"} → {t.destino||"—"}</td>
                        <td className={`val-${t.tipo}`}>{t.tipo==="entrada"?"+":"-"}{formatCurrency(t.valor)}</td>
                        <td>
                          {/* [F9] Exclusão com confirmação */}
                          <button className="btn btn-danger" style={{padding:".3rem .7rem",fontSize:".75rem"}}
                            onClick={() => deleteTransacao(t.id)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ══ HISTÓRICO ══ */}
        {tab==="historico" && (() => {
          return (
            <>
              <div className="section-title">Histórico Completo</div>
              <div className="table-card">
                <div className="table-header">
                  <span className="table-header-title">Extrato de Movimentações</span>
                  <div className="table-filters">
                    <select className="filter-input" value={filterTipo} onChange={e=>{setFilterTipo(e.target.value);setHistPage(1);}}>
                      <option value="todos">Todos</option>
                      <option value="entrada">Entradas</option>
                      <option value="saida">Saídas</option>
                    </select>
                    <input className="filter-input" type="date" value={filterData} onChange={e=>{setFilterData(e.target.value);setHistPage(1);}}/>
                    {filterData && <button className="btn btn-ghost" style={{padding:".35rem .8rem",fontSize:".75rem"}} onClick={()=>{setFilterData("");setHistPage(1);}}>✕</button>}
                  </div>
                </div>
                <div className="table-scroll">
                  {filteredTx.length===0
                    ? <div className="empty">Nenhuma transação encontrada.</div>
                    : <>
                        {/* [F16] Renderiza apenas as datas da página atual */}
                        {(() => {
                          const allDates = [...new Set(transacoes.map(t=>t.data))].sort();
                          const accumByDate = {};
                          let acc = 0;
                          allDates.forEach(d => {
                            acc += transacoes.filter(t=>t.data===d).reduce((s,t)=>t.tipo==="entrada"?s+t.valor:s-t.valor,0);
                            accumByDate[d] = acc;
                          });
                          return pagedDates.map(date => {
                          const dayTx    = filteredTx.filter(t=>t.data===date);
                          const daySaldo = accumByDate[date] ?? 0;
                          return (
                            <div key={date}>
                              <div style={{padding:".45rem 1rem",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
                                <span style={{fontFamily:"var(--font-mono)",fontSize:".68rem",letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--text-tertiary)"}}>{formatDate(date)}</span>
                              </div>
                              <table style={{width:"100%",borderCollapse:"collapse",minWidth:480}}>
                                <tbody>
                                  {dayTx.map(t => (
                                    <tr key={t.id}>
                                      <td style={{padding:".7rem 1rem",whiteSpace:"nowrap"}}>
                                        <span className={`badge badge-${t.tipo}`}>{t.tipo==="entrada"?"↑ Entrada":"↓ Saída"}</span>
                                        {" "}<span style={{fontSize:".78rem",color:"var(--text-tertiary)"}}>{t.descricao}</span>
                                      </td>
                                      <td style={{padding:".7rem .5rem",color:"var(--text-tertiary)",fontSize:".82rem"}}>{t.descricao_livre||"—"}</td>
                                      <td style={{padding:".7rem .5rem",fontSize:".8rem",color:"var(--text-tertiary)",whiteSpace:"nowrap"}}>{t.origem||"—"} → {t.destino||"—"}</td>
                                      <td style={{padding:".7rem 1rem",textAlign:"right",fontFamily:"var(--font-mono)",fontWeight:600,whiteSpace:"nowrap"}} className={`val-${t.tipo}`}>
                                        {t.tipo==="entrada"?"+":"-"}{formatCurrency(t.valor)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div style={{padding:".6rem 1rem",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"flex-end",alignItems:"center",gap:".75rem",background:"var(--surface2)"}}>
                                <span style={{fontFamily:"var(--font-mono)",fontSize:".65rem",letterSpacing:"1px",textTransform:"uppercase",color:"var(--text-tertiary)"}}>Saldo do dia</span>
                                <span style={{fontFamily:"var(--font-mono)",fontSize:".9rem",fontWeight:700,color:daySaldo>=0?"var(--accent)":"var(--danger)"}}>
                                  {daySaldo>=0?"+":""}{formatCurrency(daySaldo)}
                                </span>
                              </div>
                            </div>
                          );
                          });
                        })()}
                        {/* [F16] Botão carregar mais */}
                        {pagedDates.length < histDates.length && (
                          <div style={{padding:"1rem",textAlign:"center",borderTop:"1px solid var(--border)"}}>
                            <button className="btn btn-ghost" onClick={()=>setHistPage(p=>p+1)}>
                              Carregar mais ({histDates.length - pagedDates.length} dias restantes)
                            </button>
                          </div>
                        )}
                      </>
                  }
                </div>
              </div>
            </>
          );
        })()}

        {/* ══ PAGAR E RECEBER ══ */}
        {tab==="debitos" && (() => {
          // [N7] Variáveis movidas para useMemo no corpo do componente
          return (
            <>
              <div className="sub-tabs">
                {[["debitosLoterica","💸 Lotérica Deve"],["emprestimosLoterica","💰 Lotérica Emprestou"]].map(([k,l])=>(
                  <button key={k} className={`sub-tab-btn${debitosSubTab===k?" active":""}`} onClick={()=>setDebitosSubTab(k)}>{l}</button>
                ))}
              </div>

              {/* Sub-aba: Débitos */}
              {debitosSubTab==="debitosLoterica" && <>
                <div className="kpi-grid">
                  <div className="kpi-card" style={{"--accent-color":"var(--danger)"}}>
                    <div className="kpi-label">Em Aberto</div>
                    <div className="kpi-value" style={{color:"var(--danger)"}}>{formatCurrency(totalDevido)}</div>
                    <div className="kpi-sub">{debitosAbertos.length} débito(s) pendente(s)</div>
                  </div>
                  <div className="kpi-card" style={{"--accent-color":"var(--warning)"}}>
                    <div className="kpi-label">Total Recebido</div>
                    <div className="kpi-value" style={{color:"var(--warning)"}}>{formatCurrency(totalEmprestado)}</div>
                    <div className="kpi-sub">{debitos.length} empréstimo(s)</div>
                  </div>
                  <div className="kpi-card" style={{"--accent-color":"var(--success)"}}>
                    <div className="kpi-label">Total Pago</div>
                    <div className="kpi-value" style={{color:"var(--success)"}}>{formatCurrency(totalPago)}</div>
                    <div className="kpi-sub">{debitosQuit.length} quitado(s)</div>
                  </div>
                </div>

                {!isViewer && <>
                  <div className="section-title">Registrar Empréstimo Recebido</div>
                  <div className="form-card">
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Credor</label>
                        <select className="form-select" value={debitoForm.credor} onChange={e=>setDebitoForm(f=>({...f,credor:e.target.value}))}>
                          <option value="">Selecione...</option>
                          {credoresList.map(p=><option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Valor (R$)</label>
                        <input className="form-input" type="text" placeholder="R$ 0,00" value={debitoForm.valor} onChange={e=>setDebitoForm(f=>({...f,valor:formatInput(e.target.value)}))}/>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Data</label>
                        <input className="form-input" type="date" value={debitoForm.data} onChange={e=>setDebitoForm(f=>({...f,data:e.target.value}))}/>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Descrição</label>
                        <input className="form-input" type="text" placeholder="Motivo..." value={debitoForm.descricao} onChange={e=>setDebitoForm(f=>({...f,descricao:e.target.value}))}/>
                      </div>
                      <div className="form-group">
                        <label className="form-label">&nbsp;</label>
                        <button className="btn btn-accent" onClick={()=>{
                          if (!debitoForm.credor || !parseInput(debitoForm.valor) || !debitoForm.data) return;
                          // [F5] UUID como ID
                          const nd = { id:genId(), credor:debitoForm.credor, valor:parseInput(debitoForm.valor), data:debitoForm.data, descricao:debitoForm.descricao, pagamentos:[] };
                          setDebitos(prev=>{const next=[...prev,nd];savePatch({debitos:next});return next;});
                          setDebitoForm({credor:"",valor:"",data:today(),descricao:""});
                        }}>+ Registrar</button>
                      </div>
                    </div>
                  </div>
                </>}

                <div className="section-title">Débitos em Aberto</div>
                {debitosAbertos.length===0 && <div className="empty" style={{marginBottom:"1.5rem"}}>Nenhum débito em aberto. 🎉</div>}
                {debitosAbertos.map(d => {
                  const pago     = pagoPorDebito(d);
                  const restante = d.valor - pago;
                  const pct      = Math.min(100,(pago/d.valor)*100);
                  const isExp    = expandedDebito===d.id;
                  return (
                    <div key={d.id} className="debito-card">
                      <div className="debito-card-header" onClick={()=>setExpandedDebito(isExp?null:d.id)}>
                        <div className="debito-info">
                          <div className="debito-name">{d.credor}</div>
                          <div className="debito-meta">{formatDate(d.data)}{d.descricao?` · ${d.descricao}`:""}</div>
                        </div>
                        <div className="debito-amount">
                          <div className="debito-amount-label">Restante</div>
                          <div className="debito-amount-value" style={{color:"var(--danger)"}}>{formatCurrency(restante)}</div>
                        </div>
                        <div className="debito-progress">
                          <div className="debito-progress-labels">
                            <span>Pago {formatCurrency(pago)} / {formatCurrency(d.valor)}</span>
                            <span style={{color:"var(--accent)"}}>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="progress-track"><div className="progress-bar" style={{width:`${pct}%`,background:"var(--accent)"}}/></div>
                        </div>
                        <div className="debito-actions">
                          <span style={{fontFamily:"var(--font-mono)",fontSize:".7rem",color:"var(--text-tertiary)"}}>{isExp?"▲":"▼"}</span>
                          {!isViewer && (
                            <button className="btn btn-danger" style={{padding:".3rem .7rem",fontSize:".75rem"}}
                              onClick={ev=>{ev.stopPropagation();deleteDebito(d.id);}}>
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      {isExp && (
                        <div className="debito-body">
                          {d.pagamentos.length>0 && (
                            <div style={{marginBottom:"1rem"}}>
                              <div className="kpi-label" style={{marginBottom:".5rem"}}>Pagamentos realizados</div>
                              {d.pagamentos.map(p => (
                                <div key={p.id} className="pag-row">
                                  <span style={{fontFamily:"var(--font-mono)",fontSize:".75rem",color:"var(--text-tertiary)",minWidth:75}}>{formatDate(p.data)}</span>
                                  <span className="badge" style={{background:"var(--success-dim)",color:"var(--success)"}}>{p.forma}</span>
                                  <span style={{fontFamily:"var(--font-mono)",fontWeight:600,color:"var(--success)",marginLeft:"auto"}}>{formatCurrency(p.valor)}</span>
                                  {!isViewer && (
                                    <button className="btn btn-danger" style={{padding:".2rem .5rem",fontSize:".7rem"}}
                                      onClick={()=>deletePagamento(d.id, p.id)}>
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {!isViewer && <>
                            <div className="kpi-label" style={{marginBottom:".5rem"}}>Registrar pagamento</div>
                            <div className="form-grid">
                              <div className="form-group">
                                <label className="form-label">Valor</label>
                                <input className="form-input" type="text" placeholder="R$ 0,00"
                                  value={pagForm.debitoId===d.id?pagForm.valor:""}
                                  onChange={e=>setPagForm({debitoId:d.id,valor:formatInput(e.target.value),data:pagForm.debitoId===d.id?pagForm.data:today(),forma:pagForm.debitoId===d.id?pagForm.forma:"Pix"})}/>
                              </div>
                              <div className="form-group">
                                <label className="form-label">Data</label>
                                <input className="form-input" type="date"
                                  value={pagForm.debitoId===d.id?pagForm.data:today()}
                                  onChange={e=>setPagForm(f=>({...f,debitoId:d.id,data:e.target.value}))}/>
                              </div>
                              <div className="form-group">
                                <label className="form-label">Forma</label>
                                <select className="form-select"
                                  value={pagForm.debitoId===d.id?pagForm.forma:"Pix"}
                                  onChange={e=>setPagForm(f=>({...f,debitoId:d.id,forma:e.target.value}))}>
                                  {FORMAS_PAG.map(f=><option key={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="form-group">
                                <label className="form-label">&nbsp;</label>
                                <button className="btn btn-accent" onClick={()=>{
                                  if (pagForm.debitoId!==d.id || !parseInput(pagForm.valor)) return;
                                  // [N5] Impede pagamento acima do saldo devedor
                                  const restanteDev = d.valor - pagoPorDebito(d);
                                  if (parseInput(pagForm.valor) > restanteDev) { addToast("Valor excede o saldo devedor.", "aviso"); return; }
                                  // [F5] UUID como ID do pagamento
                                  setDebitos(prev=>{
                                    const next=prev.map(x=>x.id===d.id?{...x,pagamentos:[...x.pagamentos,{id:genId(),valor:parseInput(pagForm.valor),data:pagForm.data,forma:pagForm.forma}]}:x);
                                    savePatch({debitos:next});
                                    return next;
                                  });
                                  setPagForm({debitoId:null,valor:"",data:today(),forma:"Pix"});
                                }}>+ Pagar</button>
                              </div>
                            </div>
                          </>}
                        </div>
                      )}
                    </div>
                  );
                })}

                {debitosQuit.length>0 && <>
                  <div className="section-title" style={{marginTop:".5rem"}}>Quitados</div>
                  <div className="table-card">
                    <div className="table-scroll">
                      <table>
                        <thead><tr><th>Credor</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Status</th>{!isViewer && <th></th>}</tr></thead>
                        <tbody>
                          {debitosQuit.map(d => (
                            <tr key={d.id}>
                              <td style={{fontWeight:600}}>{d.credor}</td>
                              <td style={{fontFamily:"var(--font-mono)",fontSize:".78rem",color:"var(--text-tertiary)"}}>{formatDate(d.data)}</td>
                              <td style={{color:"var(--text-tertiary)",fontSize:".82rem"}}>{d.descricao||"—"}</td>
                              <td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{formatCurrency(d.valor)}</td>
                              <td><span className="badge badge-ok">✓ Quitado</span></td>
                              {!isViewer && <td><button className="btn btn-danger" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>deleteDebito(d.id)}>✕</button></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>}
              </>}

              {/* Sub-aba: Empréstimos */}
              {debitosSubTab==="emprestimosLoterica" && <>
                <div className="kpi-grid">
                  <div className="kpi-card" style={{"--accent-color":"var(--warning)"}}>
                    <div className="kpi-label">A Receber</div>
                    <div className="kpi-value" style={{color:"var(--warning)"}}>{formatCurrency(totalAReceber)}</div>
                    <div className="kpi-sub">{empsAbertos.length} empréstimo(s) em aberto</div>
                  </div>
                  <div className="kpi-card" style={{"--accent-color":"var(--accent)"}}>
                    <div className="kpi-label">Total Emprestado</div>
                    <div className="kpi-value" style={{color:"var(--accent)"}}>{formatCurrency(totalEmpOut)}</div>
                    <div className="kpi-sub">{emprestimos.length} empréstimo(s)</div>
                  </div>
                  <div className="kpi-card" style={{"--accent-color":"var(--success)"}}>
                    <div className="kpi-label">Total Recebido</div>
                    <div className="kpi-value" style={{color:"var(--success)"}}>{formatCurrency(totalRecebido)}</div>
                    <div className="kpi-sub">{empsQuit.length} quitado(s)</div>
                  </div>
                </div>

                {!isViewer && <>
                  <div className="section-title">Registrar Empréstimo Concedido</div>
                  <div className="form-card">
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Devedor</label>
                        <select className="form-select" value={empForm.devedor} onChange={e=>setEmpForm(f=>({...f,devedor:e.target.value}))}>
                          <option value="">Selecione...</option>
                          {devedoresList.map(p=><option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Valor (R$)</label>
                        <input className="form-input" type="text" placeholder="R$ 0,00" value={empForm.valor} onChange={e=>setEmpForm(f=>({...f,valor:formatInput(e.target.value)}))}/>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Data</label>
                        <input className="form-input" type="date" value={empForm.data} onChange={e=>setEmpForm(f=>({...f,data:e.target.value}))}/>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Descrição</label>
                        <input className="form-input" type="text" placeholder="Motivo..." value={empForm.descricao} onChange={e=>setEmpForm(f=>({...f,descricao:e.target.value}))}/>
                      </div>
                      <div className="form-group">
                        <label className="form-label">&nbsp;</label>
                        <button className="btn btn-accent" onClick={()=>{
                          if (!empForm.devedor || !parseInput(empForm.valor) || !empForm.data) return;
                          // [F5] UUID como ID
                          const ne = { id:genId(), devedor:empForm.devedor, valor:parseInput(empForm.valor), data:empForm.data, descricao:empForm.descricao, recebimentos:[] };
                          setEmprestimos(prev=>{const next=[...prev,ne];savePatch({emprestimos:next});return next;});
                          setEmpForm({devedor:"",valor:"",data:today(),descricao:""});
                        }}>+ Registrar</button>
                      </div>
                    </div>
                  </div>
                </>}

                <div className="section-title">Empréstimos em Aberto</div>
                {empsAbertos.length===0 && <div className="empty" style={{marginBottom:"1.5rem"}}>Nenhum empréstimo em aberto.</div>}
                {empsAbertos.map(e => {
                  const rec      = recPorEmp(e);
                  const restante = e.valor - rec;
                  const pct      = Math.min(100,(rec/e.valor)*100);
                  const isExp    = expandedEmp===e.id;
                  return (
                    <div key={e.id} className="debito-card">
                      <div className="debito-card-header" onClick={()=>setExpandedEmp(isExp?null:e.id)}>
                        <div className="debito-info">
                          <div className="debito-name">{e.devedor}</div>
                          <div className="debito-meta">{formatDate(e.data)}{e.descricao?` · ${e.descricao}`:""}</div>
                        </div>
                        <div className="debito-amount">
                          <div className="debito-amount-label">A Receber</div>
                          <div className="debito-amount-value" style={{color:"var(--warning)"}}>{formatCurrency(restante)}</div>
                        </div>
                        <div className="debito-progress">
                          <div className="debito-progress-labels">
                            <span>Recebido {formatCurrency(rec)} / {formatCurrency(e.valor)}</span>
                            <span style={{color:"var(--warning)"}}>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="progress-track"><div className="progress-bar" style={{width:`${pct}%`,background:"var(--warning)"}}/></div>
                        </div>
                        <div className="debito-actions">
                          <span style={{fontFamily:"var(--font-mono)",fontSize:".7rem",color:"var(--text-tertiary)"}}>{isExp?"▲":"▼"}</span>
                          {!isViewer && (
                            <button className="btn btn-danger" style={{padding:".3rem .7rem",fontSize:".75rem"}}
                              onClick={ev=>{ev.stopPropagation();deleteEmprestimo(e.id);}}>
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      {isExp && (
                        <div className="debito-body">
                          {e.recebimentos.length>0 && (
                            <div style={{marginBottom:"1rem"}}>
                              <div className="kpi-label" style={{marginBottom:".5rem"}}>Recebimentos registrados</div>
                              {e.recebimentos.map(r => (
                                <div key={r.id} className="pag-row">
                                  <span style={{fontFamily:"var(--font-mono)",fontSize:".75rem",color:"var(--text-tertiary)",minWidth:75}}>{formatDate(r.data)}</span>
                                  <span className="badge" style={{background:"rgba(217,119,6,.1)",color:"var(--warning)"}}>{r.forma}</span>
                                  <span style={{fontFamily:"var(--font-mono)",fontWeight:600,color:"var(--warning)",marginLeft:"auto"}}>{formatCurrency(r.valor)}</span>
                                  {!isViewer && (
                                    <button className="btn btn-danger" style={{padding:".2rem .5rem",fontSize:".7rem"}}
                                      onClick={()=>deleteRecebimento(e.id, r.id)}>
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {!isViewer && <>
                            <div className="kpi-label" style={{marginBottom:".5rem"}}>Registrar recebimento</div>
                            <div className="form-grid">
                              <div className="form-group">
                                <label className="form-label">Valor</label>
                                <input className="form-input" type="text" placeholder="R$ 0,00"
                                  value={recForm.empId===e.id?recForm.valor:""}
                                  onChange={ev=>setRecForm({empId:e.id,valor:formatInput(ev.target.value),data:recForm.empId===e.id?recForm.data:today(),forma:recForm.empId===e.id?recForm.forma:"Pix"})}/>
                              </div>
                              <div className="form-group">
                                <label className="form-label">Data</label>
                                <input className="form-input" type="date"
                                  value={recForm.empId===e.id?recForm.data:today()}
                                  onChange={ev=>setRecForm(f=>({...f,empId:e.id,data:ev.target.value}))}/>
                              </div>
                              <div className="form-group">
                                <label className="form-label">Forma</label>
                                <select className="form-select"
                                  value={recForm.empId===e.id?recForm.forma:"Pix"}
                                  onChange={ev=>setRecForm(f=>({...f,empId:e.id,forma:ev.target.value}))}>
                                  {FORMAS_PAG.map(f=><option key={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="form-group">
                                <label className="form-label">&nbsp;</label>
                                <button className="btn btn-accent" onClick={()=>{
                                  if (recForm.empId!==e.id || !parseInput(recForm.valor)) return;
                                  // [N5] Impede recebimento acima do saldo do empréstimo
                                  const restanteEmp = e.valor - recPorEmp(e);
                                  if (parseInput(recForm.valor) > restanteEmp) { addToast("Valor excede o saldo do empréstimo.", "aviso"); return; }
                                  // [F5] UUID como ID
                                  setEmprestimos(prev=>{
                                    const next=prev.map(x=>x.id===e.id?{...x,recebimentos:[...x.recebimentos,{id:genId(),valor:parseInput(recForm.valor),data:recForm.data,forma:recForm.forma}]}:x);
                                    savePatch({emprestimos:next});
                                    return next;
                                  });
                                  setRecForm({empId:null,valor:"",data:today(),forma:"Pix"});
                                }}>+ Receber</button>
                              </div>
                            </div>
                          </>}
                        </div>
                      )}
                    </div>
                  );
                })}

                {empsQuit.length>0 && <>
                  <div className="section-title" style={{marginTop:".5rem"}}>Quitados</div>
                  <div className="table-card">
                    <div className="table-scroll">
                      <table>
                        <thead><tr><th>Devedor</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Status</th>{!isViewer && <th></th>}</tr></thead>
                        <tbody>
                          {empsQuit.map(e => (
                            <tr key={e.id}>
                              <td style={{fontWeight:600}}>{e.devedor}</td>
                              <td style={{fontFamily:"var(--font-mono)",fontSize:".78rem",color:"var(--text-tertiary)"}}>{formatDate(e.data)}</td>
                              <td style={{color:"var(--text-tertiary)",fontSize:".82rem"}}>{e.descricao||"—"}</td>
                              <td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{formatCurrency(e.valor)}</td>
                              <td><span className="badge badge-ok">✓ Quitado</span></td>
                              {!isViewer && <td><button className="btn btn-danger" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>deleteEmprestimo(e.id)}>✕</button></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>}
              </>}
            </>
          );
        })()}

        {/* ══ CADASTROS ══ (somente admin) */}
        {tab==="cadastros" && !isViewer && (
          <>
            <div className="section-title">Ações de Lançamento</div>
            <div className="table-card" style={{marginBottom:"1.5rem"}}>
              <div className="table-header"><span className="table-header-title">Ações Cadastradas</span></div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Nome</th><th>Fluxo padrão</th><th></th></tr></thead>
                  <tbody>
                    {tiposList.map((t,idx) => (
                      <tr key={t}>
                        <td>
                          {cadEditTipo.idx===idx
                            ? <input className="form-input" style={{padding:".3rem .6rem",fontSize:".82rem"}} value={cadEditTipo.nome} onChange={e=>setCadEditTipo(s=>({...s,nome:e.target.value}))}/>
                            : <span style={{fontWeight:600}}>{t}</span>}
                        </td>
                        <td>
                          {cadEditTipo.idx===idx
                            ? <select className="form-select" style={{padding:".3rem .6rem",fontSize:".82rem"}} value={cadEditTipo.fluxo} onChange={e=>setCadEditTipo(s=>({...s,fluxo:e.target.value}))}>
                                <option value="entrada">↑ Entrada</option>
                                <option value="saida">↓ Saída</option>
                              </select>
                            : <span className={`badge badge-${tipoFluxo[t]||"entrada"}`}>{tipoFluxo[t]==="saida"?"↓ Saída":"↑ Entrada"}</span>}
                        </td>
                        <td>
                          <div className="td-actions">
                            {cadEditTipo.idx===idx
                              ? <>
                                  <button className="btn btn-accent" style={{padding:".3rem .8rem",fontSize:".75rem"}} onClick={()=>{
                                    if (!cadEditTipo.nome.trim()) return;
                                    setTiposList(prev=>{const next=prev.map((x,i)=>i===idx?cadEditTipo.nome.trim():x);const tf={...tipoFluxo};delete tf[t];tf[cadEditTipo.nome.trim()]=cadEditTipo.fluxo;setTipoFluxo(tf);savePatch({tiposList:next,tipoFluxo:tf});return next;});
                                    setCadEditTipo({idx:null,nome:"",fluxo:"saida"});
                                  }}>✓</button>
                                  <button className="btn btn-ghost" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>setCadEditTipo({idx:null,nome:"",fluxo:"saida"})}>✕</button>
                                </>
                              : <>
                                  <button className="btn btn-ghost" style={{padding:".3rem .8rem",fontSize:".75rem"}} onClick={()=>setCadEditTipo({idx,nome:t,fluxo:tipoFluxo[t]||"saida"})}>✎</button>
                                  <button className="btn btn-danger" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={async ()=>{
                                    const ok = await confirm({ title:"Excluir tipo?", message:`O tipo "${t}" será removido. Lançamentos existentes não serão afetados.`, confirmLabel:"Excluir" });
                                    if (!ok) return;
                                    setTiposList(prev=>{const next=prev.filter((_,i)=>i!==idx);const tf={...tipoFluxo};delete tf[t];setTipoFluxo(tf);savePatch({tiposList:next,tipoFluxo:tf});return next;});
                                  }}>✕</button>
                                </>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{padding:"1rem 1.25rem",borderTop:"1px solid var(--border)",display:"flex",gap:".75rem",alignItems:"center",flexWrap:"wrap"}}>
                <input className="form-input" style={{maxWidth:180}} placeholder="Novo tipo..." value={cadNewTipo.nome} onChange={e=>setCadNewTipo(s=>({...s,nome:e.target.value}))}/>
                <select className="form-select" style={{maxWidth:140}} value={cadNewTipo.fluxo} onChange={e=>setCadNewTipo(s=>({...s,fluxo:e.target.value}))}>
                  <option value="entrada">↑ Entrada</option>
                  <option value="saida">↓ Saída</option>
                </select>
                <button className="btn btn-accent" onClick={()=>{
                  const nome = cadNewTipo.nome.trim();
                  if (!nome || tiposList.includes(nome)) return;
                  setTiposList(prev=>{const next=[...prev,nome];const tf={...tipoFluxo,[nome]:cadNewTipo.fluxo};setTipoFluxo(tf);savePatch({tiposList:next,tipoFluxo:tf});return next;});
                  setCadNewTipo({nome:"",fluxo:"saida"});
                }}>+ Adicionar</button>
              </div>
            </div>

            <div className="section-title">Pessoas e Entidades</div>
            <p style={{fontSize:".78rem",color:"var(--text-tertiary)",marginBottom:"1rem",fontFamily:"var(--font-mono)"}}>
              Cada entidade pode ter um ou mais papéis: Entidade, Parceiro, Operador, Credor e/ou Devedor.
            </p>
            <div className="table-card" style={{marginBottom:"2rem"}}>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Nome</th><th>Funções</th><th></th></tr></thead>
                  <tbody>
                    {entidades.map((e,idx) => {
                      const ROLE_LABELS = { entidade:"Entidade", parceiro:"Parceiro", operador:"Operador", credor:"Credor", devedor:"Devedor" };
                      const ALL_ROLES   = ["entidade","parceiro","operador","credor","devedor"];
                      const isEditing   = cadEditEnt.idx===idx;
                      return (
                        <tr key={e.nome}>
                          <td>
                            {isEditing
                              ? <input className="form-input" style={{padding:".3rem .6rem",fontSize:".82rem"}} value={cadEditEnt.nome} onChange={ev=>setCadEditEnt(s=>({...s,nome:ev.target.value}))}/>
                              : <span style={{fontWeight:600}}>{e.nome}</span>}
                          </td>
                          <td>
                            {isEditing
                              ? <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
                                  {ALL_ROLES.map(r=>(
                                    <label key={r} style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".75rem",color:"var(--text-secondary)",cursor:"pointer"}}>
                                      <input type="checkbox" checked={cadEditEnt.roles.includes(r)}
                                        onChange={ev=>setCadEditEnt(s=>({...s,roles:ev.target.checked?[...s.roles,r]:s.roles.filter(x=>x!==r)}))}/>
                                      {ROLE_LABELS[r]}
                                    </label>
                                  ))}
                                </div>
                              : <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}}>
                                  {e.roles.map(r=>(
                                    <span key={r} style={{fontSize:".67rem",fontFamily:"var(--font-mono)",padding:".15rem .45rem",borderRadius:4,background:"var(--surface3)",color:"var(--text-secondary)"}}>
                                      {ROLE_LABELS[r]}
                                    </span>
                                  ))}
                                </div>}
                          </td>
                          <td>
                            <div className="td-actions">
                              {isEditing
                                ? <>
                                    <button className="btn btn-accent" style={{padding:".3rem .8rem",fontSize:".75rem"}} onClick={()=>{
                                      if (!cadEditEnt.nome.trim() || cadEditEnt.roles.length===0) return;
                                      setEntidades(prev=>{const next=prev.map((x,i)=>i===idx?{nome:cadEditEnt.nome.trim(),roles:cadEditEnt.roles}:x);savePatch({entidades:next});return next;});
                                      setCadEditEnt({idx:null,nome:"",roles:[]});
                                    }}>✓</button>
                                    <button className="btn btn-ghost" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>setCadEditEnt({idx:null,nome:"",roles:[]})}>✕</button>
                                  </>
                                : <>
                                    <button className="btn btn-ghost" style={{padding:".3rem .8rem",fontSize:".75rem"}} onClick={()=>setCadEditEnt({idx,nome:e.nome,roles:[...e.roles]})}>✎</button>
                                    <button className="btn btn-danger" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={async ()=>{
                                      const ok = await confirm({ title:"Excluir entidade?", message:`"${e.nome}" será removido da lista. Lançamentos existentes não serão afetados.`, confirmLabel:"Excluir" });
                                      if (!ok) return;
                                      setEntidades(prev=>{const next=prev.filter((_,i)=>i!==idx);savePatch({entidades:next});return next;});
                                    }}>✕</button>
                                  </>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{padding:"1rem 1.25rem",borderTop:"1px solid var(--border)",display:"flex",gap:".75rem",alignItems:"center",flexWrap:"wrap"}}>
                <input className="form-input" style={{maxWidth:180}} placeholder="Nome..." value={cadNewEnt.nome} onChange={e=>setCadNewEnt(s=>({...s,nome:e.target.value}))}/>
                <div style={{display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                  {[["entidade","Entidade"],["parceiro","Parceiro"],["operador","Operador"],["credor","Credor"],["devedor","Devedor"]].map(([r,l])=>(
                    <label key={r} style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".78rem",color:"var(--text-secondary)",cursor:"pointer"}}>
                      <input type="checkbox" checked={cadNewEnt.roles.includes(r)}
                        onChange={ev=>setCadNewEnt(s=>({...s,roles:ev.target.checked?[...s.roles,r]:s.roles.filter(x=>x!==r)}))}/>
                      {l}
                    </label>
                  ))}
                </div>
                <button className="btn btn-accent" onClick={()=>{
                  const nome = cadNewEnt.nome.trim();
                  if (!nome || cadNewEnt.roles.length===0 || entidades.find(e=>e.nome===nome)) return;
                  setEntidades(prev=>{const next=[...prev,{nome,roles:cadNewEnt.roles}];savePatch({entidades:next});return next;});
                  setCadNewEnt({nome:"",roles:["entidade"]});
                }}>+ Adicionar</button>
              </div>
            </div>
          </>
        )}

      </main>

      {/* [F12] Ano calculado inline */}
      <footer style={{textAlign:"center",padding:"1.5rem 1rem",borderTop:"1px solid var(--border)",background:"#111827"}}>
        <img src="logo.png" alt="Logos Simeraion Systems" style={{height:48,opacity:.85,marginBottom:".5rem"}}/>
        <div style={{fontFamily:"var(--font-mono)",fontSize:".65rem",color:"#6b7280"}}>
          © {new Date().getFullYear()} Logos Simeraion Systems · Todos os direitos reservados
        </div>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Componente Boot — autenticação
// ═══════════════════════════════════════════════════════════════════════════════
function Boot() {
  const [ready,        setReady]        = useState(!!window.__firebaseReady);
  const [user,         setUser]         = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [loginForm,    setLoginForm]    = useState({ email:"", senha:"" });
  const [loginError,   setLoginError]   = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  // [F4] Contador de tentativas para feedback de força bruta
  const [loginAttempts, setLoginAttempts] = useState(0);

  useEffect(() => {
    if (window.__firebaseReady) return;
    const handler = () => setReady(true);
    document.addEventListener("firebaseReady", handler);
    return () => document.removeEventListener("firebaseReady", handler);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const { onAuthStateChanged } = window.authLib;
    const unsub = onAuthStateChanged(window.__auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, [ready]);

  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.senha) return;
    // [F4] Bloqueia após 5 tentativas com cooldown de 30s
    if (loginAttempts >= 5) {
      setLoginError("Muitas tentativas. Aguarde 30 segundos antes de tentar novamente.");
      return;
    }
    setLoginLoading(true);
    setLoginError("");
    try {
      const { signInWithEmailAndPassword } = window.authLib;
      await signInWithEmailAndPassword(window.__auth, loginForm.email, loginForm.senha);
      setLoginAttempts(0);
    } catch(e) {
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);
      if (newAttempts >= 5) {
        setLoginError("Conta bloqueada temporariamente por excesso de tentativas. Aguarde 30 segundos.");
        setTimeout(() => setLoginAttempts(0), 30000);
      } else {
        setLoginError(`Email ou senha incorretos. (${newAttempts}/5 tentativas)`);
      }
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    const { signOut } = window.authLib;
    signOut(window.__auth);
    setLoginForm({ email:"", senha:"" });
  };

  if (!ready || authLoading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#6b7280",gap:12}}>
      <span style={{fontSize:"1.5rem"}}>🎰</span>
      <span>Conectando...</span>
    </div>
  );

  if (!user) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f3f4f6",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <div style={{background:"#fff",borderRadius:16,padding:"2.5rem",boxShadow:"0 4px 24px rgba(0,0,0,.10)",width:"100%",maxWidth:360}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:"1.75rem"}}>
          <div style={{width:36,height:36,borderRadius:9,overflow:"hidden",flexShrink:0}}>
            <LogoSVG size={36}/>
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:"1rem"}}>LotoFlow</div>
            <div style={{fontSize:".65rem",color:"#9ca3af",letterSpacing:".8px",textTransform:"uppercase"}}>Fluxo de Caixa para Loterias</div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <div style={{display:"flex",flexDirection:"column",gap:".35rem"}}>
            <label style={{fontSize:".72rem",fontWeight:600,color:"#6b7280"}}>Email</label>
            <input type="email" placeholder="seu@email.com"
              style={{border:"1px solid #d1d5db",borderRadius:8,padding:".5rem .8rem",fontSize:".84rem",outline:"none",fontFamily:"inherit"}}
              value={loginForm.email}
              onChange={e=>setLoginForm(f=>({...f,email:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              disabled={loginAttempts>=5}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:".35rem"}}>
            <label style={{fontSize:".72rem",fontWeight:600,color:"#6b7280"}}>Senha</label>
            <input type="password" placeholder="••••••••"
              style={{border:"1px solid #d1d5db",borderRadius:8,padding:".5rem .8rem",fontSize:".84rem",outline:"none",fontFamily:"inherit"}}
              value={loginForm.senha}
              onChange={e=>setLoginForm(f=>({...f,senha:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              disabled={loginAttempts>=5}/>
          </div>
          {loginError && <div style={{fontSize:".78rem",color:"#dc2626",textAlign:"center",background:"#fef2f2",padding:".5rem .75rem",borderRadius:6,border:"1px solid #fca5a5"}}>{loginError}</div>}
          <button onClick={handleLogin} disabled={loginLoading || loginAttempts>=5}
            style={{background: loginAttempts>=5?"#9ca3af":"#2563eb",color:"#fff",border:"none",borderRadius:8,padding:".6rem 1rem",fontFamily:"inherit",fontSize:".85rem",fontWeight:600,cursor:loginAttempts>=5?"not-allowed":"pointer",marginTop:".25rem"}}>
            {loginLoading ? "Entrando..." : loginAttempts>=5 ? "Aguarde..." : "Entrar"}
          </button>
          {/* [F12] Ano inline */}
          <div style={{textAlign:"center",padding:"1.25rem",borderTop:"1px solid #e5e7eb",background:"#111827",borderRadius:"0 0 16px 16px",margin:"1.5rem -2.5rem -2.5rem -2.5rem"}}>
            <img src="logo.png" alt="Logos Simeraion Systems" style={{height:36,opacity:.85,marginBottom:".4rem"}}/>
            <div style={{fontFamily:"monospace",fontSize:".62rem",color:"#6b7280"}}>
              © {new Date().getFullYear()} Logos Simeraion Systems · Todos os direitos reservados
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return <App onLogout={handleLogout} userEmail={user.email}/>;
}

// ── Monta o app ──────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")).render(<Boot/>);
