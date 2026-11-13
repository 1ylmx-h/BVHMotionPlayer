// BVH hierarchy parser and quaternion forward kinematics. No rendering dependency.
export function parseBVH(text) {
  const t=text.replace(/\r/g,'').match(/[{}]|[^\s{}]+/g)||[]; let i=0, channels=0; const nodes=[];
  const take=()=>{if(i>=t.length)throw Error('文件提前结束');return t[i++];};
  const expect=s=>{if(take()!==s)throw Error('BVH 格式错误，应为 '+s);};
  const number=()=>{const n=Number(take());if(!Number.isFinite(n))throw Error('存在无效数值');return n;};
  function node(parent,end=false){
    if(nodes.length>512)throw Error('关节过多（最多512）');
    const n={name:end?'End Site':take(),parent,offset:[],channels:[],start:channels}; const id=nodes.push(n)-1;
    expect('{');expect('OFFSET');n.offset=[number(),number(),number()];
    if(!end){expect('CHANNELS');const count=number();if(!Number.isInteger(count)||count<0||count>6)throw Error('无效 CHANNELS');
      for(let j=0;j<count;j++){const c=take();if(!/^[XYZ](position|rotation)$/.test(c))throw Error('不支持通道 '+c);n.channels.push(c);}channels+=count;
      while(t[i]!=='}'){const kind=take();if(kind==='JOINT')node(id);else if(kind==='End'){expect('Site');node(id,true);}else throw Error('未知层级 '+kind);}}
    expect('}');return id;
  }
  expect('HIERARCHY');expect('ROOT');node(-1);expect('MOTION');expect('Frames:');const frames=number();expect('Frame');expect('Time:');const frameTime=number();
  if(!Number.isInteger(frames)||frames<1||frameTime<=0||frames*channels>1e7)throw Error('无效或过大的动作数据');
  const values=new Float64Array(frames*channels);for(let j=0;j<values.length;j++)values[j]=number();if(i!==t.length)throw Error('帧数和通道数据不匹配');
  return {nodes,channels,frames,frameTime,duration:frames*frameTime,values};
}
const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rotate=(q,v)=>mul(mul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
function slerp(a,b,t){let d=a.reduce((s,v,i)=>s+v*b[i],0);if(d<0){b=b.map(v=>-v);d=-d;}if(d>.9995){const q=a.map((v,i)=>v+(b[i]-v)*t),l=Math.hypot(...q);return q.map(v=>v/l);}const r=Math.acos(Math.min(1,d)),s=Math.sin(r);return a.map((v,i)=>(v*Math.sin((1-t)*r)+b[i]*Math.sin(t*r))/s);}
function local(b,n,frame){let p=n.offset.slice(),q=[0,0,0,1];n.channels.forEach((c,j)=>{const k='XYZ'.indexOf(c[0]),v=b.values[frame*b.channels+n.start+j];if(c.endsWith('position'))p[k]+=v;else{const r=[0,0,0,Math.cos(v*Math.PI/360)];r[k]=Math.sin(v*Math.PI/360);q=mul(q,r);}});return {p,q};}
export function poseAt(b,time,loop=true){
  time=loop?((time%b.duration)+b.duration)%b.duration:Math.max(0,Math.min(time,(b.frames-1)*b.frameTime));
  const f=time/b.frameTime,a=Math.floor(f),z=loop?(a+1)%b.frames:Math.min(a+1,b.frames-1),u=f-a,out=[];
  for(const n of b.nodes){const l=local(b,n,a),r=local(b,n,z),p=l.p.map((v,i)=>v+(r.p[i]-v)*u),q=slerp(l.q,r.q,u);if(n.parent<0)out.push({p,q});else{const par=out[n.parent],v=rotate(par.q,p);out.push({p:v.map((x,i)=>x+par.p[i]),q:mul(par.q,q)});}}return out;
}
