const D = window.PDATA || {};
const $ = id => document.getElementById(id);
const fdate = s => s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : "";
const pct = (x,dg=2) => (x==null)?"—":(x*100).toFixed(dg)+"%";
const cls = x => x>=0?"up":"down";

function init(){
  const m = D.meta||{};
  const wan = m.initial_total? ("，≈"+(m.initial_total/1e4).toFixed(2)+"万本金") : "";
  const sa = m.backtest_start_asset? ("，倒推 "+fdate(m.period_start||"")+" 起始 ≈"+(m.backtest_start_asset/1e4).toFixed(2)+"万") : "";
  const bt = m.period_start? (" · 含 rqalpha 回测尾("+fdate(m.period_start)+"起"+sa+")") : "";
  $("subtitle").textContent = "· 净值以实盘首日 "+fdate(m.start_date||"")+" 总资产重定基 = 1.0000"+wan+bt+
    " · 低频月末调仓 · 市值等权 · 全收益(含分红再投) · 年化/波动/夏普/回撤/超额随所选统计区间实时计算";
  const vn=$("valueNote");
  if(vn && m.initial_total){
    vn.textContent = "本金口径：以 0529 实盘首日总资产 "+(m.initial_total/1e4).toFixed(2)+" 万 = 净值 1.0000 为锚，"+
      "曲线上任一时点总资产 = "+(m.initial_total/1e4).toFixed(2)+" 万 × 该点净值"+
      (m.backtest_start_asset? ("；倒推回测起点 "+fdate(m.period_start||"")+" 起始资产 ≈"+(m.backtest_start_asset/1e4).toFixed(2)+" 万（按策略回测成长路径折算）"):"")+
      "。最新净值 "+(( (D.nav.nav||[]).slice(-1)[0])||1).toFixed(4)+" ≈ "+(((m.initial_total*((D.nav.nav||[]).slice(-1)[0]||1))/1e4).toFixed(2))+" 万。";
  }
  $("updated").textContent = m.updated_at||"—";
  renderKPI();
  renderSignal();
  renderNav();
  renderMonthly();
  renderFundPerf();
  renderHoldings();
  renderHistory();
  renderEvents();
  renderExposure();
  const rq=(D.meta&&D.meta.rq)||{};
  $("foot").innerHTML =
    "口径：曲线左侧灰底为 rqalpha 回测尾(自 "+(m.period_start?fdate(m.period_start):"—")+"，按实盘首日归一)；"+
    "实盘段以 "+fdate(m.start_date||"")+" 总资产重定基=1.0000。"+
    "rqalpha 已实现成交(等权/成本/停牌) 至 "+(rq.last?fdate(rq.last):"—")+
    (rq.covered?`，其后为临时市值等权、次月自动修正`:"")+
    " · 全收益(分红再投资) · 数据源 rqalpha + tushare。"+
    "年化/波动/夏普/最大回撤/超额按上方所选统计区间实时计算(默认实盘以来，点‘全部(含回测)’即整条口径)；"+
    "最新净值/当日/累计收益以实盘(0529)为基。"+
    " 本看板仅供业绩展示，不构成投资建议。";
}

function renderHistory(){
  const el=$("histWrap"); let hist=[...(D.history||[])];
  if(!el) return;
  hist.sort((a,b)=>b.month.localeCompare(a.month));   // 最新月份在前
  el.innerHTML = hist.map((h,idx)=>{
    const badge = h.source==="rqalpha"?"<span class='tag rq'>rqalpha已实现</span>"
        :h.source==="pending"?"<span class='tag pv2'>预计下月·待定</span>"
        :"<span class='tag pv'>临时等权</span>";
    const thin = h.thin?`<span class='tag warn'>⚠该月末仅 ${h.rows.length} 只</span>`:"";
    const cells = (h.rows||[]).map(r=>`<span class="hcell">${r.name||r.code} <b>${(r.weight*100).toFixed(1)}%</b></span>`).join("")||"<span class='hcell'>空仓</span>";
    const cash = h.cash_w>0.005?`<span class="hcell cash">现金 ${(h.cash_w*100).toFixed(1)}%</span>`:"";
    return `<details class="mrow"${idx===0?" open":""}><summary>${h.month.slice(0,4)}-${h.month.slice(4)} · ${(h.rows||[]).length}只 ${badge}${thin} <i>${fdate(h.date)}</i></summary><div class="hrow">${cells}${cash}</div></details>`;
  }).join("");
}

// ---------- 统计区间（KPI 随曲线所选区间即时重算）----------
const TD = 244;                       // 年化交易日数，与后端 _interval_perf 口径一致
const CH = {};                        // echarts 实例（净值图/回撤图，缩放联动）
let WIN = {i0: 0, i1: 0, key: "live", custom: false};

const PRESETS = [
  {k:"all",  label:"全部(含回测)"},
  {k:"live", label:"实盘以来"},
  {k:"1y",   label:"近1年",  months:12},
  {k:"6m",   label:"近6月",  months:6},
  {k:"3m",   label:"近3月",  months:3},
  {k:"1m",   label:"近1月",  months:1},
];

function dates(){ return (D.nav && D.nav.dates) || []; }

