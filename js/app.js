/* Case Report Dashboard: filters, charts, table, add/edit/delete, Excel upload, CSV export.
   Data comes from data/data.json; shared changes are saved through window.CaseServices (see js/firebase.js). */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var FIELDS=['id','type','origin','date','status','account','province','ptype','product','shop','section','by','desc'];
var MONF=['January','February','March','April','May','June','July','August','September','October','November','December'];
var PAGE=25, MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

var S={sort:{k:'date',dir:-1},base:[],edits:new Map(),meta:null,rows:[],f:{year:'',month:'',status:'',type:'',province:'',origin:'',ptype:'',q:''},page:0,db:null,dl:null,dbOK:false,lastEdit:'',baseGen:null};

/* ---------- helpers ---------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmtN(n){return Number(n).toLocaleString('en-US')}
function monthLabel(k){var p=k.split('-');return MON[+p[1]-1]+' '+p[0]}
function fmtDate(iso){if(!iso)return '\u2014';var p=iso.split('-');return p[2]+' '+MON[+p[1]-1]+' '+p[0]}
function fmtStamp(iso){if(!iso)return '\u2014';var d=new Date(iso);if(isNaN(d))return '\u2014';
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+', '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
var toastT;function toast(m){var t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true},3200)}
function docId(id){return String(id).replace(/[^A-Za-z0-9_\-.~:@+]/g,'_').slice(0,150)||'x'}
function tcase(s){return String(s||'').trim().replace(/\s+/g,' ')}
function normProvince(s){s=tcase(s).toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase()});return s==='Stueng Treng'?'Stung Treng':s}
function normOrigin(s){s=String(s||'');var m=s.match(/\(([^)]+)\)/);return (m?m[1]:s).trim()}
function cleanDesc(s){return String(s||'').replace(/_x000D_/g,'').replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim()}
function parseDate(v){
  if(v instanceof Date&&!isNaN(v))return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
  var s=String(v||'').trim(),m;
  if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)))return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  if((m=s.match(/^(\d{4})-(\d{2})-(\d{2})/)))return m[1]+'-'+m[2]+'-'+m[3];
  return '';
}
function monthOf(r){return r.date?r.date.slice(0,7):''}

/* ---------- effective rows = base + shared edits ---------- */
function compute(){
  var m=new Map();S.base.forEach(function(r){m.set(r.id,r)});
  S.edits.forEach(function(e,k){
    if(e.deleted){m.delete(e.id||k)}else if(e.rec){m.set(e.rec.id,e.rec)}
  });
  S.rows=Array.from(m.values());
  var le='';S.edits.forEach(function(e){if(e.updatedAt&&e.updatedAt>le)le=e.updatedAt});S.lastEdit=le;
}
function editedIds(){var s=new Set();S.edits.forEach(function(e){if(!e.deleted&&e.rec)s.add(e.rec.id)});return s}

/* ---------- filtering ---------- */
function match(r,skipMonth){
  var f=S.f;
  if(f.year&&r.date.slice(0,4)!==f.year)return false;
  if(!skipMonth&&f.month&&r.date.slice(5,7)!==f.month)return false;
  if(f.status&&r.status!==f.status)return false;
  if(f.type&&r.type!==f.type)return false;
  if(f.province&&r.province!==f.province)return false;
  if(f.origin&&(r.origin||'Unknown')!==f.origin)return false;
  if(f.ptype&&(r.ptype||'Not specified')!==f.ptype)return false;
  if(f.q){var q=f.q.toLowerCase();
    if((r.id+' '+r.account+' '+r.province+' '+r.product+' '+r.shop+' '+r.desc+' '+r.by).toLowerCase().indexOf(q)<0)return false}
  return true;
}
function countBy(rows,key,blank){var m={};rows.forEach(function(r){var k=r[key]||blank||'(blank)';m[k]=(m[k]||0)+1});
  return Object.keys(m).map(function(k){return [k,m[k]]}).sort(function(a,b){return b[1]-a[1]})}
function uniq(key){var s={};S.rows.forEach(function(r){if(r[key])s[r[key]]=1});return Object.keys(s).sort()}

