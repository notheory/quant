const D = window.PDATA || {};
const $ = id => document.getElementById(id);
const fdate = s => s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : "";
const pct = (x,dg=2) => (x==null)?"—":(x*100).toFixed(dg)+"%";
const cls = x => x>=0?"up":"down";

function init(){
  const m = D.meta||{};
  $("subtitle").textContent = "· 净值起点 " + fdate(m.start_date||"") + " = 1.0000（实盘1:1跟踪起始）· 低频月末调仓 · 市值等权 · 全收益(含分红再投)";
  $("updated").textContent = m.updated_at||"—";
  renderKPI();
  renderReport();
  renderSignal();
  renderNav();
  renderMonthly();
  renderHoldings();
  renderRebals();
  renderHistory();
  renderExposure();
  const rq=(D.meta&&D.meta.rq)||{};
  $("foot").innerHTML =
    "口径：rqalpha 已实现成交(等权/成本/停牌) 至 "+(rq.last?fdate(rq.last):"—")+
    (rq.covered?`，其后为临时市值等权、次月自动修正`:"")+
    " · 全收益(分红再投资) · 数据源 rqalpha + tushare · 起始 "+(m.start_date||"")+" 净值1.00。 本看板仅供业绩展示，不构成投资建议。";
}

function renderHistory(){
  const el=$("histWrap"); const hist=D.history||[];
  if(!el) return;
  el.innerHTML = hist.map((h,idx)=>{
    const badge = h.source==="rqalpha"?"<span class='tag rq'>rqalpha已实现</span>":"<span class='tag pv'>临时等权</span>";
    const thin = h.thin?`<span class='tag warn'>⚠该月末仅 ${h.rows.length} 只</span>`:"";
    const cells = (h.rows||[]).map(r=>`<span class="hcell">${r.name||r.code} <b>${(r.weight*100).toFixed(1)}%</b></span>`).join("")||"<span class='hcell'>空仓</span>";
    const cash = h.cash_w>0.005?`<span class="hcell cash">现金 ${(h.cash_w*100).toFixed(1)}%</span>`:"";
    return `<details class="mrow"${idx===hist.length-1?" open":""}><summary>${h.month.slice(0,4)}-${h.month.slice(4)} · ${(h.rows||[]).length}只 ${badge}${thin} <i>${fdate(h.date)}</i></summary><div class="hrow">${cells}${cash}</div></details>`;
  }).join("");
}