function presetRange(p){
  const ds = dates(), n = ds.length, lsi = (D.meta && D.meta.live_start_index) || 0;
  if(!n) return [0, 0];
  if(p.k === "all") return [0, n-1];
  if(p.k === "live") return [Math.min(Math.max(lsi,0), n-1), n-1];
  const last = String(ds[n-1]);
  const d = new Date(+last.slice(0,4), +last.slice(4,6)-1, +last.slice(6,8));
  d.setMonth(d.getMonth() - p.months);
  const lo = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  let i0 = ds.findIndex(x => String(x) >= lo);
  if(i0 < 0) i0 = Math.min(Math.max(lsi,0), n-1);
  return [i0, n-1];
}

function winMetrics(i0, i1){
  const navAll = (D.nav && D.nav.nav) || [], bm = D.benchmarks || {};
  const lo = Math.max(0, Math.min(i0, i1)), hi = Math.min(navAll.length-1, Math.max(i0, i1));
  const v = [], ix = [];
  for(let i = lo; i <= hi; i++){ const x = navAll[i]; if(x != null && x === x){ v.push(x); ix.push(i); } }
  if(v.length < 2) return null;
  const rets = [];
  for(let k = 1; k < v.length; k++) rets.push(v[k]/v[k-1] - 1);
  const n = rets.length, tot = v[v.length-1]/v[0] - 1, yrs = n/TD;
  const ann = yrs > 0 ? Math.pow(1+tot, 1/yrs) - 1 : 0;
  const mean = rets.reduce((a,b)=>a+b, 0)/n;
  const sd = n > 1 ? Math.sqrt(rets.reduce((a,b)=>a+(b-mean)*(b-mean), 0)/(n-1)) : 0;
  const vol = sd*Math.sqrt(TD), sh = vol > 0 ? ann/vol : 0;
  let peak = v[0], mdd = 0;
  for(const x of v){ if(x > peak) peak = x; const dd = x/peak - 1; if(dd < mdd) mdd = dd; }
  const ex = {}, exd = {};
  for(const c in bm){
    const arr = (bm[c] && bm[c].values) || [];
    let f = null, l = null;
    for(const i of ix){ const y = arr[i]; if(y != null && y === y){ if(f === null) f = y; l = y; } }
    ex[c] = (f && l) ? (v[v.length-1]/v[0])/(l/f) - 1 : null;
    const i1 = ix[ix.length-1], i0p = ix[ix.length-1]-1;
    const a = navAll[i1], b = arr[i1], ap = navAll[i0p], bp = arr[i0p];
    exd[c] = (a && b && ap && bp) ? ((a/b - 1) - (ap/bp - 1))*100 : null;
  }
  return {i0: lo, i1: hi, n: v.length, tot, ann, vol, sh, mdd, ex, exd,
          start: dates()[lo], end: dates()[hi]};
}

function zoomRange(){
  const ch = CH.nav; if(!ch) return [WIN.i0, WIN.i1];
  const z = (ch.getOption().dataZoom || [])[0] || {}, n = dates().length;
  let i0, i1;
  if(typeof z.start === "number" && typeof z.end === "number"){
    i0 = Math.round(z.start/100*(n-1)); i1 = Math.round(z.end/100*(n-1));
  } else if(typeof z.startValue === "number" && typeof z.endValue === "number"){
    i0 = z.startValue; i1 = z.endValue;
  } else { i0 = 0; i1 = n-1; }
  return [Math.max(0, Math.min(i0, n-1)), Math.max(0, Math.min(i1, n-1))];
}

let _lock = 0;                        // 刚点过预设按钮的时间戳：吸收 百分比↔索引 的取整误差
function setWindow(i0, i1, key){
  WIN = {i0, i1, key, custom:false}; _lock = Date.now();
  [CH.nav, CH.dd].forEach(c => { if(c){ try{ c.dispatchAction({type:"dataZoom", startValue:i0, endValue:i1}); }catch(e){} } });
  renderKPI(); renderRangeBar();
}

function onZoom(){
  const [i0, i1] = zoomRange();
  if(i0 === WIN.i0 && i1 === WIN.i1) return;
  if(Date.now() - _lock < 500 && Math.abs(i0-WIN.i0) <= 3 && Math.abs(i1-WIN.i1) <= 3) return;
  const hit = PRESETS.find(p => { const r = presetRange(p); return r[0] === i0 && r[1] === i1; });
  WIN = {i0, i1, key: hit ? hit.k : "custom", custom: !hit};
  renderKPI(); renderRangeBar();
}

function renderRangeBar(){
  const bar = $("rngBtns"); if(!bar) return;
  bar.innerHTML = PRESETS.map(p =>
    `<button class="rbtn${WIN.key===p.k && !WIN.custom?" on":""}" data-k="${p.k}">${p.label}</button>`).join("")
    + (WIN.custom ? `<button class="rbtn on" data-k="custom">自定义区间</button>` : "");
  const ds = dates();
  const info = $("rngInfo");
  if(info){
    const m = winMetrics(WIN.i0, WIN.i1);
    info.textContent = m ? `统计区间 ${fdate(ds[m.i0])} ~ ${fdate(ds[m.i1])} · ${m.n} 个交易日` : "";
  }
  bar.querySelectorAll(".rbtn").forEach(b => b.onclick = () => {
    const p = PRESETS.find(x => x.k === b.dataset.k); if(!p) return;
    const [i0, i1] = presetRange(p); setWindow(i0, i1, p.k, false);
  });
}

