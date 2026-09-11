const D = window.PDATA || {};
const $ = id => document.getElementById(id);
const fdate = s => s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : "";
const pct = (x,dg=2) => (x==null)?"—":(x*100).toFixed(dg)+"%";
const cls = x => x>=0?"up":"down";

function init(){
  const m = D.meta||{};
  $("subtitle").textContent = "· " + (m.combo||"") + " 组合 · 低频调仓（月末）";
  $("updated").textContent = m.updated_at||"—";
  renderKPI();
  renderSignal();
  renderNav();
  renderMonthly();
  renderHoldings();
  renderRebals();
  $("foot").innerHTML =
    "口径：全收益（后复权，分红再投资）· 整手数建仓· 数据源 tushare · " +
    "起始 "+ (m.start_date||"") + " 净值1.00。"+
    (D.metrics&&D.metrics.recon_max_err!=null?` 每日对账最大误差 ${(D.metrics.recon_max_err*1e4).toFixed(2)}bp。`:"")+
    " 本看板仅供业绩展示，不构成投资建议。";
}

function renderKPI(){
  const s=D.nav.nav||[], mt=D.metrics||{};
  const last=s[s.length-1], prev=s[s.length-2];
  const dayRet = prev? last/prev-1 : 0;
  const since = last? last-1 : 0;
  const cards=[
    ["最新净值", last?last.toFixed(4):"—", ""],
    ["当日收益", pct(dayRet), cls(dayRet)],
    ["累计收益", pct(since), cls(since)],
    ["年化收益", pct(mt.ann_return), cls(mt.ann_return||0)],
    ["最大回撤", pct(mt.max_drawdown), "down"],
  ];
  $("kpis").innerHTML = cards.map(c=>
    `<div class="kpi"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join("");
}

function renderSignal(){
  const g=$("signal"), si=D.signal||{};
  const role=si.role;
  const fmtList=(codes,name)=> (name||"");
  let html="";
  if(role==="select"){
    g.className="signal select";
    const add=(si.pending?.added||[]), rm=(si.pending?.removed||[]);
    html=`<b>📌 选股日（${fdate(si.today)}）</b>：策略已产出新一期目标组合，等待 ${fdate(si.next_rebalance)} 收盘集中调仓。<br>`;
    html+= add.length? add.map(c=>`<span class="chip add">调入 ${c}</span>`).join(""):"";
    html+= rm.length? rm.map(c=>`<span class="chip del">调出 ${c}</span>`).join(""):"";
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
  const series=[{name:"组合净值",type:"line",smooth:true,showSymbol:false,lineStyle:{width:2.5,color:"#4ea1ff"},itemStyle:{color:"#4ea1ff"},data:D.nav.nav,z:5}];
  const leg=["组合净值"];
  const colors={};
  for(const c in (D.benchmarks||{})){
    const b=D.benchmarks[c], col=c==="000922.CSI"?"#e6b566":"#8b949e";
    series.push({name:b.name,type:"line",smooth:true,showSymbol:false,lineStyle:{width:1.2,type:"dashed",color:col},itemStyle:{color:col},data:b.values});
    leg.push(b.name);
  }
  const ch=echarts.init($("navChart"),null,{renderer:"canvas"});
  ch.setOption({
    backgroundColor:"transparent",
    legend:{data:leg,textStyle:{color:"#8b949e"},top:0,right:0},
    tooltip:{trigger:"axis",backgroundColor:"#1c2530",borderColor:"#2a3340",textStyle:{color:"#e6edf3"}},
    grid:{left:48,right:20,top:30,bottom:50},
    xAxis:{type:"category",data:dates,axisLine:{lineStyle:{color:"#2a3340"}},axisLabel:{color:"#8b949e"}},
    yAxis:{type:"value",scale:true,splitLine:{lineStyle:{color:"#1a2029"}},axisLabel:{color:"#8b949e"}},
    dataZoom:[{type:"inside"},{type:"slider",height:16,bottom:8,borderColor:"#2a3340",backgroundColor:"#12171e",fillerColor:"rgba(78,161,255,.15)",textStyle:{color:"#8b949e"}}],
    series
  });
  // 回撤
  const dd=(D.nav.drawdown||[]).map(x=>x*100);
  const c2=echarts.init($("ddChart"),null,{renderer:"canvas"});
  c2.setOption({
    backgroundColor:"transparent",grid:{left:48,right:20,top:8,bottom:18},
    xAxis:{type:"category",data:dates,axisLabel:{show:false},axisLine:{lineStyle:{color:"#2a3340"}}},
    yAxis:{type:"value",splitLine:{show:false},axisLabel:{color:"#8b949e",formatter:"{value}%"}},
    tooltip:{trigger:"axis",backgroundColor:"#1c2530",borderColor:"#2a3340",textStyle:{color:"#e6edf3"},valueFormatter:v=>v.toFixed(2)+"%"},
    series:[{name:"回撤",type:"line",smooth:true,showSymbol:false,data:dd,lineStyle:{width:1,color:"#f0776d"},areaStyle:{color:"rgba(240,119,109,.18)"}}]
  });
  window.addEventListener("resize",()=>{ch.resize();c2.resize();});
}

function renderMonthly(){
  const rows=(D.monthly||[]).filter(x=>x.month>D.meta.start_date.slice(0,6));
  const labels=rows.map(x=>`${x.month.slice(0,4)}-${x.month.slice(4)}`);
  const vals=rows.map(x=>+(x.ret*100).toFixed(2));
  const ch=echarts.init($("monthChart"),null,{renderer:"canvas"});
  ch.setOption({backgroundColor:"transparent",
    grid:{left:44,right:16,top:16,bottom:28},
    tooltip:{trigger:"axis",backgroundColor:"#1c2530",borderColor:"#2a3340",textStyle:{color:"#e6edf3"},valueFormatter:v=>v+"%"},
    xAxis:{type:"category",data:labels,axisLabel:{color:"#8b949e",rotate:30},axisLine:{lineStyle:{color:"#2a3340"}}},
    yAxis:{type:"value",splitLine:{lineStyle:{color:"#1a2029"}},axisLabel:{color:"#8b949e",formatter:"{value}%"}},
    series:[{type:"bar",data:vals.map(v=>({value:v,itemStyle:{color:v>=0?"#f0776d":"#3fb27f"}})),barWidth:"55%"}]});
  window.addEventListener("resize",()=>ch.resize());
}

function renderHoldings(){
  const h=D.holdings||{};
  $("holdAsof").textContent = h.asof? ("定价日 "+fdate(h.asof)): "";
  const rows=h.rows||[];
  let html="<tr><th>代码</th><th>名称</th><th>行业</th><th>股息率</th><th>PE</th><th>权重</th></tr>";
  rows.forEach(r=>{html+=`<tr><td class="num">${r.code}</td><td>${r.name||""}</td><td>${r.industry||""}</td>`+
    `<td class="num">${r.dv||""}</td><td class="num">${r.pe||""}</td><td class="num">${(r.weight*100).toFixed(1)}%</td></tr>`;});
  if(h.cash_w!=null) html+=`<tr class="cash"><td>—</td><td>现金</td><td></td><td></td><td></td><td class="num">${(h.cash_w*100).toFixed(1)}%</td></tr>`;
  $("holdings").innerHTML=html;
}

function renderRebals(){
  const rb=D.rebalances||[];
  $("rebals").innerHTML=rb.map(x=>`<div class="rebal">生效 <b>${fdate(x.effective)}</b> · ${x.n} 只</div>`).join("")||"<span class='hint'>暂无调仓记录</span>";
}
init();