/* ---------- render ---------- */
var ICON={
  total:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H8l-4 4z"/></svg>',
  ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20zM12 10v4M12 17h.01"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
  del:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
};
function shell(){
  $('#app').innerHTML=
  '<section class="panel"><div class="filters">'+
    '<label class="month-field">Year<select id="fYear"></select></label>'+
    '<label class="month-field">Month<select id="fMonth"></select></label>'+
    '<label>Status<select id="fStatus"></select></label>'+
    '<label>Case type<select id="fType"></select></label>'+
    '<label>Province<select id="fProv"></select></label>'+
    '<label class="search">Search<input type="text" id="fQ" placeholder="Case no., customer, product, shop, description"></label>'+
  '</div><div class="fbar"><div class="chips" id="active"></div><div><span id="fCount"></span> <button class="btn" id="fReset" style="padding:4px 10px;margin-left:8px">Reset filters</button></div></div></section>'+
  '<section class="kpis" id="kpis"></section>'+
  '<section class="panel"><h2>Cases per month</h2><p class="hint" id="trendHint">Select a bar to filter the dashboard to that month.</p><div class="insights" id="insights"></div><div id="trendBox"></div>'+
    '<div class="legend"><span><i style="background:var(--blue)"></i>Month</span><span><i style="background:var(--orange)"></i>Selected month</span></div></section>'+
  '<section class="cols" id="breakdowns"></section>'+
  '<section class="panel"><div class="thead"><div><h2>Cases</h2><p class="hint" style="margin:0" id="tHint"></p></div></div>'+
    '<div class="tablewrap"><table><thead><tr><th data-sort="id">Case no.</th><th data-sort="date">Opened</th><th data-sort="type">Type</th><th data-sort="status">Status</th><th data-sort="account">Customer</th><th data-sort="province">Province</th><th data-sort="product">Product</th><th>Description</th><th style="text-align:right">Actions</th></tr></thead><tbody id="tbody"></tbody></table></div>'+
    '<div class="pager"><span id="pInfo"></span><div class="pb"><label style="display:flex;gap:6px;align-items:center">Rows <select id="pSize" style="width:auto;padding:5px 8px"><option>25</option><option>50</option><option>100</option></select></label><button class="btn" id="pPrev">Previous</button><span id="pNum"></span><button class="btn" id="pNext">Next</button></div></div></section>'+
  '<div id="banner"></div>';
  $('#fYear').onchange=function(e){S.f.year=e.target.value;S.page=0;render()};
  $('#fMonth').onchange=function(e){S.f.month=e.target.value;S.page=0;render()};
  $('#fStatus').onchange=function(e){S.f.status=e.target.value;S.page=0;render()};
  $('#fType').onchange=function(e){S.f.type=e.target.value;S.page=0;render()};
  $('#fProv').onchange=function(e){S.f.province=e.target.value;S.page=0;render()};
  var qt;$('#fQ').oninput=function(e){clearTimeout(qt);var v=e.target.value;qt=setTimeout(function(){S.f.q=v.trim();S.page=0;render()},180)};
  $('#fReset').onclick=function(){S.f={year:'',month:'',status:'',type:'',province:'',origin:'',ptype:'',q:''};$('#fQ').value='';S.page=0;render()};
  $('#active').onclick=function(e){var c=e.target.closest('[data-clear]');if(!c)return;S.f[c.getAttribute('data-clear')]='';S.page=0;render()};
  $('#pSize').onchange=function(e){PAGE=+e.target.value;S.page=0;renderTable()};
  $('thead').onclick=function(e){var th=e.target.closest('th[data-sort]');if(!th)return;var k=th.getAttribute('data-sort');
    S.sort=S.sort.k===k?{k:k,dir:-S.sort.dir}:{k:k,dir:(k==='date'?-1:1)};S.page=0;sortRows();renderTable()};
  $('#pPrev').onclick=function(){S.page--;renderTable()};$('#pNext').onclick=function(){S.page++;renderTable()};
  $('#tbody').onclick=function(e){var b=e.target.closest('[data-act]');
    if(b){var id=b.getAttribute('data-id');var act=b.getAttribute('data-act');if(act==='edit')openEditor(id);else if(act==='view')openDetail(id);else openDelete(id);return}
    var tr=e.target.closest('tr[data-id]');if(tr)openDetail(tr.getAttribute('data-id'))};
}
function fillSelect(id,opts,val,allLabel){
  var el=$(id);el.innerHTML='<option value="">'+allLabel+'</option>'+opts.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>'}).join('');el.value=val;
  if(el.value!==val){el.value='';}
}
var PAL=['#0a63c9','#f26a1b','#14a38b','#7a4fd1','#e0a800','#d6457a','#7b8ba1'];
function shade(h,f){var n=parseInt(h.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return 'rgb('+Math.round(r*f)+','+Math.round(g*f)+','+Math.round(b*f)+')'}
function pctTxt(x,n){var p=n?x/n*100:0;return (p>0&&p<1)?'<1%':Math.round(p)+'%'}
function pieData(rows,key,blank){
  var c=countBy(rows,key,blank),grouped=false;
  if(c.length>6){var rest=c.slice(5).reduce(function(a,x){return a+x[1]},0);c=c.slice(0,5).concat([['Other',rest]]);grouped=true}
  return {list:c,grouped:grouped};
}
function pieSvg(list,n,sel){
  if(!n)return '<div class="empty">No cases for this selection</div>';
  var cx=160,cy=84,rx=120,ry=62,h=26,P=function(a,dy){return [cx+rx*Math.cos(a),cy+ry*Math.sin(a)+(dy||0)]};
  var walls='',tops='',labels='',a=-Math.PI/2;
  list.forEach(function(x,i){
    var col=PAL[i%PAL.length],sw=2*Math.PI*x[1]/n,a0=a,a1=a+sw,dim=sel&&sel!==x[0]?' style="opacity:.4"':'',
        tip='<title>'+esc(x[0])+': '+fmtN(x[1])+' ('+pctTxt(x[1],n)+')</title>',
        k=' class="slice" data-v="'+esc(x[0])+'"';
    var lo=Math.max(a0,0),hi=Math.min(a1,Math.PI);
    if(sw>=2*Math.PI-1e-6){
      walls+='<path'+k+dim+' fill="'+shade(col,.68)+'" d="M'+(cx-rx)+' '+cy+'A'+rx+' '+ry+' 0 0 0 '+(cx+rx)+' '+cy+'L'+(cx+rx)+' '+(cy+h)+'A'+rx+' '+ry+' 0 0 1 '+(cx-rx)+' '+(cy+h)+'Z">'+tip+'</path>';
      tops+='<ellipse'+k+dim+' cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="'+col+'">'+tip+'</ellipse>';
    }else{
      if(lo<hi){var p1=P(lo),p2=P(hi),q1=P(lo,h),q2=P(hi,h);
        walls+='<path'+k+dim+' fill="'+shade(col,.68)+'" d="M'+p1[0]+' '+p1[1]+'A'+rx+' '+ry+' 0 0 1 '+p2[0]+' '+p2[1]+'L'+q2[0]+' '+q2[1]+'A'+rx+' '+ry+' 0 0 0 '+q1[0]+' '+q1[1]+'Z">'+tip+'</path>'}
      var s0=P(a0),s1=P(a1);
      tops+='<path'+k+dim+' fill="'+col+'" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" d="M'+cx+' '+cy+'L'+s0[0]+' '+s0[1]+'A'+rx+' '+ry+' 0 '+(sw>Math.PI?1:0)+' 1 '+s1[0]+' '+s1[1]+'Z">'+tip+'</path>';
    }
    if(x[1]/n>=.06){var m=(a0+a1)/2;labels+='<text x="'+(cx+rx*.62*Math.cos(m))+'" y="'+(cy+ry*.62*Math.sin(m)+4)+'" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" style="pointer-events:none;paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px">'+pctTxt(x[1],n)+'</text>'}
    a=a1;
  });
  return '<svg viewBox="0 0 320 '+(cy+ry+h+6)+'" role="img" aria-label="3D pie chart">'+walls+tops+labels+'</svg>';
}
function pieCard(title,pd,n,key,scope){
  var sel=S.f[key];
  var legend=pd.list.map(function(x,i){var nofilter=pd.grouped&&i===pd.list.length-1;
    return '<div class="prow'+(sel===x[0]?' on':'')+'"'+(nofilter?'':' data-k="'+key+'" data-v="'+esc(x[0])+'"')+'><i style="background:'+PAL[i%PAL.length]+'"></i><span class="nm" title="'+esc(x[0])+'">'+esc(x[0])+'</span><span class="ct"><b>'+fmtN(x[1])+'</b> · '+pctTxt(x[1],n)+'</span></div>'}).join('');
  return '<div class="panel pie" data-k="'+key+'"><h2>'+title+'</h2><p class="hint">'+scope+'</p>'+pieSvg(pd.list,n,sel)+'<div class="plegend">'+legend+'</div></div>';
}
function barCard(title,list,n,key,scope){
  var max=list.length?list[0][1]:1;
  return '<div class="panel"><h2>'+title+'</h2><p class="hint">'+scope+'</p><div class="bars">'+
    (list.length?list.slice(0,8).map(function(x){return '<div class="brow" '+(key?'data-k="'+key+'" data-v="'+esc(x[0])+'"':'')+'><span class="nm" title="'+esc(x[0])+'">'+esc(x[0])+'</span><span class="ct"><b>'+fmtN(x[1])+'</b> · '+pctTxt(x[1],n)+'</span><span class="track"><i style="width:'+(x[1]/max*100)+'%"></i></span></div>'}).join(''):'<div class="empty">No cases for this selection</div>')+'</div></div>';
}
function render(){
  var yrs={};S.rows.forEach(function(r){if(r.date)yrs[r.date.slice(0,4)]=1});
  var years=Object.keys(yrs).sort().reverse();
  if(S.f.year&&years.indexOf(S.f.year)<0)S.f.year='';
  var counts={};S.rows.forEach(function(r){if(match(r,true)){var k=monthOf(r);if(k)counts[k]=(counts[k]||0)+1}});
  fillSelect('#fYear',years.map(function(v){return [v,v]}),S.f.year,'All years');
  fillSelect('#fMonth',MONF.map(function(n,i){return [String(i+1).padStart(2,'0'),n]}),S.f.month,'All months');
  fillSelect('#fStatus',uniq('status').map(function(v){return [v,v]}),S.f.status,'All statuses');
  fillSelect('#fType',uniq('type').map(function(v){return [v,v]}),S.f.type,'All types');
  fillSelect('#fProv',uniq('province').map(function(v){return [v,v]}),S.f.province,'All provinces');
  $('#active').innerHTML=[['origin','Channel'],['ptype','Product type']].filter(function(x){return S.f[x[0]]}).map(function(x){
    return '<button class="achip" data-clear="'+x[0]+'">'+x[1]+': '+esc(S.f[x[0]])+' ×</button>'}).join('');

  var rows=S.rows.filter(function(r){return match(r,false)});
  S.filtered=rows;sortRows();
  var n=rows.length,res=rows.filter(function(r){return r.status==='Resolve'}).length,pen=rows.filter(function(r){return r.status==='Pending'}).length,
      cmp=rows.filter(function(r){return r.type==='Complaint'}).length;
  var scope=S.f.month?MONF[+S.f.month-1]+(S.f.year?' '+S.f.year:' (all years)'):S.f.year?S.f.year:'All time';
  $('#fCount').textContent=fmtN(n)+' of '+fmtN(S.rows.length)+' cases';
  var pc=function(x){return n?(x/n*100).toFixed(1)+'% of cases':''};
  $('#kpis').innerHTML=
    kpi('',ICON.total,'Total cases',fmtN(n),scope,spark(function(){return true}))+
    kpi('g',ICON.ok,'Total Resolved',fmtN(res),pc(res),spark(function(r){return r.status==='Resolve'}))+
    kpi('a',ICON.clock,'Total Pending',fmtN(pen),pc(pen),spark(function(r){return r.status==='Pending'}))+
    kpi('o',ICON.warn,'Complaints',fmtN(cmp),pc(cmp),spark(function(r){return r.type==='Complaint'}));
  renderTrend(counts);
  $('#breakdowns').innerHTML=
    pieCard('Case type',pieData(rows,'type'),n,'type',scope)+
    pieCard('Channel',pieData(rows,'origin','Unknown'),n,'origin',scope)+
    pieCard('Product type',pieData(rows,'ptype','Not specified'),n,'ptype',scope)+
    barCard('Top provinces',countBy(rows,'province','Unknown').slice(0,8),n,'province',scope)+
    barCard('Related section',countBy(rows,'section'),n,null,scope);
  $('#breakdowns').onclick=function(e){var r=e.target.closest('[data-v]');if(!r)return;
    var host=r.closest('[data-k]');var k=r.getAttribute('data-k')||(host&&host.getAttribute('data-k'));if(!k)return;
    var v=r.getAttribute('data-v');S.f[k]=(S.f[k]===v)?'':v;S.page=0;render()};
  renderTable();renderSync();
}
function sortRows(){
  var k=S.sort.k,d=S.sort.dir;
  S.filtered.sort(function(a,b){
    var x=a[k]||'',y=b[k]||'',c=x<y?-1:x>y?1:0;
    if(!c&&k!=='date')c=a.date<b.date?1:a.date>b.date?-1:0;
    if(!c)c=a.id<b.id?-1:a.id>b.id?1:0;
    return c*d});
}
function spark(pred){
  var last='';S.rows.forEach(function(r){var k=monthOf(r);if(k>last)last=k});
  var keys=[],y,m;
  if(S.f.year){for(m=1;m<=12;m++)keys.push(S.f.year+'-'+String(m).padStart(2,'0'))}
  else{y=+last.slice(0,4);m=+last.slice(5);for(var i=0;i<12;i++){keys.unshift(y+'-'+String(m).padStart(2,'0'));m--;if(m<1){m=12;y--}}}
  var c={};S.rows.forEach(function(r){if(match(r,true)&&pred(r)){var k=monthOf(r);c[k]=(c[k]||0)+1}});
  var v=keys.map(function(k){return c[k]||0}),mx=Math.max.apply(null,v.concat([1])),pts=v.map(function(n,i){return [i*(110/(v.length-1)),33-(n/mx)*29]});
  var line=pts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1)}).join(' ');
  return '<svg class="spark" viewBox="0 0 110 36" aria-hidden="true"><polygon points="0,36 '+line+' 110,36" fill="currentColor" opacity=".14"/><polyline points="'+line+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="'+pts[pts.length-1][0]+'" cy="'+pts[pts.length-1][1].toFixed(1)+'" r="3" fill="currentColor"/></svg>';
}
function kpi(c,ic,l,v,n,sp){return '<div class="panel kpi '+c+'"><div class="tag">'+ic+'</div><div class="lab">'+l+'</div><div class="val">'+v+'</div><div class="note">'+esc(n)+'</div>'+(sp||'')+'</div>'}