function renderKPI(){
  const s = D.nav.nav || [], mt = D.metrics || {}, bm = D.benchmarks || {};
  const last = s[s.length-1], prev = s[s.length-2];
  const dayRet = prev ? last/prev-1 : 0;
  const since = last ? last-1 : 0;
  const m = winMetrics(WIN.i0, WIN.i1);
  const mp = m && m.i1 > m.i0 ? winMetrics(WIN.i0, m.i1-1) : null;
  const bcodes = Object.keys(bm);
  const hsC = bcodes.find(c => bm[c] && bm[c].name && bm[c].name.indexOf("红利") >= 0) || "000922.CSI";
  const c3C = bcodes.find(c => bm[c] && bm[c].name && bm[c].name.indexOf("300") >= 0) || "000300.SH";
  const name = c => (bm[c] && bm[c].name) || c;
  const ex = c => m && m.ex[c] != null ? m.ex[c] : null;
  const exd = c => m && m.exd[c] != null ? m.exd[c] : null;
  const vd = mp && m ? (m.vol - mp.vol)*100 : null;
  const sd = mp && m ? m.sh - mp.sh : null;
  // [标签, 值, 涨跌色类, 环比值, 环比单位]   —— 带 * 的卡片随上方所选统计区间变化
  const cards = [
    ["最新净值", last ? last.toFixed(4) : "—", ""],
    ["当日收益", pct(dayRet), cls(dayRet)],
    ["累计收益·实盘", pct(since), cls(since)],
    ["全市场当日中位", mt.mkt_median == null ? "—" : ((mt.mkt_median>=0?"+":"")+mt.mkt_median.toFixed(2)+"%"), cls(mt.mkt_median||0)],
    ["区间收益*", m ? pct(m.tot) : "—", m ? cls(m.tot) : ""],
    ["年化收益*", m ? pct(m.ann) : "—", m ? cls(m.ann) : ""],
    ["年化波动*", m ? pct(m.vol) : "—", "", vd, "pp"],
    ["夏普比率*", m ? m.sh.toFixed(2) : "—", (m && m.sh >= 1) ? "up" : "", sd, ""],
    ["最大回撤*", m ? pct(m.mdd) : "—", "down"],
    [`区间超额*·${name(hsC)}`, ex(hsC) == null ? "—" : pct(ex(hsC)), cls(ex(hsC)||0), exd(hsC), "pp"],
    [`区间超额*·${name(c3C)}`, ex(c3C) == null ? "—" : pct(ex(c3C)), cls(ex(c3C)||0), exd(c3C), "pp"],
  ];
  const dv = (d,u)=>{ if(d==null||isNaN(d)) return "";
    const txt=(d>=0?"+":"")+d.toFixed(u==="pp"?2:3)+(u||""); const c=d>=0?"up":"down";
    return `<div class="kd ${c}">环比 ${d>=0?"▲":"▼"} ${txt}</div>`; };
  $("kpis").innerHTML = cards.map(c=>
    `<div class="kpi"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div>${c[3]!=null?dv(c[3],c[4]):""}</div>`).join("");
}

function renderReport(){
  const rep=D.report||{}; const el=$("reportBox"); if(!el) return;
  const lines=(rep.text||"").split("\n").filter(Boolean);
  el.innerHTML = lines.length? lines.map(l=>`<div>${l}</div>`).join("") : "暂无运行情况数据。";
}

function renderSignal(){
  const g=$("signal"), si=D.signal||{};
  const role=si.role;
  const fmtList=(codes,name)=> (name||"");
  let html="";
  if(role==="select"){
    g.className="signal select";
    const add=(si.pending?.added||[]), rm=(si.pending?.removed||[]), nm=(si.pending?.names||{});
    const lbl=c=>((nm[c]?nm[c]+" ":"")+c);
    html=`<b>📌 选股日（${fdate(si.today)}）</b>：策略已产出新一期目标组合，等待 ${fdate(si.next_rebalance)} 收盘集中调仓。<br>`;
    html+= add.length? add.map(c=>`<span class="chip add">调入 ${lbl(c)}</span>`).join(""):"";
    html+= rm.length? rm.map(c=>`<span class="chip del">调出 ${lbl(c)}</span>`).join(""):"";
    if(!add.length&&!rm.length) html+="<span class='hint'>本期持仓无变化</span>";
  }else if(role==="rebalance"){
    g.className="signal rebalance";
    html=`<b>🔄 调仓日（${fdate(si.today)}）</b>：今日收盘完成换仓，今日收益仍按上一期篮子计，新组合自下一交易日起生效。`;
  }else{
    g.className="signal";
    html=`<span style="color:var(--mut)">常规交易日（${fdate(si.today)}）</span>：净值按当前生效篮子（${si.current_month||"—"} 期）计算，下次调仓日 ${fdate(si.next_rebalance)}。`;
  }
  g.innerHTML=html;
}

