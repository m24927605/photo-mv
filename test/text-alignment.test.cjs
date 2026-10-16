const {test}=require('node:test'),assert=require('node:assert/strict'),{move}=require('../src/text-alignment.js');
const text={x:.1,y:.1},bounds={width:.2,height:.1},targets={x:[0,1/3,.5,2/3,1,.73],y:[0,1/3,.5,2/3,1,.81]};
test('文字左中右與上中下可對齊畫面及其他文字，兩方向獨立',()=>{
 let r=move(text,.303,.348,bounds,targets,{x:.01,y:.01});assert.equal(r.text.x,.4);assert.equal(r.text.y,.45);assert.equal(r.vertical,.5);assert.equal(r.horizontal,.5);
 r=move(text,.629,.709,bounds,targets,{x:.01,y:.01});assert.equal(r.text.x,.73);assert.equal(r.text.y,.81);assert.equal(r.vertical,.73);assert.equal(r.horizontal,.81);
 r=move(text,.1,.1,bounds,targets,{x:.005,y:.005});assert.equal(r.text.x,.2);assert.equal(r.text.y,.2);assert.equal(r.vertical,null);assert.equal(r.horizontal,null);
});
test('停用吸附仍維持邊界，過大文字不產生負座標',()=>{
 let r=move(text,.303,.348,bounds,targets,{x:0,y:0});assert.equal(r.text.x,.403);assert.equal(r.vertical,null);
 r=move(text,5,-5,bounds,targets,{x:.01,y:.01});assert.equal(r.text.x,.8);assert.equal(r.text.y,0);
 r=move(text,1,1,{width:2,height:2},targets,{x:.01,y:.01});assert.equal(r.text.x,0);assert.equal(r.text.y,0);
});