function renderTrend(counts){
  var box=$('#trendBox'),keys=Object.keys(counts).sort();
  if(!keys.length){box.innerHTML='<div class="empty">No cases match the filters</div>';$('#insights').innerHTML='';return}
  var axis=[],y,m;
  if(S.f.year){for(m=1;m<=12;m++)axis.push(S.f.year+'-'+String(m).padStart(2,'0'))}
  else{var a=keys[0].split('-').map(Number),z=keys[keys.length-1].split('-').map(Number);y=a[0];m=a[1];
    while(y<z[0]||(y===z[0]&&m<=z[1])){axis.push(y+'-'+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++}}}
  var W=Math.max(box.clientWidth||900,320),H=310,L=40,R=8,T=36,B=axis.length>14?50:32;
  var bw0=(W-L-R)/axis.length,dx=Math.min(10,Math.max(2,bw0*.3)),dy=dx*.6;
  var pw=W-L-R-dx,ph=H-T-B-dy,bw=pw/axis.length,floor=T+dy+ph;
  var mx=Math.max.apply(null,axis.map(function(k){return counts[k]||0}));
  var pk=axis.filter(function(k){return (counts[k]||0)===mx})[0],tot=axis.reduce(function(a,k){return a+(counts[k]||0)},0);
  $('#insights').innerHTML='<div><span>Peak month</span><b>'+monthLabel(pk)+' \u00b7 '+fmtN(mx)+' cases</b></div><div><span>Monthly average</span><b>'+(tot/axis.length).toFixed(1)+' cases</b></div><div><span>Months shown</span><b>'+axis.length+'</b></div><div><span>Total in view</span><b>'+fmtN(tot)+' cases</b></div>';
  var step=mx<=10?2:mx<=50?10:mx<=100?20:mx<=250?50:100,top=Math.ceil(mx/step)*step||step,g='';
  g+='<polygon points="'+L+','+floor+' '+(L+pw)+','+floor+' '+(L+pw+dx)+','+(floor-dy)+' '+(L+dx)+','+(floor-dy)+'" fill="#e3ecf8"/>';
  for(var t=0;t<=top;t+=step){var yy=floor-ph*t/top;g+='<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+yy+'" y2="'+yy+'" stroke="#d3deec"/><text x="'+(L-6)+'" y="'+(yy+4)+'" text-anchor="end" font-size="11" fill="#5b6f86">'+t+'</text>'}
  var rot=bw<24;
  axis.forEach(function(k,i){
    var v=counts[k]||0,h=ph*v/top,x=L+i*bw+bw*.15,w=bw*.7,yt=floor-h,sel=!!S.f.month&&k.slice(5)===S.f.month&&(!S.f.year||k.slice(0,4)===S.f.year);
    var F=sel?'#f26a1b':'#0a63c9',Sd=sel?'#c04e0c':'#084c9b',Tp=sel?'#ff9a58':'#4d95e8';
    g+='<g class="tr-bar" data-m="'+k+'"><title>'+monthLabel(k)+': '+v+' cases</title><rect x="'+(L+i*bw)+'" y="'+T+'" width="'+bw+'" height="'+(H-T)+'" fill="transparent"/>';
    if(v>0){
      g+='<polygon points="'+(x+w)+','+yt+' '+(x+w+dx)+','+(yt-dy)+' '+(x+w+dx)+','+(floor-dy)+' '+(x+w)+','+floor+'" fill="'+Sd+'"/>'+
         '<polygon points="'+x+','+yt+' '+(x+dx)+','+(yt-dy)+' '+(x+w+dx)+','+(yt-dy)+' '+(x+w)+','+yt+'" fill="'+Tp+'"/>'+
         '<rect x="'+x+'" y="'+yt+'" width="'+w+'" height="'+h+'" fill="'+F+'"/>';
      var lx=x+w/2+dx/2,ly=yt-dy-4;
      g+=rot?'<text transform="translate('+(lx+3)+','+ly+') rotate(-90)" font-size="10" font-weight="600" fill="#0b2a4a">'+v+'</text>'
            :'<text x="'+lx+'" y="'+ly+'" text-anchor="middle" font-size="11" font-weight="600" fill="#0b2a4a">'+v+'</text>';
    }
    g+='</g>';
    var mm=+k.slice(5),lbl=MON[mm-1]+(axis.length>12?' '+k.slice(2,4):'');
    g+=bw<40?'<text transform="translate('+(x+w/2+dx/2+3)+','+(floor+8)+') rotate(-90)" text-anchor="end" font-size="10" fill="#5b6f86">'+lbl+'</text>'
             :'<text x="'+(x+w/2+dx/2)+'" y="'+(floor+18)+'" text-anchor="middle" font-size="11" fill="#5b6f86">'+lbl+'</text>';
  });
  box.innerHTML='<svg id="trend" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="3D bar chart of cases per month">'+g+'</svg>';
  $('#trend').onclick=function(e){var b=e.target.closest('.tr-bar');if(!b)return;var k=b.getAttribute('data-m');if(S.f.month===k.slice(5)&&S.f.year===k.slice(0,4)){S.f.month=''}else{S.f.year=k.slice(0,4);S.f.month=k.slice(5)}S.page=0;render()};
}

function pill(c,t){return '<span class="pill '+esc(c)+'">'+esc(t)+'</span>'}
function renderTable(){
  var rows=S.filtered,n=rows.length,pages=Math.max(1,Math.ceil(n/PAGE));S.page=Math.min(Math.max(S.page,0),pages-1);
  var s=S.page*PAGE,slice=rows.slice(s,s+PAGE),ed=editedIds();
  $('#tbody').innerHTML=slice.length?slice.map(function(r){
    var dsc=(r.desc||'').replace(/\s+/g,' ').slice(0,140);
    return '<tr data-id="'+esc(r.id)+'"><td class="num">'+esc(r.id)+(ed.has(r.id)?'<span class="ed" title="Edited or added here"></span>':'')+'</td><td class="date">'+fmtDate(r.date)+'</td>'+
      '<td>'+pill('type '+r.type,r.type||'—')+'</td><td>'+pill(r.status,r.status||'—')+'</td>'+
      '<td title="'+esc(r.account)+'">'+esc(r.account)+'</td><td>'+esc(r.province)+'</td><td title="'+esc(r.product)+'">'+esc(r.product||r.ptype||'—')+'</td><td class="dsc" title="Select the row to read the full description">'+esc(dsc||'—')+'</td>'+
      '<td><div class="rowbtns"><button class="ib" data-act="view" data-id="'+esc(r.id)+'" aria-label="View case '+esc(r.id)+'" title="View details">'+ICON.eye+'</button>'+
      '<button class="ib" data-act="edit" data-id="'+esc(r.id)+'" aria-label="Edit case '+esc(r.id)+'" title="Edit">'+ICON.edit+'</button>'+
      '<button class="ib del" data-act="del" data-id="'+esc(r.id)+'" aria-label="Delete case '+esc(r.id)+'" title="Delete">'+ICON.del+'</button></div></td></tr>'}).join('')
    :'<tr><td colspan="9" class="empty">No cases match these filters.</td></tr>';
  $('#pInfo').textContent=n?('Showing '+fmtN(s+1)+'–'+fmtN(Math.min(s+PAGE,n))+' of '+fmtN(n)):'0 cases';
  $('#pNum').textContent='Page '+(S.page+1)+' / '+pages;$('#pPrev').disabled=S.page===0;$('#pNext').disabled=S.page>=pages-1;
  document.querySelectorAll('th[data-sort]').forEach(function(th){var on=th.getAttribute('data-sort')===S.sort.k;th.className=on?'sorted'+(S.sort.dir>0?' asc':''):''});
  $('#tHint').textContent='Sorted by '+({id:'case number',date:'opened date',type:'type',status:'status',account:'customer',province:'province',product:'product'}[S.sort.k])+'. Select a column title to sort. Select a row to read the full case description, the pencil to edit, or the bin to delete. Orange dot marks cases changed here.';
}
function renderSync(){
  var m=S.meta||{};
  $('#syncDate').textContent=fmtStamp(m.syncedAt);
  $('#syncMeta').textContent=(m.source||'')+' \u00b7 '+fmtN(S.rows.length)+' cases'+(S.lastEdit?' \u00b7 last edit '+fmtStamp(S.lastEdit):'');
  $('#foot').textContent='Source: '+(m.source||'')+' \u00b7 Synced '+fmtStamp(m.syncedAt)+' \u00b7 '+fmtN(S.rows.length)+' cases \u00b7 Edits and uploads are saved to Firebase and shared with everyone who opens this page';
  $('#syncDot').className='dot'+(S.dbOK?'':' off');
  $('#banner').innerHTML=S.dbOK?'':'<div class="banner">Not connected to Firebase (check the Firestore rules and your network). Edits stay on this page until you reload.</div>';
}

/* ---------- modal plumbing ---------- */
function openModal(html,cls){
  closeModal();var d=document.createElement('div');d.className='ov';d.innerHTML='<div class="modal '+(cls||'')+'" role="dialog" aria-modal="true">'+html+'</div>';
  d.addEventListener('mousedown',function(e){if(e.target===d&&!S.busy)closeModal()});$('#modalRoot').appendChild(d);return d;
}
function closeModal(){$('#modalRoot').innerHTML=''}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!S.busy)closeModal()});
var X='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/* ---------- writes ---------- */
function writeEdit(id,data){
  var did=docId(id);
  if(S.db){return S.db.collection('edits').doc(did).set(data).then(function(){S.edits.set(did,data);compute()})}
  S.edits.set(did,data);compute();return Promise.resolve();
}