function renderNav(){
  const dates=(D.nav.dates||[]).map(fdate);
  const series=[{name:"组合净值",type:"line",smooth:true,showSymbol:false,lineStyle:{width:2.5,color:"#5b8cff"},itemStyle:{color:"#5b8cff"},data:D.nav.nav,z:5}];
  const leg=["组合净值"];
  const colors={};
  for(const c in (D.benchmarks||{})){
    const b=D.benchmarks[c], col=c==="000922.CSI"?"#e6b566":"#8b95b5";
    series.push({name:b.name,type:"line",smooth:true,showSymbol:false,lineStyle:{width:1.2,type:"dashed",color:col},itemStyle:{color:col},data:b.values});
    leg.push(b.name);
  }
  const rq=(D.meta&&D.meta.rq)||{};
  const stg=D.nav.stages||[];
  const provStartIdx=stg.findIndex(s=>s==="provisional");
  const lsi=(D.meta&&D.meta.live_start_index)||0;
  const liveDate=D.nav.dates[lsi], firstDate=D.nav.dates[0], lastDate=D.nav.dates[D.nav.dates.length-1];
  const _tot=(D.nav.dates||[]).length; const zStart=(_tot>1 && lsi>0)? Math.round(lsi/(_tot-1)*1000)/10 : 0;
  const areas=[], mlines=[];
  if(lsi>0){
    areas.push([{name:"回测",itemStyle:{color:"rgba(139,149,181,.10)"},label:{color:"#8b95b5",fontSize:11},
                 xAxis:fdate(firstDate)},{xAxis:fdate(liveDate)}]);
    mlines.push({name:"实盘开始",xAxis:fdate(liveDate),lineStyle:{color:"#3ecf8e",width:1.5},
                 label:{formatter:"实盘开始 "+fdate(liveDate),color:"#3ecf8e",fontSize:11}});
  }
  areas.push([{name:"实盘",itemStyle:{color:"rgba(230,181,102,.10)"},label:{color:"#e6b566",fontSize:11},
               xAxis:fdate(liveDate||firstDate)},{xAxis:"max"}]);
  if(provStartIdx>=0)
    mlines.push({xAxis:fdate(D.nav.dates[provStartIdx]),lineStyle:{color:"#e6b566",type:"dashed",width:1},
                 label:{formatter:"→ 临时等权(待次月rqalpha修正)",color:"#e6b566",fontSize:10}});
  series[0].markArea={silent:true,data:areas};
  if(mlines.length) series[0].markLine={silent:true,symbol:"none",data:mlines};
  const h=document.querySelector("#navHint");
  if(h){
    let t=(lsi>0?"默认展示实盘段("+fdate(liveDate)+"起)，可点上方区间按钮或拖动滑块；灰底为 rqalpha 回测尾(按 "+fdate(liveDate)+" 归一对齐)。":"")+
          (provStartIdx>=0?"金虚线后为临时等权(待次月修正)。":"实盘为 rqalpha 真实成交·全收益。")+
          "年化/波动/夏普/回撤/超额随所选区间重算。";
    h.textContent=t;
  }
  const _pw = presetRange({k:"live"});            // 默认统计区间=实盘以来（与曲线默认缩放同源）
  const ch=echarts.init($("navChart"),null,{renderer:"canvas"});
  CH.nav=ch;
  const NAV=D.nav.nav||[];
  const PRIN=(D.meta&&D.meta.initial_total)||0;
  const bv={}; for(const c in (D.benchmarks||{})) bv[D.benchmarks[c].name]=D.benchmarks[c].values||[];
  const pc=x=>x==null?"—":(x>=0?"+":"")+x.toFixed(2)+"%";
  const clr=x=>x>=0?"#e05c5c":"#3ecf8e";
  const navTip={trigger:"axis",backgroundColor:"#1c2438",borderColor:"#2a3450",textStyle:{color:"#e6eaf5"},
    formatter:(ps)=>{
      if(!ps||!ps.length) return "";
      const i=ps[0].dataIndex;
      const day= i>0 && NAV[i-1] ? (NAV[i]/NAV[i-1]-1)*100 : 0;
      const cum=(NAV[i]-( (D.meta&&D.meta.initial_nav)||1 ))*100;
      const ddv=(D.nav.drawdown&&D.nav.drawdown[i]!=null)?D.nav.drawdown[i]*100:0;
      let out=`<div style="font-weight:600;margin-bottom:4px">${ps[0].axisValue}</div>`;
      out+=`组合净值 <b>${NAV[i].toFixed(4)}</b> <span style="color:${clr(day)}">当日 ${pc(day)}</span><br/>`;
      if(PRIN) out+=`总资产 <b>${(PRIN*NAV[i]/1e4).toFixed(2)}</b> 万元<br/>`;
      out+=`较实盘起点 <span style="color:${clr(cum)}">${pc(cum)}</span>　当前回撤 ${ddv.toFixed(2)}%<br/>`;
      for(const p of ps){ if(p.seriesName==="组合净值") continue;
        const arr=bv[p.seriesName]||[]; const v=arr[i]; const pv=i>0?arr[i-1]:null;
        const bday=(v&&pv)?(v/pv-1)*100:null;
        const ex=(v&&NAV[i])?(NAV[i]/v-1)*100:null;
        out+=`${p.marker}${p.seriesName} <span style="color:#8b95b5">${v==null?"—":(+v).toFixed(4)}</span>`
          +` 单日 <span style="color:${bday==null?"#8b95b5":clr(bday)}">${pc(bday)}</span>`
          +` 累计超额 <span style="color:${ex==null?"#8b95b5":clr(ex)}">${pc(ex)}</span><br/>`;
      }
      return out;
    }};
  ch.setOption({
    backgroundColor:"transparent",
    legend:{data:leg,textStyle:{color:"#8b95b5"},top:0,right:0},
    tooltip:navTip,
    grid:{left:48,right:20,top:30,bottom:50},
    xAxis:{type:"category",data:dates,axisLine:{lineStyle:{color:"#2a3450"}},axisLabel:{color:"#8b95b5"}},
    yAxis:{type:"value",scale:true,splitLine:{lineStyle:{color:"#212a44"}},axisLabel:{color:"#8b95b5"}},
    dataZoom:[{type:"inside",startValue:_pw[0],endValue:_pw[1]},{type:"slider",startValue:_pw[0],endValue:_pw[1],height:16,bottom:8,borderColor:"#2a3450",backgroundColor:"#111726",fillerColor:"rgba(91,140,255,.15)",textStyle:{color:"#8b95b5"}}],
    series
  });
  // 回撤（与净值图共用时间轴缩放，双向联动）
  const dd=(D.nav.drawdown||[]).map(x=>x*100);
  const c2=echarts.init($("ddChart"),null,{renderer:"canvas"});
  CH.dd=c2;
  c2.setOption({
    backgroundColor:"transparent",grid:{left:48,right:20,top:8,bottom:18},
    xAxis:{type:"category",data:dates,axisLabel:{show:false},axisLine:{lineStyle:{color:"#2a3450"}}},
    yAxis:{type:"value",splitLine:{show:false},axisLabel:{color:"#8b95b5",formatter:"{value}%"}},
    tooltip:{trigger:"axis",backgroundColor:"#1c2438",borderColor:"#2a3450",textStyle:{color:"#e6eaf5"},valueFormatter:v=>v.toFixed(2)+"%"},
    dataZoom:[{type:"inside",xAxisIndex:0,startValue:_pw[0],endValue:_pw[1]},{type:"slider",show:false,xAxisIndex:0,startValue:_pw[0],endValue:_pw[1]}],
    series:[{name:"回撤",type:"line",smooth:true,showSymbol:false,data:dd,lineStyle:{width:1,color:"#e05c5c"},areaStyle:{color:"rgba(224,92,92,.18)"}}]
  });
  let _zsync=false;
  const zsync=(from,to)=>{ if(_zsync) return; _zsync=true;
    try{ const z=(from.getOption().dataZoom||[])[0]||{};
      if(typeof z.start === "number" && typeof z.end === "number")
        to.dispatchAction({type:"dataZoom", start:z.start, end:z.end});
      else if(typeof z.startValue === "number" && typeof z.endValue === "number")
        to.dispatchAction({type:"dataZoom", startValue:z.startValue, endValue:z.endValue});
    } finally{ _zsync=false; } };
  ch.on("datazoom",()=>{ zsync(ch,c2); onZoom(); });
  c2.on("datazoom",()=>{ zsync(c2,ch); onZoom(); });
  window.addEventListener("resize",()=>{ch.resize();c2.resize();});
  // 初始统计区间 = 实盘以来（与曲线默认缩放同源），KPI 随之呈现
  const _p0 = presetRange({k:"live"});
  WIN = {i0:_p0[0], i1:_p0[1], key:"live", custom:false};
  renderKPI(); renderRangeBar();
}

