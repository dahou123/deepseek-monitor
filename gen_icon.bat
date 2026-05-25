@echo off
echo 正在生成 DeepSeek Monitor 图标...
cd /d "C:\Users\DaHou\Desktop\OH-WorkSpace\deepseek-monitor"
node -e "
var fs=require('fs'),z=require('zlib');
function png(s,r,g,b){
  var cx=s/2,cy=s/2,rad=s/2-1,rl=1+s*4,raw=Buffer.alloc(rl*s);
  for(var y=0;y<s;y++)for(var x=0;x<s;x++){
    var d=Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy));
    if(d<=rad){
      var a=d>rad-1.5?Math.max(0,Math.min(255,Math.round((rad-d)*255/1.5))):255;
      var i=y*rl+1+x*4;raw[i]=r;raw[i+1]=g;raw[i+2]=b;raw[i+3]=a;
    }
  }
  var ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(s,0);ihdr.writeUInt32BE(s,4);ihdr[8]=8;ihdr[9]=6;
  var cmp=z.deflateSync(raw,{level:1});
  function ch(t,d){
    var l=Buffer.alloc(4);l.writeUInt32BE(d.length);
    var td=Buffer.concat([Buffer.from(t),d]),c=0xffffffff;
    for(var i=0;i<td.length;i++){c^=td[i];for(var j=0;j<8;j++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}
    var cb=Buffer.alloc(4);cb.writeUInt32BE((c^0xffffffff)>>>0);
    return Buffer.concat([l,Buffer.from(t),d,cb]);
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ihdr),ch('IDAT',cmp),ch('IEND',Buffer.alloc(0))]);
}
var ss=[16,32,48,64],ps=ss.map(function(s){return png(s,79,107,237);}),off=6+ss.length*16,ents=[];
for(var i=0;i<ss.length;i++){
  var e=Buffer.alloc(16);e[0]=ss[i];e[1]=ss[i];e[4]=1;e[5]=32;
  e.writeUInt32LE(ps[i].length,8);e.writeUInt32LE(off,12);off+=ps[i].length;ents.push(e);
}
var h=Buffer.alloc(6);h[2]=1;h.writeUInt16LE(ss.length,4);
fs.writeFileSync('icon.ico',Buffer.concat([h].concat(ents).concat(ps)));
console.log('图标已生成: icon.ico');
"
pause