/* ---------- add / edit ---------- */
var LISTS=[['dl_type','type'],['dl_origin','origin'],['dl_prov','province'],['dl_pt','ptype'],['dl_sec','section'],['dl_by','by']];
function openEditor(id){
  var rec=id?S.rows.find(function(r){return r.id===id}):null,isNew=!rec;
  rec=rec||{id:'',type:'Inquiry',origin:'Facebook',date:new Date().toISOString().slice(0,10),status:'Pending',account:'',province:'',ptype:'',product:'',shop:'',section:'CRM',by:'',desc:''};
  var dl=LISTS.map(function(l){return '<datalist id="'+l[0]+'">'+uniq(l[1]).map(function(v){return '<option value="'+esc(v)+'">'}).join('')+'</datalist>'}).join('');
  function inp(k,label,list,extra){return '<label>'+label+'<input type="text" id="e_'+k+'" value="'+esc(rec[k])+'"'+(list?' list="'+list+'"':'')+(extra||'')+'></label>'}
  var d=openModal('<div class="mh"><h3>'+(isNew?'Add case':'Edit case '+esc(rec.id))+'</h3><button class="ib" id="mx" aria-label="Close">'+X+'</button></div>'+
    '<form id="eform"><div class="mb"><div class="fgrid">'+
    inp('id','Case number',null,isNew?' required':' readonly style="opacity:.7"')+
    '<label>Opened date<input type="date" id="e_date" value="'+esc(rec.date)+'" required></label>'+
    inp('type','Case type','dl_type')+
    '<label>Status<select id="e_status"><option>Resolve</option><option>Pending</option></select></label>'+
    inp('account','Customer name')+inp('province','Province','dl_prov')+
    inp('origin','Channel','dl_origin')+inp('section','Related section','dl_sec')+
    inp('ptype','Product type','dl_pt')+inp('product','Product')+
    inp('shop','Shop name')+inp('by','Created by','dl_by')+
    '<label class="full">Case description<textarea id="e_desc">'+esc(rec.desc)+'</textarea></label>'+
    '</div><div class="err" id="eerr"></div></div>'+dl+
    '<div class="mf"><button type="button" class="btn" id="mc">Cancel</button><button type="submit" class="btn primary" id="ms">'+(isNew?'Add case':'Save changes')+'</button></div></form>');
  $('#e_status',d).value=rec.status||'Pending';
  $('#mx',d).onclick=$('#mc',d).onclick=closeModal;
  $('#eform',d).onsubmit=function(ev){ev.preventDefault();
    var r={};FIELDS.forEach(function(k){var el=$('#e_'+k,d);r[k]=(el.value||'').trim()});
    if(!isNew)r.id=rec.id;
    if(!r.id){$('#eerr',d).textContent='Enter a case number.';return}
    if(!r.date){$('#eerr',d).textContent='Choose the opened date.';return}
    if(isNew&&S.rows.some(function(x){return x.id===r.id})){$('#eerr',d).textContent='Case '+r.id+' already exists. Open it from the table to edit it.';return}
    r.province=normProvince(r.province);r.ptype=r.ptype.toUpperCase();
    var b=$('#ms',d);b.disabled=true;b.textContent='Saving\u2026';
    writeEdit(r.id,{id:r.id,rec:r,deleted:false,updatedAt:new Date().toISOString()}).then(function(){
      closeModal();render();toast(isNew?'Case '+r.id+' added':'Case '+r.id+' updated');
    }).catch(function(err){b.disabled=false;b.textContent=isNew?'Add case':'Save changes';$('#eerr',d).textContent='Could not save: '+((err&&err.message)||'check your access and try again')+'.'});
  };
  setTimeout(function(){var f=$(isNew?'#e_id':'#e_account',d);if(f)f.focus()},30);
}