function renderFundPerf(){
  const fp=D.fundperf; if(!fp||!fp.rows||!fp.rows.length){ return; }
  $("fpCard").style.display="";
  const sp=x=>x==null?"—":(x>=0?"+":"")+(x*100).toFixed(2)+"%";
  const cc=x=>x==null?"":(x>=0?"up":"down");
  const tier=p=>p<=0.10?["顶尖","tg"]:p<=0.25?["优秀","tb"]:p<=0.50?["中上","tb"]:p<=0.75?["中游","tm"]:["靠后","tw"];
  const cell=(rk,n,pct,pure)=>{
    if(rk==null||n==null) return "—";
    const t=tier(pct);
    return `<div class="rk">第 ${rk}/${n} <span class="q ${t[1]}">${t[0]}·前${Math.round(pct*100)}%</span></div>`+(pure?"":'<span class="qtag">含回测</span>');
  };
  const fa=fp.fee_active!=null?("主动 "+(fp.fee_active*100).toFixed(1)+"%"):"";
  const fpa=fp.fee_passive!=null?("被动 "+(fp.fee_passive*100).toFixed(1)+"%"):"";
  const md=d=>d?(fdate(String(d)).slice(2)):"—";
  const lg=fp.lag==null?0:fp.lag;
  const fcls=lg<=0?"g":(lg===1?"y":"r");
  const ftxt=lg<=0?"同类·当日对齐":(lg===1?"同类·滞后1日(T+1)":("同类·滞后"+lg+"日·待夜间刷新"));
  const fresh=`<span class="fresh ${fcls}">${ftxt}</span>`;
  $("fpHint").innerHTML=`${fresh} 主锚 ${fp.anchor_name}(${fp.anchor_code})：整段年化超额 <b class="${cc(fp.ann_excess)}">${sp(fp.ann_excess)}</b>　信息比率 <b>${fp.info_ratio==null?"—":fp.info_ratio}</b>　同类池 主动${fp.n_active}/被动${fp.n_passive}　截至 ${fdate(fp.asof)}`+(lg>0?`<span style="color:var(--mut)">（组合净值当日 ${fdate(fp.curve_asof)} 已更新，同类净值以各基金最新披露为准）</span>`:"");
  let html=`<tr><th>周期</th><th>起止</th><th>组合</th><th>${fp.anchor_name}</th><th>超额·全收益</th><th>主动同类·分位</th><th>被动同类·分位</th><th>全部股票型·分位</th></tr>`;
  for(const r of fp.rows){
    html+=`<tr><td class="fp-l">${r.label}</td>`+
      `<td class="per">${md(r.start_date)}→${md(r.end_date)}</td>`+
      `<td class="num ${cc(r.strat)}">${sp(r.strat)}</td>`+
      `<td class="num">${sp(r.allincome)}</td>`+
      `<td class="num ${cc(r.ex_all)}">${sp(r.ex_all)}</td>`+
      `<td class="rktd">${cell(r.rank_active,r.n_active,r.pct_active,r.pure_live)}</td>`+
      `<td class="rktd">${cell(r.rank_passive,r.n_passive,r.pct_passive,r.pure_live)}</td>`+
      `<td class="rktd">${cell(r.rank_all,r.n_all,r.pct_all,r.pure_live)}</td></tr>`;
  }
  $("fundPerf").innerHTML=html;
  const pp=fp.peers||{};
  const pchip=p=>`<span class="pf">${p.name}${p.aum?(' · '+p.aum+'亿'):''}${p.fee!=null?(' · 费'+p.fee+'%'):''}${p.ret1y!=null?(' · 近1年 '+(p.ret1y>=0?"+":"")+(p.ret1y*100).toFixed(1)+'%'):''}</span>`;
  const pgrid=list=>((list&&list.length)?list.map(pchip).join(""):"<span class='pf'>—</span>");
  if(fp.peers){
    $("fpPeers").innerHTML=
      `<details class="peers"><summary>查看同类池明细（主动 ${fp.n_active} 只 · 被动 ${fp.n_passive} 只，按近1年涨幅排序）</summary>`+
      `<div class="peersub">主动红利池</div><div class="pfgrid">${pgrid(pp.active)}</div>`+
      `<div class="peersub">被动红利指数池</div><div class="pfgrid">${pgrid(pp.passive)}</div></details>`;
  }
  $("fpNote").innerHTML="口径：主锚＝中证红利全收益指数(H30269，含分红再投)，“超额·全收益”即红利增强的核心超额；“组合”列为费前真实涨幅。"
    +"同类排名为费后可比——分别按“主动红利池/被动红利池”各自费率中位数（"+([fa,fpa].filter(Boolean).join("、")||"—")+"）对组合扣费后，与同类公募复权净值同区间比较。"
    +"同类池＝业绩基准或名称含‘红利/股息’∩股票/混合型，剔除港股QDII·联接·FOF、A/C份额去重、成立≥1年、最新规模≥1亿。"
    +"“全部股票型·分位”＝把组合放进<b>全市场所有股票型基金</b>（fund_type=股票型、A/C去重，当期可比约 "+(fp.uni_n||"—")+" 只）中排名，同区间、按较保守的主动权益费率 "+(fp.fee_all!=null?(fp.fee_all*100).toFixed(1)+"%":"—")+" 扣费后可比，用于看全市场站位。"
    +"近6月/1年/今年以来/起始以来 含 rqalpha 回测段（实盘自 "+fdate((D.meta&&D.meta.start_date)||"")+" 起）、回测无真实申赎与规模冲击、排名偏乐观，已标“含回测”；近1周/1月/3月为纯实盘。"
    +"样本为存续基金，有幸存者偏差；基金净值以各自最新披露为准（周更）。AI 生成，仅供参考，不构成投资建议。";
}