function renderKPI(){
  const s=D.nav.nav||[], mt=D.metrics||{};
  const last=s[s.length-1], prev=s[s.length-2];
  const dayRet = prev? last/prev-1 : 0;
  const since = last? last-1 : 0;
  const bm=D.benchmarks||{};
  const bEnd = c=>{const a=(bm[c]&&bm[c].values)||[];for(let i=a.length-1;i>=0;i--){if(a[i]!=null)return a[i];}return null;};
  const exHS = (last&&bEnd("000922.CSI"))? last/bEnd("000922.CSI")-1 : null;
  const ex300= (last&&bEnd("000300.SH"))? last/bEnd("000300.SH")-1 : null;
  const cards=[
    ["最新净值", last?last.toFixed(4):"—", ""],
    ["当日收益", pct(dayRet), cls(dayRet)],
    ["累计收益", pct(since), cls(since)],
    ["年化收益", pct(mt.ann_return), cls(mt.ann_return||0)],
    ["年化波动", pct(mt.ann_vol), ""],
    ["夏普比率", mt.sharpe!=null?mt.sharpe.toFixed(2):"—", (mt.sharpe||0)>=1?"up":""],
    ["最大回撤", pct(mt.max_drawdown), "down"],
    ["超额·中证红利", exHS==null?"—":pct(exHS), cls(exHS||0)],
    ["超额·沪深300", ex300==null?"—":pct(ex300), cls(ex300||0)],
  ];
  $("kpis").innerHTML = cards.map(c=>
    `<div class="kpi"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join("");
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
  const rq=(D.meta&&D.meta.rq)||{};
  const stg=D.nav.stages||[];
  const provStartIdx=stg.findIndex(s=>s==="provisional");
  if(provStartIdx>=0){
    const bdate=D.nav.dates[provStartIdx];
    series[0].markArea={silent:true,itemStyle:{color:"rgba(230,181,102,.08)"},
      data:[[{xAxis:fdate(bdate)},{xAxis:"max"}]]};
    series[0].markLine={silent:true,symbol:"none",lineStyle:{color:"#e6b566",type:"dashed"},
      label:{formatter:"rqalpha 已实现 → 临时等权",color:"#e6b566",fontSize:11},
      data:[{xAxis:fdate(bdate)}]};
  }
  const h=document.querySelector("#navHint");
  if(h){
    if(rq.covered && provStartIdx<0){
      h.textContent=`全程 rqalpha 回测真实成交(${rq.n_days}日，含真实现金余额)·全收益`;
    }else if(rq.covered){
      h.textContent=`rqalpha 已实现至 ${fdate((D.nav.dates[provStartIdx-1]||rq.last))}，其后为临时等权(待次月rqalpha修正)`;
    }else{ h.textContent="全收益(后复权，分红再投资)口径"; }
  }
  const ch=echarts.init($("navChart"),null,{renderer:"canvas"});
  const NAV=D.nav.nav||[];
  const navTip={trigger:"axis",backgroundColor:"#1c2530",borderColor:"#2a3340",textStyle:{color:"#e6edf3"},
    formatter:(ps)=>{
      if(!ps||!ps.length) return "";
      const i=ps[0].dataIndex;
      const day= i>0 && NAV[i-1] ? (NAV[i]/NAV[i-1]-1)*100 : 0;
      const cum=(NAV[i]-( (D.meta&&D.meta.initial_nav)||1 ))*100;
      const ddv=(D.nav.drawdown&&D.nav.drawdown[i]!=null)?D.nav.drawdown[i]*100:0;
      const ccol=day>=0?"#f0776d":"#3fb27f";
      let out=`<div style="font-weight:600;margin-bottom:4px">${ps[0].axisValue}</div>`;
      out+=`组合净值 <b>${NAV[i].toFixed(4)}</b> <span style="color:${ccol}">当日 ${day>=0?"+":""}${day.toFixed(2)}%</span><br/>`;
      out+=`累计收益 <span style="color:${cum>=0?"#f0776d":"#3fb27f"}">${cum>=0?"+":""}${cum.toFixed(2)}%</span>　当前回撤 ${ddv.toFixed(2)}%<br/>`;
      ps.forEach(p=>{ if(p.seriesName!=="组合净值"&&p.value!=null) out+=`${p.marker}${p.seriesName} ${(+p.value).toFixed(4)}<br/>`;});
      return out;
    }};
  ch.setOption({
    backgroundColor:"transparent",
    legend:{data:leg,textStyle:{color:"#8b949e"},top:0,right:0},
    tooltip:navTip,
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
  const rows=(D.monthly||[]).filter(x=>x.month>=D.meta.start_date.slice(0,6));
  const labels=rows.map(x=>`${x.month.slice(0,4)}-${x.month.slice(4)}`);
  const benches=D.meta.benchmarks||{};
  const pct=a=>a.map(v=>v==null?null:+(v*100).toFixed(2));
  const series=[{name:"组合",type:"bar",data:pct(rows.map(x=>x.ret)),
                 itemStyle:{color:p=> (p.value>=0?"#f0776d":"#3fb27f")},barWidth:"22%"}];
  const bcol={"000300.SH":"#8b949e","000922.CSI":"#e6b566"};
  const ecol={"000300.SH":"#4ea1ff","000922.CSI":"#c084fc"};
  const legend=["组合"];
  for(const c in benches){
    series.push({name:benches[c],type:"bar",data:pct(rows.map(x=>x["b_"+c])),
                 itemStyle:{color:bcol[c]||"#8b949e"},barWidth:"22%"});
    legend.push(benches[c]);
  }
  for(const c in benches){
    series.push({name:"超额vs"+benches[c],type:"line",smooth:true,showSymbol:true,symbolSize:6,
                 lineStyle:{width:2,type:"dashed",color:ecol[c]||"#4ea1ff"},itemStyle:{color:ecol[c]||"#4ea1ff"},
                 data:pct(rows.map(x=>x["ex_"+c]))});
    legend.push("超额vs"+benches[c]);
  }
  const ch=echarts.init($("monthChart"),null,{renderer:"canvas"});
  ch.setOption({backgroundColor:"transparent",
    legend:{top:0,left:0,textStyle:{color:"#8b949e",fontSize:11},data:legend,type:"scroll"},
    grid:{left:44,right:16,top:40,bottom:28},
    tooltip:{trigger:"axis",axisPointer:{type:"shadow"},backgroundColor:"#1c2530",borderColor:"#2a3340",textStyle:{color:"#e6edf3"},valueFormatter:v=>(v==null?"—":v+"%")},
    xAxis:{type:"category",data:labels,axisLabel:{color:"#8b949e",rotate:30},axisLine:{lineStyle:{color:"#2a3340"}}},
    yAxis:{type:"value",splitLine:{lineStyle:{color:"#1a2029"}},axisLabel:{color:"#8b949e",formatter:"{value}%"}},
    series});
  window.addEventListener("resize",()=>ch.resize());
}

function renderHoldings(){
  const h=D.holdings||{};
  const src=h.source==="rqalpha"?"rqalpha 已实现":"临时等权";
  $("holdAsof").textContent = (h.asof?("定价日 "+fdate(h.asof)+" · "+src):"")+"  本月涨跌=自本期起点全收益，净值贡献=期初权重×涨幅";
  const rows=h.rows||[];
  const sgn=v=>v>=0?`<span style="color:#f0776d">+${v.toFixed(2)}</span>`:`<span style="color:#3fb27f">${v.toFixed(2)}</span>`;
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
    title:{text:`风格暴露 组合 vs ${BN}`,left:"center",textStyle:{color:"#8b949e",fontSize:13}},
    legend:{bottom:0,textStyle:{color:"#8b949e"},data:["组合",BN]},
    tooltip:{backgroundColor:"#1c2530",borderColor:"#2a3340",textStyle:{color:"#e6edf3"}},
    radar:{indicator:gNames.map(g=>({name:g,max:1.8,min:-1.8})),axisName:{color:"#8b949e",fontSize:11},
      splitLine:{lineStyle:{color:"#233041"}},splitArea:{show:false},axisLine:{lineStyle:{color:"#233041"}}},
    series:[{type:"radar",data:[
      {name:"组合",value:gNames.map(g=>(e.current_group||{})[g]??0),lineStyle:{color:"#4ea1ff"},itemStyle:{color:"#4ea1ff"},areaStyle:{color:"rgba(78,161,255,.15)"}},
      {name:BN,value:gNames.map(g=>(e.bench_group||{})[g]??0),lineStyle:{color:"#e6b566"},itemStyle:{color:"#e6b566"}}]}]});
  // 历史折线：各组暴露随时间
  const hist=echarts.init($("expoHist"),null,{renderer:"canvas"});
  const hd=(e.history||[]).map(h=>fdate(h.date));
  hist.setOption({backgroundColor:"transparent",
    title:{text:"风格暴露趋势",left:"center",textStyle:{color:"#8b949e",fontSize:13}},
    legend:{bottom:0,type:"scroll",textStyle:{color:"#8b949e"},data:gNames},
    tooltip:{trigger:"axis",backgroundColor:"#1c2530",borderColor:"#2a3340",textStyle:{color:"#e6edf3"}},
    grid:{left:40,right:16,top:36,bottom:44},
    xAxis:{type:"category",data:hd,axisLabel:{color:"#8b949e"},axisLine:{lineStyle:{color:"#2a3340"}}},
    yAxis:{type:"value",name:"z",splitLine:{lineStyle:{color:"#1a2029"}},axisLabel:{color:"#8b949e"}},
    series:gNames.map(g=>({name:g,type:"line",smooth:true,showSymbol:false,
      data:(e.history||[]).map(h=>h.group?h.group[g]:null)}))});
  // 因子柱：18因子 组合暴露 + 主动(−基准)，按主动绝对值降序
  const bars=echarts.init($("expoBars"),null,{renderer:"canvas"});
  const fs=[...(e.current||[])].sort((a,b)=>Math.abs(b.active??0)-Math.abs(a.active??0));
  bars.setOption({backgroundColor:"transparent",
    title:{text:`单因子暴露 与 主动(vs ${BN})`,left:"center",textStyle:{color:"#8b949e",fontSize:13}},
    legend:{top:2,right:0,textStyle:{color:"#8b949e"},data:["组合",`主动(−${BN})`]},
    tooltip:{trigger:"axis",axisPointer:{type:"shadow"},backgroundColor:"#1c2530",borderColor:"#2a3340",textStyle:{color:"#e6edf3"}},
    grid:{left:80,right:16,top:30,bottom:24},
    xAxis:{type:"value",name:"z",splitLine:{lineStyle:{color:"#1a2029"}},axisLabel:{color:"#8b949e"}},
    yAxis:{type:"category",data:fs.map(x=>x.name),axisLabel:{color:"#8b949e",fontSize:11},axisLine:{lineStyle:{color:"#2a3340"}}},
    series:[{name:"组合",type:"bar",data:fs.map(x=>x.raw),itemStyle:{color:"#4ea1ff"},barGap:0},
            {name:`主动(−${BN})`,type:"bar",data:fs.map(x=>x.active??null),itemStyle:{color:"#f0776d"}}]});
  window.addEventListener("resize",()=>{radar.resize();hist.resize();bars.resize();});
}
init();