/* ---------- case detail ---------- */
function openDetail(id){
  var r=S.rows.find(function(x){return x.id===id});if(!r)return;
  function it(l,v){return '<div><dt>'+l+'</dt><dd>'+(v?esc(v):'—')+'</dd></div>'}
  var d=openModal('<div class="mh"><h3>Case '+esc(r.id)+'</h3><button class="ib" id="mx" aria-label="Close">'+X+'</button></div><div class="mb">'+
    '<div style="margin-bottom:14px">'+pill('type '+r.type,r.type||'—')+' '+pill(r.status,r.status||'—')+'</div>'+
    '<dl class="dgrid">'+it('Opened',fmtDate(r.date))+it('Customer',r.account)+it('Province',r.province)+it('Channel',r.origin)+it('Product type',r.ptype)+it('Product',r.product)+it('Shop',r.shop)+it('Related section',r.section)+it('Created by',r.by)+'</dl>'+
    '<div class="dlab">Case description</div><div class="descbox">'+(r.desc?esc(r.desc):'No description recorded.')+'</div></div>'+
    '<div class="mf"><button class="btn danger" id="dd">Delete</button><button class="btn" id="mc">Close</button><button class="btn primary" id="de">Edit case</button></div>','lg');
  $('#mx',d).onclick=$('#mc',d).onclick=closeModal;
  $('#de',d).onclick=function(){openEditor(id)};$('#dd',d).onclick=function(){openDelete(id)};
}