function renderMonthly(){
  const rows=(D.monthly||[]).filter(x=>x.month>=D.meta.start_date.slice(0,6));
  const labels=rows.map(x=>`${x.month.slice(0,4)}-${x.month.slice(4)}`);
  const benches=D.meta.benchmarks||{};
  const pct=a=>a.map(v=>v==null?null:+(v*100).toFixed(2));
  const series=[{name:"组合",type:"bar",data:pct(rows.map(x=>x.ret)),
                 itemStyle:{color:p=> (p.value>=0?"#e05c5c":"#3ecf8e")},barWidth:"22%"}];
  const bcol={"000300.SH":"#8b95b5","000922.CSI":"#e6b566"};
  const ecol={"000300.SH":"#5b8cff","000922.CSI":"#b07bff"};
  const legend=["组合"];
  for(const c in benches){
    series.push({name:benches[c],type:"bar",data:pct(rows.map(x=>x["b_"+c])),
                 itemStyle:{color:bcol[c]||"#8b95b5"},barWidth:"22%"});
    legend.push(benches[c]);
  }
  for(const c in benches){
    series.push({name:"超额vs"+benches[c],type:"line",smooth:true,showSymbol:true,symbolSize:6,
                 lineStyle:{width:2,type:"dashed",color:ecol[c]||"#5b8cff"},itemStyle:{color:ecol[c]||"#5b8cff"},
                 data:pct(rows.map(x=>x["ex_"+c]))});
    legend.push("超额vs"+benches[c]);
  }
  const ch=echarts.init($("monthChart"),null,{renderer:"canvas"});
  ch.setOption({backgroundColor:"transparent",
    legend:{top:0,left:0,textStyle:{color:"#8b95b5",fontSize:11},data:legend,type:"scroll"},
    grid:{left:44,right:16,top:40,bottom:28},
    tooltip:{trigger:"axis",axisPointer:{type:"shadow"},backgroundColor:"#1c2438",borderColor:"#2a3450",textStyle:{color:"#e6eaf5"},valueFormatter:v=>(v==null?"—":v+"%")},
    xAxis:{type:"category",data:labels,axisLabel:{color:"#8b95b5",rotate:30},axisLine:{lineStyle:{color:"#2a3450"}}},
    yAxis:{type:"value",splitLine:{lineStyle:{color:"#212a44"}},axisLabel:{color:"#8b95b5",formatter:"{value}%"}},
    series});
  window.addEventListener("resize",()=>ch.resize());
}

