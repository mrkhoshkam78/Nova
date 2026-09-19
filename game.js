(()=>{'use strict';
const c=document.querySelector('#world'),ctx=c.getContext('2d'),$=id=>document.getElementById(id);
let diamonds=750,stone=420,tokens=12,troops=4,level=1,rot=0,zoom=1,chosen='diamondmine',mode='build',enemyHP=140;
const defs={townhall:{name:'مرکز فرماندهی',cost:0,color:'#c48b4a',h:58,icon:'🏰'},diamondmine:{name:'معدن الماس',cost:120,color:'#48d7db',h:35,icon:'💎'},stonepit:{name:'معدن سنگ',cost:100,color:'#9ba5a2',h:32,icon:'🪨'},barracks:{name:'پادگان',cost:180,color:'#b77d4d',h:43,icon:'⚔'},cannon:{name:'برج دفاعی',cost:150,color:'#7b8e88',h:42,icon:'🛡'},wall:{name:'دیوار سنگی',cost:25,color:'#9da99d',h:17,icon:'🧱'}};
let buildings=[{type:'townhall',x:0,z:0},{type:'diamondmine',x:-2,z:-1},{type:'stonepit',x:2,z:-1},{type:'barracks',x:-2,z:2},{type:'cannon',x:2,z:2},{type:'wall',x:-1,z:3},{type:'wall',x:0,z:3},{type:'wall',x:1,z:3}];
function project(a,b,y=0){const A=rot*Math.PI/2,u=a*Math.cos(A)-b*Math.sin(A),v=a*Math.sin(A)+b*Math.cos(A),s=Math.min(c.clientWidth,c.clientHeight)*.075*zoom;return{x:c.clientWidth*.5+(u-v)*s*.95,y:c.clientHeight*.49+(u+v)*s*.46-y*zoom}}
function polygon(points,fill,stroke='#435c3e'){ctx.beginPath();points.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}
function isoTile(a,b,color){polygon([project(a,b),project(a+1,b),project(a+1,b+1),project(a,b+1)],color,'#688b51')}
function drawTree(a,b){const q=project(a,b);ctx.fillStyle='#684b31';ctx.fillRect(q.x-3,q.y-13,6,19);for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(q.x,q.y-19-i*8,13-i*2,0,Math.PI*2);ctx.fillStyle=['#315f38','#3d7540','#548848'][i];ctx.fill();ctx.strokeStyle='#274b30';ctx.stroke()}}
function drawRock(a,b){const q=project(a,b);polygon([{x:q.x-12,y:q.y},{x:q.x-7,y:q.y-12},{x:q.x+5,y:q.y-16},{x:q.x+13,y:q.y-5},{x:q.x+10,y:q.y+3},{x:q.x-6,y:q.y+5}],'#8e9992','#53645c')}
function drawBuilding(o){const q=project(o.x,o.z),d=defs[o.type],w=o.type==='wall'?28:39,h=d.h*zoom;
if(o.type==='wall'){polygon([{x:q.x-w/2,y:q.y-7*zoom},{x:q.x,y:q.y-14*zoom},{x:q.x+w/2,y:q.y-7*zoom},{x:q.x,y:q.y}],'#a9b7aa');polygon([{x:q.x-w/2,y:q.y-7*zoom},{x:q.x,y:q.y},{x:q.x,y:q.y+8*zoom},{x:q.x-w/2,y:q.y+1*zoom}],'#788d81');return}
polygon([{x:q.x-w/2,y:q.y-h*.35},{x:q.x,y:q.y-h*.35+13*zoom},{x:q.x,y:q.y+13*zoom},{x:q.x-w/2,y:q.y}],'#765b3d');
polygon([{x:q.x,y:q.y-h*.35+13*zoom},{x:q.x+w/2,y:q.y-h*.35},{x:q.x+w/2,y:q.y},{x:q.x,y:q.y+13*zoom}],'#5d4934');
polygon([{x:q.x-w/2,y:q.y-h*.35},{x:q.x,y:q.y-h*.35-14*zoom},{x:q.x+w/2,y:q.y-h*.35},{x:q.x,y:q.y-h*.35+13*zoom}],d.color,'#493f2b');
ctx.fillStyle='#fff2c5';ctx.textAlign='center';ctx.font=`${Math.max(10,12*zoom)}px system-ui`;ctx.fillText(d.icon,q.x,q.y-h*.48);
if(o.type==='townhall'){ctx.fillStyle='#7d3026';ctx.fillRect(q.x-5*zoom,q.y-h*.6,10*zoom,20*zoom);ctx.fillStyle='#e3bd62';ctx.fillRect(q.x-2*zoom,q.y-h*.52,4*zoom,7*zoom)}
}
function draw(){if(!c.clientWidth||!c.clientHeight)return;ctx.clearRect(0,0,c.clientWidth,c.clientHeight);
const g=ctx.createLinearGradient(0,0,0,c.clientHeight);g.addColorStop(0,'#a6c987');g.addColorStop(1,'#47784a');ctx.fillStyle=g;ctx.fillRect(0,0,c.clientWidth,c.clientHeight);
for(let a=-11;a<11;a++)for(let b=-11;b<11;b++)isoTile(a,b,(a+b)%2?'#82ad68':'#8db674');
for(let i=-9;i<=9;i++){drawTree(i,-9);drawTree(i,9);if(i%2===0){drawTree(-9,i);drawTree(9,i)}}
[[-5,-3],[-4,4],[5,-4],[6,3],[-6,1],[4,6]].forEach(v=>drawRock(...v));
buildings.slice().sort((a,b)=>(a.x+a.z)-(b.x+b.z)).forEach(drawBuilding);
const center=project(0,0);ctx.beginPath();ctx.ellipse(center.x,center.y+15,100*zoom,35*zoom,0,0,Math.PI*2);ctx.strokeStyle='#d8d7a5aa';ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);
}
function update(){ $('diamonds').textContent=Math.floor(diamonds);$('stone').textContent=Math.floor(stone);$('tokens').textContent=tokens;$('level').textContent=level;$('troops').textContent=troops}
function message(t){$('msg').textContent=t}
function save(){localStorage.setItem('kingdomForgeV2',JSON.stringify({diamonds,stone,tokens,troops,level,rot,zoom,buildings}));message('پیشرفت با موفقیت ذخیره شد ✓')}
try{const s=JSON.parse(localStorage.getItem('kingdomForgeV2'));if(s)({diamonds,stone,tokens,troops,level,rot,zoom,buildings}=s)}catch(e){}
document.querySelectorAll('[data-type]').forEach(btn=>btn.addEventListener('click',()=>{chosen=btn.dataset.type;mode='build';message('برای ساخت '+defs[chosen].name+' یک خانه خالی روی زمین انتخاب کن')}));
c.addEventListener('pointerdown',e=>{if(mode!=='build')return;const r=c.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;let best=null,dist=Infinity;for(let a=-10;a<=10;a++)for(let b=-10;b<=10;b++){const q=project(a,b),d=Math.hypot(q.x-mx,q.y-my);if(d<dist){dist=d;best={x:a,z:b}}}if(dist>Math.max(28,38*zoom))return;if(buildings.some(o=>o.x===best.x&&o.z===best.z))return message('این خانه اشغال است!');const cost=defs[chosen].cost;if(diamonds<cost)return message('الماس کافی نداری!');diamonds-=cost;buildings.push({type:chosen,...best});update();draw();message(defs[chosen].name+' ساخته شد')});
$('left').onclick=()=>{rot=(rot+3)%4;draw()};$('right').onclick=()=>{rot=(rot+1)%4;draw()};$('plus').onclick=()=>{zoom=Math.min(1.65,zoom+.12);draw()};$('minus').onclick=()=>{zoom=Math.max(.55,zoom-.12);draw()};
$('train').onclick=()=>{if(stone<50)return message('سنگ کافی نداری!');stone-=50;troops++;update();message('نیرو آموزش دید؛ تعداد نیروها: '+troops)};
$('attack').onclick=()=>{mode='battle';$('battleText').textContent=`نیروهای آماده: ${troops} | سلامت دشمن: ${enemyHP}`;$('modal').classList.remove('hide')};
$('retreat').onclick=()=>{$('modal').classList.add('hide');mode='build'};
$('launch').onclick=()=>{if(!troops)return $('battleText').textContent='نیرویی برای اعزام نداری!';enemyHP=Math.max(0,enemyHP-troops*24);troops=Math.max(0,troops-1);if(enemyHP===0){const loot=100+Math.floor(Math.random()*180);diamonds+=loot;stone+=75;level++;enemyHP=140;$('battleText').textContent=`پیروزی! ${loot} الماس و ۷۵ سنگ به دست آوردی. سطح ${level}`}else $('battleText').textContent=`سلامت دشمن: ${enemyHP} | نیروهای باقی‌مانده: ${troops}`;update()};
$('save').onclick=save;$('menu').onclick=()=>$('drawer').classList.remove('hide');$('close').onclick=()=>$('drawer').classList.add('hide');$('reset').onclick=()=>{if(confirm('همه پیشرفت ذخیره‌شده پاک شود؟')){localStorage.removeItem('kingdomForgeV2');location.reload()}};
setInterval(()=>{diamonds+=buildings.filter(o=>o.type==='diamondmine').length*2;stone+=buildings.filter(o=>o.type==='stonepit').length*2;update()},1000);
function resize(){const d=Math.min(window.devicePixelRatio||1,2);c.width=Math.floor(c.clientWidth*d);c.height=Math.floor(c.clientHeight*d);ctx.setTransform(d,0,0,d,0,0);draw()}window.addEventListener('resize',resize);update();resize();
})();