/* ---------- delete ---------- */
function openDelete(id){
  var r=S.rows.find(function(x){return x.id===id});if(!r)return;
  var d=openModal('<div class="mh"><h3>Delete case '+esc(r.id)+'?</h3><button class="ib" id="mx" aria-label="Close">'+X+'</button></div><div class="mb"><p style="margin:0">This removes the case opened '+fmtDate(r.date)+' for <b>'+esc(r.account||'\u2014')+'</b> from the dashboard for everyone with access. The original Excel file is not changed.</p><div class="err" id="eerr"></div></div>'+
    '<div class="mf"><button class="btn" id="mc">Cancel</button><button class="btn solid-danger" id="md">Delete case</button></div>','sm');
  $('#mx',d).onclick=$('#mc',d).onclick=closeModal;
  $('#md',d).onclick=function(){var b=$('#md',d);b.disabled=true;b.textContent='Deleting\u2026';
    writeEdit(id,{id:id,deleted:true,updatedAt:new Date().toISOString()}).then(function(){closeModal();render();toast('Case '+id+' deleted')})
    .catch(function(err){b.disabled=false;b.textContent='Delete case';$('#eerr',d).textContent='Could not delete: '+((err&&err.message)||'check your access')+'.'})};
}

/* ---------- upload / update from Excel ---------- */
function openUpload(){
  var parsed=null,mode='merge';
  var d=openModal('<div class="mh"><h3>Upload Excel</h3><button class="ib" id="mx" aria-label="Close">'+X+'</button></div><div class="mb">'+
    '<div class="drop" id="drop"><b>Choose a file or drop it here</b>.xlsx, .xls or .csv with the same columns as Case_Report.xlsx<input type="file" id="file" accept=".xlsx,.xls,.csv" hidden></div>'+
    '<div id="usum"></div><div class="err" id="eerr"></div><div class="prog" id="prog" hidden><i></i></div></div>'+
    '<div class="mf"><button class="btn" id="mc">Cancel</button><button class="btn primary" id="go" disabled>Update dashboard</button></div>');
  $('#mx',d).onclick=$('#mc',d).onclick=function(){if(!S.busy)closeModal()};
  var drop=$('#drop',d),file=$('#file',d);
  drop.onclick=function(){file.click()};
  drop.ondragover=function(e){e.preventDefault();drop.classList.add('over')};drop.ondragleave=function(){drop.classList.remove('over')};
  drop.ondrop=function(e){e.preventDefault();drop.classList.remove('over');if(e.dataTransfer.files[0])read(e.dataTransfer.files[0])};
  file.onchange=function(){if(file.files[0])read(file.files[0])};
  function read(f){
    $('#eerr',d).textContent='';$('#usum',d).innerHTML='<div class="sum">Reading '+esc(f.name)+'\u2026</div>';
    var fr=new FileReader();fr.onerror=function(){$('#eerr',d).textContent='Could not read that file.'};
    fr.onload=function(){try{
      if(!window.XLSX)throw new Error('The Excel reader did not load. Check your connection and try again.');
      var wb=XLSX.read(new Uint8Array(fr.result),{type:'array',cellDates:true});
      var ws=wb.Sheets[wb.SheetNames[0]],json=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true,cellDates:true});
      if(!json.length)throw new Error('The first sheet has no rows.');
      var keys=Object.keys(json[0]);
      if(keys.indexOf('Case Number')<0||keys.indexOf('Opened Date')<0)throw new Error('Columns "Case Number" and "Opened Date" are required. Found: '+keys.slice(0,6).join(', ')+'\u2026');
      var seen={},rows=[],bad=0;
      json.forEach(function(o){
        var id=String(o['Case Number']==null?'':o['Case Number']).trim(),dt=parseDate(o['Opened Date']);
        if(!id||!dt){bad++;return}
        seen[id]=1;
        rows.push({id:id,type:tcase(o['Case Type']),origin:normOrigin(o['Case Origin']),date:dt,status:tcase(o['Status']),account:tcase(o['Account Name']),
          province:normProvince(o['Province (ID)']),ptype:tcase(o['Product Type']).toUpperCase(),product:tcase(o['Product']),shop:tcase(o['Shop Name']),
          desc:cleanDesc(o['Case Description']),section:tcase(o['Related Section']),by:tcase(o['Created By'])});
      });
      var uniqRows=Object.keys(seen).length;
      var map={};rows.forEach(function(r){map[r.id]=r});rows=Object.keys(map).map(function(k){return map[k]});
      var cur={};S.rows.forEach(function(r){cur[r.id]=1});
      var nNew=rows.filter(function(r){return !cur[r.id]}).length;
      parsed={rows:rows,name:f.name,nNew:nNew,nUpd:rows.length-nNew};
      sumHtml(bad);$('#go',d).disabled=false;
    }catch(err){parsed=null;$('#go',d).disabled=true;$('#usum',d).innerHTML='';$('#eerr',d).textContent=err.message||String(err)}};
    fr.readAsArrayBuffer(f);
  }
  function sumHtml(bad){
    $('#usum',d).innerHTML='<div class="sum"><b>'+esc(parsed.name)+'</b><br><b>'+fmtN(parsed.rows.length)+'</b> cases found \u00b7 <b>'+fmtN(parsed.nNew)+'</b> new \u00b7 <b>'+fmtN(parsed.nUpd)+'</b> already in the dashboard'+(bad?' \u00b7 '+bad+' rows skipped (missing case number or date)':'')+'</div>'+
    '<label class="radio '+(mode==='merge'?'on':'')+'"><input type="radio" name="mode" value="merge" '+(mode==='merge'?'checked':'')+'><span><b>Add and update</b><br>Keep current cases, add new ones, overwrite matching case numbers.</span></label>'+
    '<label class="radio '+(mode==='replace'?'on':'')+'"><input type="radio" name="mode" value="replace" '+(mode==='replace'?'checked':'')+'><span><b>Replace everything</b><br>Dashboard shows only the cases in this file.</span></label>';
    d.querySelectorAll('input[name=mode]').forEach(function(r){r.onchange=function(){mode=r.value;sumHtml(bad)}});
  }
  $('#go',d).onclick=function(){
    if(!parsed)return;if(!S.db){$('#eerr',d).textContent='Not connected to Firebase, so the upload cannot be saved.';return}
    var rows;if(mode==='replace'){rows=parsed.rows}else{var m=new Map();S.rows.forEach(function(r){m.set(r.id,r)});parsed.rows.forEach(function(r){m.set(r.id,r)});rows=Array.from(m.values())}
    S.busy=true;$('#go',d).disabled=true;$('#mc',d).disabled=true;$('#prog',d).hidden=false;$('#go',d).textContent='Saving\u2026';
    saveDataset(rows,parsed.name,function(p){$('#prog i',d).style.width=Math.round(p*100)+'%'}).then(function(){
      S.busy=false;closeModal();render();toast('Dashboard updated from '+parsed.name)
    }).catch(function(err){S.busy=false;$('#go',d).disabled=false;$('#mc',d).disabled=false;$('#go',d).textContent='Update dashboard';
      $('#eerr',d).textContent='Upload could not be saved: '+((err&&err.message)||'try again')+'.'});
  };
}
function chunkRows(rows){
  var out=[],cur=[],size=0;
  rows.forEach(function(r){var s=JSON.stringify(r).length*2.2;if(size+s>150000&&cur.length){out.push(cur);cur=[];size=0}cur.push(r);size+=s});
  if(cur.length)out.push(cur);return out;
}
function saveDataset(rows,source,onP){
  var gen=Date.now().toString(36),chunks=chunkRows(rows),oldGen=S.baseGen,total=chunks.length+2,done=0;
  function tick(){done++;onP(done/total)}
  var p=Promise.resolve();
  chunks.forEach(function(c,i){p=p.then(function(){return S.db.collection('ds_'+gen).doc('c'+String(i).padStart(3,'0')).set({rows:c}).then(tick)})});
  return p.then(function(){
    var meta={gen:gen,chunks:chunks.length,rows:rows.length,source:source,syncedAt:new Date().toISOString()};
    return S.db.doc('meta/dataset').set(meta).then(function(){S.meta=meta;S.base=rows;S.baseGen=gen;tick()});
  }).then(function(){
    var q=Promise.resolve();
    Array.from(S.edits.keys()).forEach(function(k){q=q.then(function(){return S.db.collection('edits').doc(k).delete()})});
    return q.then(function(){S.edits=new Map();compute()});
  }).then(function(){
    if(!oldGen)return;
    return S.db.collection('ds_'+oldGen).get().then(function(s){var q=Promise.resolve();s.docs.forEach(function(d){q=q.then(function(){return S.db.collection('ds_'+oldGen).doc(d.id).delete()})});return q}).catch(function(){});
  });
}