function renderHoldings(){
  const h=D.holdings||{};
  const src=h.source==="rqalpha"?"rqalpha 已实现":"临时等权";
  $("holdAsof").textContent = (h.asof?("定价日 "+fdate(h.asof)+" · "+src):"")+"  本月涨跌=自本期起点全收益，净值贡献=期初权重×涨幅";
  const rows=h.rows||[];
  const sgn=v=>v>=0?`<span style="color:#e05c5c">+${v.toFixed(2)}</span>`:`<span style="color:#3ecf8e">${v.toFixed(2)}</span>`;
  let html="<tr><th>代码</th><th>名称</th><th>行业</th><th>股息率%</th><th>PE</th><th>权重</th><th>本月涨跌%</th><th>净值贡献pp</th></tr>";
  rows.forEach(r=>{
    html+=`<tr><td class="num">${r.code}</td><td>${r.name||""}</td><td>${r.industry||""}</td>`+
      `<td class="num">${r.dv||""}</td><td class="num">${r.pe||""}</td><td class="num">${(r.weight*100).toFixed(1)}%</td>`+
      `<td class="num">${sgn((r.ret||0)*100)}</td><td class="num">${sgn(r.contrib||0)}</td></tr>`;});
  if(h.cash_w!=null) html+=`<tr class="cash"><td>—</td><td>现金</td><td></td><td></td><td></td><td class="num">${(h.cash_w*100).toFixed(1)}%</td><td></td><td></td></tr>`;
  // 组合汇总：股息率/PE 按权重加权(不含现金)，本月涨跌/净值贡献=各股贡献合计(≈组合区间收益)
  let swdv=0, swpe=0, scontrib=0;
  rows.forEach(r=>{ const w=r.weight||0, dv=parseFloat(r.dv), pe=parseFloat(r.pe);
    if(!isNaN(dv)) swdv+=w*dv; if(!isNaN(pe)) swpe+=w*pe; scontrib+=(r.contrib||0); });
  const eqw=rows.reduce((a,r)=>a+(r.weight||0),0)||1;
  html+=`<tr class="sumrow"><td>—</td><td><b>组合合计</b></td><td></td><td class="num">${(swdv/eqw).toFixed(2)}</td><td class="num">${(swpe/eqw).toFixed(2)}</td>`+
    `<td class="num">100.0%</td><td class="num">${sgn(scontrib)}</td><td class="num">${sgn(scontrib)}</td></tr>`;
  $("holdings").innerHTML=html;
}

function renderRebals(){
  const rb=D.rebalances||[];
  $("rebals").innerHTML=rb.map(x=>`<div class="rebal">生效 <b>${fdate(x.effective)}</b> · ${x.n} 只</div>`).join("")||"<span class='hint'>暂无调仓记录</span>";
}

function renderEvents(){
  const ev=D.events||{}; const box=$("eventsBox"); if(!box) return;
  const items=ev.items||[]; if(!items.length){ return; }
  $("eventsCard").style.display="";
  const asof=ev.asof||"";
  const up=items.filter(x=>x.date>asof);      // 未来1月将至
  const past=items.filter(x=>x.date<=asof).slice().reverse();  // 近3月已发生(新在前)
  const row=x=>{
    const todo=x.status && x.status.indexOf("待")>=0 || x.status==="预案";
    return `<div class="evt${todo?' todo':''}"><span class="ed">${fdate(x.date)}</span>`+
      `<span class="ek ${x.kind==='分红'?'div':'res'}">${x.kind}</span>`+
      `<span class="es">${x.status}</span><span class="en">${x.name}</span>`+
      `<span class="et">${x.text}</span></div>`;
  };
  let html="";
  html+= up.length? ("<div class='egrid'><div class='eh'>即将发生（未来1个月）</div>"+up.map(row).join("")+"</div>"):"";
  if(past.length){
    html+=`<div class='egrid'><div class='eh'>已发生（近3个月）</div>${row(past[0])}`;
    if(past.length>1) html+=`<details class='evmore'><summary>展开更早 ${past.length-1} 条</summary>${past.slice(1).map(row).join("")}</details>`;
    html+=`</div>`;
  }
  box.innerHTML=html;
}