/* ---------- export ---------- */
function exportCsv(){
  var H=['Case Number','Case Type','Case Origin','Opened Date','Status','Account Name','Province','Product Type','Product','Shop Name','Case Description','Related Section','Created By'];
  var K=['id','type','origin','date','status','account','province','ptype','product','shop','desc','section','by'];
  function q(v){v=String(v==null?'':v);return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
  var csv='﻿'+H.join(',')+'\r\n'+S.filtered.map(function(r){return K.map(function(k){return q(r[k])}).join(',')}).join('\r\n');
  if(!S.dl){toast('Download is not available in this view');return}
  S.dl.save({filename:'case-report-'+(S.f.month||'all')+'.csv',data:csv}).then(function(){toast('Exported '+fmtN(S.filtered.length)+' cases')}).catch(function(e){if(e&&e.code!=='declined'&&e.code!=='dismissed')toast('Export was not saved')});
}

/* ---------- boot ---------- */
shell();
$('#btnAdd').onclick=function(){openEditor(null)};$('#btnUpload').onclick=openUpload;$('#btnExport').onclick=exportCsv;
var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){if(S.rows.length)render()},150)});

Promise.all([fetch('data/data.json').then(function(r){return r.json()}),fetch('data/meta.json').then(function(r){return r.json()})]).then(function(a){
  S.base=a[0];S.meta=a[1];compute();render();connect();
}).catch(function(){$('#app').innerHTML='<div class="panel load">The case data could not be loaded. Reload the page to try again.</div>'});

function connect(){
  if(!window.CaseServices){window.addEventListener('services-ready',connect,{once:true});return}
  CaseServices.use('downloads').then(function(d){S.dl=d}).catch(function(){});
  CaseServices.use('db').then(function(db){
    if(!db)return;S.db=db;S.dbOK=true;renderSync();
    db.collection('edits').onSnapshot(function(snap){
      var m=new Map();snap.docs.forEach(function(d){m.set(d.id,d.data())});S.edits=m;compute();render();
    },function(){S.dbOK=false;renderSync()});
    db.doc('meta/dataset').onSnapshot(function(snap){
      if(!snap.exists){return}
      var meta=snap.data();if(!meta||meta.gen===S.baseGen)return;
      db.collection('ds_'+meta.gen).get().then(function(qs){
        var rows=[];qs.docs.forEach(function(d){(d.data().rows||[]).forEach(function(r){rows.push(r)})});
        S.base=rows;S.meta=meta;S.baseGen=meta.gen;compute();render();
      });
    },function(){});
  }).catch(function(){});
}
})();