function renderExposure(){
  const e=D.exposure; if(!e){ return; }
  const BN=e.bench_name||"基准";
  $("expoCard").style.display="";
  const sum=$("expoSummary"); if(sum) sum.textContent=e.summary||"";
  $("expoHint").textContent=`as-of ${fdate(e.asof)} · 组合全市场z暴露，并与${BN}对比(主动=组合−${BN}) · 历史 ${e.history.length} 期`;
  const gNames=e.groups||Object.keys(e.current_group||{});
  // 雷达：风格组 组合 vs 基准
  const radar=echarts.init($("expoRadar"),null,{renderer:"canvas"});
  radar.setOption({backgroundColor:"transparent",
    title:{text:`风格暴露 组合 vs ${BN}`,left:"center",textStyle:{color:"#8b95b5",fontSize:13}},
    legend:{bottom:0,textStyle:{color:"#8b95b5"},data:["组合",BN]},
    tooltip:{backgroundColor:"#1c2438",borderColor:"#2a3450",textStyle:{color:"#e6eaf5"}},
    radar:{indicator:gNames.map(g=>({name:g,max:1.8,min:-1.8})),axisName:{color:"#8b95b5",fontSize:11},
      splitLine:{lineStyle:{color:"#26324f"}},splitArea:{show:false},axisLine:{lineStyle:{color:"#26324f"}}},
    series:[{type:"radar",data:[
      {name:"组合",value:gNames.map(g=>(e.current_group||{})[g]??0),lineStyle:{color:"#5b8cff"},itemStyle:{color:"#5b8cff"},areaStyle:{color:"rgba(91,140,255,.15)"}},
      {name:BN,value:gNames.map(g=>(e.bench_group||{})[g]??0),lineStyle:{color:"#e6b566"},itemStyle:{color:"#e6b566"}}]}]});
  // 历史折线：各组暴露随时间
  const hist=echarts.init($("expoHist"),null,{renderer:"canvas"});
  const hd=(e.history||[]).map(h=>fdate(h.date));
  hist.setOption({backgroundColor:"transparent",
    title:{text:"风格暴露趋势",left:"center",textStyle:{color:"#8b95b5",fontSize:13}},
    legend:{bottom:0,type:"scroll",textStyle:{color:"#8b95b5"},data:gNames},
    tooltip:{trigger:"axis",backgroundColor:"#1c2438",borderColor:"#2a3450",textStyle:{color:"#e6eaf5"}},
    grid:{left:40,right:16,top:36,bottom:44},
    xAxis:{type:"category",data:hd,axisLabel:{color:"#8b95b5"},axisLine:{lineStyle:{color:"#2a3450"}}},
    yAxis:{type:"value",name:"z",splitLine:{lineStyle:{color:"#212a44"}},axisLabel:{color:"#8b95b5"}},
    series:gNames.map(g=>({name:g,type:"line",smooth:true,showSymbol:false,
      data:(e.history||[]).map(h=>h.group?h.group[g]:null)}))});
  // 因子柱：18因子 组合暴露 + 主动(−基准)，按主动绝对值降序
  const bars=echarts.init($("expoBars"),null,{renderer:"canvas"});
  const fs=[...(e.current||[])].sort((a,b)=>Math.abs(b.active??0)-Math.abs(a.active??0));
  bars.setOption({backgroundColor:"transparent",
    title:{text:`单因子暴露 与 主动(vs ${BN})`,left:"center",textStyle:{color:"#8b95b5",fontSize:13}},
    legend:{top:2,right:0,textStyle:{color:"#8b95b5"},data:["组合",`主动(−${BN})`]},
    tooltip:{trigger:"axis",axisPointer:{type:"shadow"},backgroundColor:"#1c2438",borderColor:"#2a3450",textStyle:{color:"#e6eaf5"}},
    grid:{left:80,right:16,top:30,bottom:24},
    xAxis:{type:"value",name:"z",splitLine:{lineStyle:{color:"#212a44"}},axisLabel:{color:"#8b95b5"}},
    yAxis:{type:"category",data:fs.map(x=>x.name),axisLabel:{color:"#8b95b5",fontSize:11},axisLine:{lineStyle:{color:"#2a3450"}}},
    series:[{name:"组合",type:"bar",data:fs.map(x=>x.raw),itemStyle:{color:"#5b8cff"},barGap:0},
            {name:`主动(−${BN})`,type:"bar",data:fs.map(x=>x.active??null),itemStyle:{color:"#e05c5c"}}]});
  const dl=e.daily;
  if(dl){
    $("expoDailyWrap").style.display="";
    $("expoDailyAsof").textContent="　截至 "+fdate(dl.asof);
    const pg=e.current_group||{};
    const f2=x=>x==null?"—":(x>=0?"+":"")+x.toFixed(2);
    $("expoDailyGroups").innerHTML=Object.keys(dl.group||{}).map(g=>{
      const v=dl.group[g], p=pg[g], dlt=(v!=null&&p!=null)?(v-p):null;
      const dc=dlt==null?"":(dlt>=0?"up":"down");
      return `<span class="dchip"><b>${g}</b> <span class="${v>=0?'up':'down'}">${f2(v)}</span>`+
             (dlt==null?"":`<i class="${dc}">Δ${dlt>=0?'+':''}${dlt.toFixed(2)}</i>`)+`</span>`;
    }).join("");
    const fr=(dl.factors||[]).filter(x=>x.active!=null).sort((a,b)=>Math.abs(b.active)-Math.abs(a.active));
    let th="<tr><th>因子</th><th>类别</th><th>暴露</th><th>主动(−基准)</th></tr>";
    const rows=fr.map(x=>`<tr><td style="text-align:left">${x.name}</td><td style="text-align:left;color:var(--mut)">${x.cat||""}</td>`+
      `<td class="num ${x.raw>=0?'up':'down'}">${f2(x.raw)}</td>`+
      `<td class="num ${x.active>=0?'up':'down'}">${f2(x.active)}</td></tr>`).join("");
    $("expoDailyFactors").innerHTML=th+rows;
  }
  window.addEventListener("resize",()=>{radar.resize();hist.resize();bars.resize();});
}
init();
